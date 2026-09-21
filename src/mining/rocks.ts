import { Entity, engine, GltfContainer, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { MINE_FACING_DEGREES, MINE_REACH_METERS, ORE_PER_ROCK, SWING_SECONDS } from '../shared/economy/constants'
import { getCarryCapacity, getHitsPerRock, sendRockDone, sendSwing } from '../net/economy-link'
import { getOre } from '../shared/state/wallet'
import { startMineEmote, stopMineEmote } from '../player/mine-emote'
import { playSfx } from '../world/sfx'
import { showOrePopup } from '../ui/ore-popup'
import { ActiveRock } from '../shared/net/rock-sync'

// Manual mining (design/balance.md §2, 2026-09-17). No timing bar: there is one rock, and it
// shows up at a random spot inside `Mining_Area` — a box or plane mesh authored in the Creator
// Hub, stretched over the ground where rocks may appear, and hidden at load. Walk up to the
// rock and the swings start on their own; every swing is one hit, and when the hits the pick
// needs are in, the rock pays and moves somewhere else in the area.
//
// Which rock is showing is the town's, not the player's: the server names it (ActiveRock), so
// everybody is at the same one, and a paid rock moves it for everybody. The hits are still each
// player's own. The payout is the server's too: finishing a rock only asks for it.
//
// Hiding is done by scaling to zero rather than with VisibilityComponent: an invisible model
// still collides, and a rock you cannot see should not block you.

const MINING_AREA_NAME = 'Mining_Area'

const ROCK_MODEL = 'assets/models/mining-rocks.glb'

const ROCK_DONE_SOUND = 'assets/sounds/match.mp3'

// The pick striking stone, one per hit. Played from here rather than baked into the emote: the
// hit lands when the swing's timer runs out, which is the moment this code knows about and the
// emote does not — and it keeps the volume and the clip tunable without re-exporting the GLB.
const HIT_SOUND = 'assets/sounds/picking.mp3'

/** The area's world transform, read once at load. The rock is placed on its bottom face. */
type Area = { position: Vector3; rotation: Quaternion; scale: Vector3; isPlane: boolean }

/** What the HUD draws under itself while mining. Null while there is nothing to say. */
export type MiningStatus = { hits: number; needed: number; blocked: string }

let status: MiningStatus | null = null

/** The mining bar's state, for the UI. Null means draw nothing. */
export function getMiningStatus(): MiningStatus | null {
  return status
}

/**
 * Below this speed the player counts as standing still, in metres per second.
 *
 * Swings only start once they have stopped. An emote fired while the avatar is still walking is
 * cut short by the locomotion it is competing with, which is what ate the first swing of every
 * rock: ten hits, nine animations.
 */
const STANDING_SPEED = 0.3

let area: Area | null = null
let rock: Entity | null = null
let rockSpot: Vector3 = Vector3.Zero()
let lastPosition: Vector3 | null = null
let standing = false
let hits = 0

/** Whether the rock has been put anywhere yet. */
let placed = false

/** The ActiveRock seq on screen. -1 until the server's rock has been seen. */
let shownSeq = -1

/**
 * The seq of the rock this player last finished. Each rock is mined once per player, so it
 * stays hidden for them until the server moves it — which, with company, waits until everyone
 * on it is done.
 */
let finishedSeq = -2

/**
 * Seconds left before a finished rock comes back when there is no server to move it (shownSeq
 * still -1). Offline only; online the rock waits for the move however long it takes.
 */
const OFFLINE_RESHOW_SECONDS = 3
let offlineReshow = -1

/** Seconds until the swing in progress lands. Negative while not swinging. */
let swingTimer = -1

/** An entity's transform in world space, through however many parents it has. */
function worldTransform(entity: Entity): { position: Vector3; rotation: Quaternion; scale: Vector3 } {
  const t = Transform.get(entity)
  let position = Vector3.clone(t.position)
  let rotation = Quaternion.create(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
  let scale = Vector3.clone(t.scale)
  let parent = t.parent
  while (parent !== undefined && parent !== engine.RootEntity) {
    const p = Transform.getOrNull(parent)
    if (p === null) break
    const pr = p.rotation ?? Quaternion.Identity()
    position = Vector3.add(p.position, Vector3.rotate(Vector3.multiply(position, p.scale), pr))
    rotation = Quaternion.multiply(pr, rotation)
    scale = Vector3.multiply(scale, p.scale)
    parent = p.parent
  }
  return { position, rotation, scale }
}

function findArea(): void {
  const entity = engine.getEntityOrNullByName(MINING_AREA_NAME)
  if (entity === null) {
    console.error(`[mine] no entity named "${MINING_AREA_NAME}" in the scene — nothing to mine`)
    return
  }

  // A plane primitive lies in its local X/Y (turned flat in the editor); a box spans X/Z.
  const mesh = MeshRenderer.getOrNull(entity)
  const isPlane = mesh?.mesh?.$case === 'plane'
  area = { ...worldTransform(entity), isPlane }

  // The area is only a marker: nothing of it is seen or collides at runtime.
  Transform.getMutable(entity).scale = Vector3.Zero()
  MeshCollider.deleteFrom(entity)

  rock = engine.addEntity()
  Transform.create(rock, { scale: Vector3.Zero() })
  GltfContainer.create(rock, { src: ROCK_MODEL, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 3 })
}

/** A point of the area from its 0..1 fractions, on the area's bottom (the ground under it). */
function areaPoint(u: number, v: number): Vector3 {
  const a = area!
  const local = a.isPlane ? Vector3.create(u - 0.5, v - 0.5, 0) : Vector3.create(u - 0.5, -0.5, v - 0.5)
  return Vector3.add(a.position, Vector3.rotate(Vector3.multiply(local, a.scale), a.rotation))
}

function hideRock(): void {
  if (rock !== null) Transform.getMutable(rock).scale = Vector3.Zero()
}

function showRock(u: number, v: number, yaw: number): void {
  hits = 0
  rockSpot = areaPoint(u, v)
  const t = Transform.getMutable(rock!)
  t.position = rockSpot
  t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
  t.scale = Vector3.One()
}

/**
 * Follows the server's rock. Before the server has said anything, the middle of the area
 * stands in — the same spot for everybody, so even offline two players agree.
 */
function followSharedRock(dt: number): void {
  let active: { u: number; v: number; yaw: number; seq: number } | null = null
  for (const [, shared] of engine.getEntitiesWith(ActiveRock)) active = shared

  if (active !== null && active.seq !== shownSeq) {
    shownSeq = active.seq
    offlineReshow = -1
    stopSwinging()
    showRock(active.u, active.v, active.yaw)
    return
  }

  if (!placed) {
    placed = true
    showRock(0.5, 0.5, 0)
  }

  if (offlineReshow >= 0) {
    offlineReshow -= dt
    if (offlineReshow < 0) {
      finishedSeq = -2
      showRock(Math.random(), Math.random(), Math.random() * 360)
    }
  }
}

function isPlayerAtRock(): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player === null) return false
  // Flat on the ground: a tall rock's origin can sit well above or below the player's feet.
  const dx = rockSpot.x - player.position.x
  const dz = rockSpot.z - player.position.z
  const distanceSquared = dx * dx + dz * dz
  if (distanceSquared > MINE_REACH_METERS * MINE_REACH_METERS) return false

  // Standing on the rock's origin leaves no direction to face; count it as facing.
  if (distanceSquared < 0.0001) return true

  // The avatar's forward, flattened, against the flat direction to the rock. Both are unit
  // length after this, so their dot product is the cosine of the angle between them.
  const forward = Vector3.rotate(Vector3.Forward(), player.rotation)
  const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z)
  if (forwardLength < 0.0001) return false

  const distance = Math.sqrt(distanceSquared)
  const cosine = (forward.x * dx + forward.z * dz) / (forwardLength * distance)
  return cosine >= Math.cos((MINE_FACING_DEGREES * Math.PI) / 180)
}

/** Ends the swing loop and forgets the swing in flight. The hits already on the rock stay. */
function stopSwinging(): void {
  swingTimer = -1
  stopMineEmote()
}

/** Whether the player has stopped, measured from how far they moved since the last frame. */
function trackStanding(dt: number): void {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player === null) return

  if (lastPosition !== null && dt > 0) {
    const moved = Vector3.distance(player.position, lastPosition)
    standing = moved / dt < STANDING_SPEED
  }
  lastPosition = Vector3.clone(player.position)
}

function update(dt: number): void {
  trackStanding(dt)
  if (rock === null) return
  followSharedRock(dt)

  // Already mined by this player: nothing to do here until the rock moves.
  if (finishedSeq === shownSeq) {
    status = null
    return
  }

  if (!isPlayerAtRock()) {
    // Progress on the rock is kept; only the swing in flight is dropped.
    stopSwinging()
    status = null
    return
  }

  const needed = getHitsPerRock()
  if (needed <= 0) {
    stopSwinging()
    status = { hits: 0, needed: 1, blocked: 'You need a pick — the mayor has one for you' }
    return
  }

  const capacity = getCarryCapacity()
  if (capacity > 0 && getOre() >= capacity) {
    stopSwinging()
    status = { hits, needed, blocked: 'Bag full — sell at the bank' }
    return
  }

  // Walking cancels the swing in flight rather than letting it pay for a hit that was never
  // animated; the hits already in stay on the rock.
  if (!standing) {
    stopSwinging()
    status = { hits, needed, blocked: 'Stand still to mine' }
    return
  }

  // The emote runs as one loop for as long as the player keeps mining; the timer only decides
  // when each hit lands inside it.
  if (swingTimer < 0) {
    startMineEmote()
    swingTimer = SWING_SECONDS
  }

  swingTimer -= dt
  if (swingTimer <= 0) {
    hits += 1
    // Carried over rather than reset to the full swing, so the hits stay in step with a loop
    // that never restarts.
    swingTimer += SWING_SECONDS
    // But never more than one swing's worth. A frame that stalls for seconds (mobile does) left
    // the timer deep in debt, and paying it back one hit per frame finished the rock in a blink
    // — whose popup stalled the next frame, and so on until the scene errored. A stall earns
    // one hit, not several.
    if (swingTimer <= 0) swingTimer = SWING_SECONDS
    playSfx(HIT_SOUND, 1)
    // Tells the server this player is on this rock, for the boom-town bonus.
    sendSwing(shownSeq)
    // Where the swing is not a loop (mobile), each hit starts the next one; elsewhere this is
    // a no-op while the loop runs.
    if (hits < needed) startMineEmote()

    if (hits >= needed) {
      // The rock's own state changes first, before anything that talks to the outside world:
      // if one of those throws, the rock must already be finished, or every swing after it
      // pays again.
      const finishedAfter = hits
      hideRock()
      finishedSeq = shownSeq
      if (shownSeq < 0) offlineReshow = OFFLINE_RESHOW_SECONDS
      status = null
      sendRockDone()
      playSfx(ROCK_DONE_SOUND, 0.8)
      // Shown immediately rather than when the wallet comes back: the swing earned it, and a
      // popup a round trip late would not read as this rock's payout. The HUD is still the one
      // that only moves once the server agrees.
      showOrePopup(ORE_PER_ROCK)
      console.log(`[mine] rock done after ${finishedAfter} hits`)
      // Hidden until the server moves the rock, for everybody at once (done above).
      stopSwinging()
      return
    }
  }

  status = { hits, needed, blocked: '' }
}

export function setupRocks(): void {
  findArea()
  engine.addSystem(update, undefined, 'client:rocks')
}
