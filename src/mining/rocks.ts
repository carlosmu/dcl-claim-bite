import { Entity, engine, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { MINE_FACING_DEGREES, MINE_REACH_METERS, SWING_SECONDS } from '../shared/economy/constants'
import { getCarryCapacity, getHitsPerRock, sendRockDone } from '../net/economy-link'
import { getOre } from '../shared/state/wallet'
import { playMineEmote } from '../player/mine-emote'
import { playSfx } from '../world/sfx'

// Manual mining (design/balance.md §2, 2026-09-17). No timing bar: the rocks are the children
// of `Mining_Place`, authored in the Creator Hub, and only one of them is shown at a time. Walk
// up to it and the swings start on their own; every swing is one hit, and when the hits the
// pick needs are in, the rock pays and the next one appears somewhere else.
//
// All of this is local. Which rock is showing is the player's own business, so nothing here is
// synced — other players see their own rock. The payout is the server's: finishing a rock only
// asks for it.
//
// Hiding is done by scaling to zero rather than with VisibilityComponent: an invisible model
// still collides, and a rock you cannot see should not block you.

const MINING_PLACE_NAME = 'Mining_Place'

const ROCK_DONE_SOUND = 'assets/sounds/match.mp3'

type Rock = { entity: Entity; scale: Vector3 }

/** What the HUD draws under itself while mining. Null while there is nothing to say. */
export type MiningStatus = { hits: number; needed: number; blocked: string }

let status: MiningStatus | null = null

/** The mining bar's state, for the UI. Null means draw nothing. */
export function getMiningStatus(): MiningStatus | null {
  return status
}

let rocks: Rock[] = []
let place: Entity | null = null
let current = -1
let hits = 0

/** Seconds until the swing in progress lands. Negative while not swinging. */
let swingTimer = -1

function findRocks(): void {
  place = engine.getEntityOrNullByName(MINING_PLACE_NAME)
  if (place === null) {
    console.error(`[mine] no entity named "${MINING_PLACE_NAME}" in the scene — nothing to mine`)
    return
  }

  for (const [entity, transform] of engine.getEntitiesWith(Transform)) {
    if (transform.parent !== place) continue
    rocks.push({ entity, scale: Vector3.clone(transform.scale) })
    Transform.getMutable(entity).scale = Vector3.Zero()
  }
  console.log(`[mine] ${rocks.length} rock(s) under "${MINING_PLACE_NAME}"`)
}

function showNextRock(): void {
  if (current >= 0) Transform.getMutable(rocks[current].entity).scale = Vector3.Zero()

  // Never the same one twice in a row, so finishing a rock always means walking.
  let next = Math.floor(Math.random() * rocks.length)
  if (rocks.length > 1 && next === current) next = (next + 1) % rocks.length

  current = next
  hits = 0
  Transform.getMutable(rocks[current].entity).scale = Vector3.clone(rocks[current].scale)
}

/** The rock's position in world space: its local offset carried through `Mining_Place`. */
function rockWorldPosition(rock: Entity): Vector3 {
  const local = Transform.get(rock).position
  const parent = Transform.get(place!)
  const scaled = Vector3.create(local.x * parent.scale.x, local.y * parent.scale.y, local.z * parent.scale.z)
  return Vector3.add(parent.position, Vector3.rotate(scaled, parent.rotation ?? Quaternion.Identity()))
}

function isPlayerAtRock(): boolean {
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player === null) return false
  const rock = rockWorldPosition(rocks[current].entity)
  // Flat on the ground: a tall rock's origin can sit well above or below the player's feet.
  const dx = rock.x - player.position.x
  const dz = rock.z - player.position.z
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

function update(dt: number): void {
  if (rocks.length === 0) return
  if (current < 0) showNextRock()

  if (!isPlayerAtRock()) {
    // Progress on the rock is kept; only the swing in flight is dropped.
    swingTimer = -1
    status = null
    return
  }

  const needed = getHitsPerRock()
  if (needed <= 0) {
    swingTimer = -1
    status = { hits: 0, needed: 1, blocked: 'You need a pick — the mayor has one for you' }
    return
  }

  const capacity = getCarryCapacity()
  if (capacity > 0 && getOre() >= capacity) {
    swingTimer = -1
    status = { hits, needed, blocked: 'Bag full — sell at the bank' }
    return
  }

  if (swingTimer < 0) {
    playMineEmote()
    swingTimer = SWING_SECONDS
  }

  swingTimer -= dt
  if (swingTimer <= 0) {
    hits += 1
    swingTimer = -1

    if (hits >= needed) {
      sendRockDone()
      playSfx(ROCK_DONE_SOUND, 0.8)
      console.log(`[mine] rock done after ${hits} hits`)
      status = null
      showNextRock()
      return
    }
  }

  status = { hits, needed, blocked: '' }
}

export function setupRocks(): void {
  findRocks()
  engine.addSystem(update, undefined, 'client:rocks')
}
