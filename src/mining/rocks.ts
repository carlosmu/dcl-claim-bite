import { Entity, engine, GltfContainer, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { MINE_FACING_DEGREES, MINE_REACH_METERS, ORE_PER_ROCK, SWING_SECONDS } from '../shared/economy/constants'
import { getCarryCapacity, getHitsPerRock, sendRockDone, sendSwing } from '../net/economy-link'
import { getOre } from '../shared/state/wallet'
import { startMineEmote, stopMineEmote } from '../player/mine-emote'
import { playSfx } from '../world/sfx'
import { showOrePopup } from '../ui/ore-popup'
import { ActiveRock, pickRockSpot, ROCKS_AT_ONCE } from '../shared/net/rock-sync'

// Manual mining (design/balance.md §2, 2026-09-17). No timing bar: a handful of rocks stand at
// random spots inside `Mining_Area` — a box or plane mesh authored in the Creator Hub,
// stretched over the ground where rocks may appear, and hidden at load. Walk up to a rock and
// the swings start on their own; every swing is one hit, and when the hits the pick needs are
// in, the rock pays and moves somewhere else in the area, clear of the others.
//
// Where the rocks stand is the town's, not the player's: the server places them (ActiveRock),
// so everybody sees the same ones, and a paid rock moves for everybody. The hits are still each
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

/** The area's world transform, read once at load. The rocks are placed on its bottom face. */
type Area = { position: Vector3; rotation: Quaternion; scale: Vector3; isPlane: boolean }

/**
 * One rock standing in the area. `hits` are this player's on it and stay if they walk off to
 * another rock and back. `finished` hides it for this player until the server moves it —
 * which, with company, waits until everyone on it is done.
 */
type Rock = {
  entity: Entity
  spot: Vector3
  u: number
  v: number
  seq: number
  hits: number
  finished: boolean
  /** Offline only: seconds before a finished rock comes back somewhere else. Negative if not. */
  reshow: number
  /** Seconds left of the jolt from the last hit. Zero while at rest. */
  bump: number
}

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
let rocks: Rock[] = []
let lastPosition: Vector3 | null = null
let standing = false

/** Whether the server's rocks have been seen. Until then the rocks are this client's own. */
let synced = false

/** Seqs for rocks placed without a server: negative, so they never match a server's. */
let nextOfflineSeq = -1

/** The rock being mined, as an index into `rocks`. -1 while at none. */
let mining = -1

/**
 * Seconds before a finished rock comes back when there is no server to move it. Offline only;
 * online a rock waits for the move however long it takes.
 */
const OFFLINE_RESHOW_SECONDS = 3

// The jolt a hit gives the rock: it snaps to this scale and settles back to 1 over the time
// below (10 frames at 30 fps).
const HIT_BUMP_SCALE = 1.1
const HIT_BUMP_SECONDS = 10 / 30

// How long before the hit lands the jolt starts, so it meets the pick in the swing animation
// rather than the moment the hit is counted.
const HIT_BUMP_LEAD_SECONDS = 0.35

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

  // Placed here on their own until the server's rocks arrive (offline, they never do).
  for (let i = 0; i < ROCKS_AT_ONCE; i++) {
    const entity = engine.addEntity()
    Transform.create(entity, { scale: Vector3.Zero() })
    GltfContainer.create(entity, { src: ROCK_MODEL, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 3 })
    const rock: Rock = { entity, spot: Vector3.Zero(), u: 0, v: 0, seq: 0, hits: 0, finished: false, reshow: -1, bump: 0 }
    const spot = pickRockSpot(rocks)
    rocks.push(rock)
    showRock(rock, spot.u, spot.v, Math.random() * 360, nextOfflineSeq--)
  }
}

/** A point of the area from its 0..1 fractions, on the area's bottom (the ground under it). */
function areaPoint(u: number, v: number): Vector3 {
  const a = area!
  const local = a.isPlane ? Vector3.create(u - 0.5, v - 0.5, 0) : Vector3.create(u - 0.5, -0.5, v - 0.5)
  return Vector3.add(a.position, Vector3.rotate(Vector3.multiply(local, a.scale), a.rotation))
}

function hideRock(rock: Rock): void {
  Transform.getMutable(rock.entity).scale = Vector3.Zero()
}

function showRock(rock: Rock, u: number, v: number, yaw: number, seq: number): void {
  rock.u = u
  rock.v = v
  rock.seq = seq
  rock.hits = 0
  rock.finished = false
  rock.reshow = -1
  rock.bump = 0
  rock.spot = areaPoint(u, v)
  const t = Transform.getMutable(rock.entity)
  t.position = rock.spot
  t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
  t.scale = Vector3.One()
}

/** Settles each rock that was just hit back from its jolt to rest. */
function settleBumps(dt: number): void {
  for (const rock of rocks) {
    if (rock.bump <= 0) continue
    rock.bump = Math.max(0, rock.bump - dt)
    // A finished rock is hidden at scale zero; its jolt must not bring it back.
    if (rock.finished) continue
    const size = 1 + (HIT_BUMP_SCALE - 1) * (rock.bump / HIT_BUMP_SECONDS)
    Transform.getMutable(rock.entity).scale = Vector3.create(size, size, size)
  }
}

/** Follows the server's rocks; before it has said anything, the rocks placed at load stand in. */
function followSharedRocks(dt: number): void {
  let shared: readonly { u: number; v: number; yaw: number; seq: number }[] | null = null
  for (const [, active] of engine.getEntitiesWith(ActiveRock)) shared = active.rocks

  if (shared !== null) {
    synced = true
    for (let i = 0; i < rocks.length; i++) {
      const next = shared[i]
      if (next === undefined) {
        hideRock(rocks[i])
        rocks[i].finished = true
        continue
      }
      if (next.seq === rocks[i].seq) continue
      if (i === mining) stopSwinging()
      showRock(rocks[i], next.u, next.v, next.yaw, next.seq)
    }
    return
  }

  for (const rock of rocks) {
    if (rock.reshow < 0) continue
    rock.reshow -= dt
    if (rock.reshow < 0) {
      const spot = pickRockSpot(rocks.filter((other) => other !== rock))
      showRock(rock, spot.u, spot.v, Math.random() * 360, nextOfflineSeq--)
    }
  }
}

/** The nearest unfinished rock the player is at and facing, as an index; -1 if none. */
function rockAtPlayer(): number {
  let best = -1
  let bestDistance = Infinity
  for (let i = 0; i < rocks.length; i++) {
    if (rocks[i].finished) continue
    const distance = distanceIfFacing(rocks[i].spot)
    if (distance < bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/** Flat distance to `spot` if the player is in reach of it and facing it; Infinity if not. */
function distanceIfFacing(spot: Vector3): number {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player === null) return Infinity
  // Flat on the ground: a tall rock's origin can sit well above or below the player's feet.
  const dx = spot.x - player.position.x
  const dz = spot.z - player.position.z
  const distanceSquared = dx * dx + dz * dz
  if (distanceSquared > MINE_REACH_METERS * MINE_REACH_METERS) return Infinity

  // Standing on the rock's origin leaves no direction to face; count it as facing.
  if (distanceSquared < 0.0001) return 0

  // The avatar's forward, flattened, against the flat direction to the rock. Both are unit
  // length after this, so their dot product is the cosine of the angle between them.
  const forward = Vector3.rotate(Vector3.Forward(), player.rotation)
  const forwardLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z)
  if (forwardLength < 0.0001) return Infinity

  const distance = Math.sqrt(distanceSquared)
  const cosine = (forward.x * dx + forward.z * dz) / (forwardLength * distance)
  return cosine >= Math.cos((MINE_FACING_DEGREES * Math.PI) / 180) ? distance : Infinity
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
  if (rocks.length === 0) return
  followSharedRocks(dt)
  settleBumps(dt)

  // Turning from one rock to another drops the swing in flight; the hits on each stay.
  const at = rockAtPlayer()
  if (at !== mining) stopSwinging()
  mining = at

  // At no rock, or only at ones this player has already mined.
  if (mining < 0) {
    status = null
    return
  }
  const rock = rocks[mining]

  const needed = getHitsPerRock()
  if (needed <= 0) {
    stopSwinging()
    status = { hits: 0, needed: 1, blocked: 'You need a pick — the mayor has one for you' }
    return
  }

  const capacity = getCarryCapacity()
  if (capacity > 0 && getOre() >= capacity) {
    stopSwinging()
    status = { hits: rock.hits, needed, blocked: 'Bag full — sell at the bank' }
    return
  }

  // Walking cancels the swing in flight rather than letting it pay for a hit that was never
  // animated; the hits already in stay on the rock.
  if (!standing) {
    stopSwinging()
    status = { hits: rock.hits, needed, blocked: 'Stand still to mine' }
    return
  }

  // The emote runs as one loop for as long as the player keeps mining; the timer only decides
  // when each hit lands inside it.
  if (swingTimer < 0) {
    startMineEmote()
    swingTimer = SWING_SECONDS
  }

  const before = swingTimer
  swingTimer -= dt
  if (before > HIT_BUMP_LEAD_SECONDS && swingTimer <= HIT_BUMP_LEAD_SECONDS) rock.bump = HIT_BUMP_SECONDS
  if (swingTimer <= 0) {
    rock.hits += 1
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
    sendSwing(rock.seq)
    // Where the swing is not a loop (mobile), each hit starts the next one; elsewhere this is
    // a no-op while the loop runs.
    if (rock.hits < needed) startMineEmote()

    if (rock.hits >= needed) {
      // The rock's own state changes first, before anything that talks to the outside world:
      // if one of those throws, the rock must already be finished, or every swing after it
      // pays again.
      const finishedAfter = rock.hits
      hideRock(rock)
      rock.finished = true
      if (!synced) rock.reshow = OFFLINE_RESHOW_SECONDS
      status = null
      sendRockDone(rock.seq)
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

  status = { hits: rock.hits, needed, blocked: '' }
}

export function setupRocks(): void {
  findArea()
  engine.addSystem(update, undefined, 'client:rocks')
}
