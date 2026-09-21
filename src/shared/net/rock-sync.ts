// Where the rocks are, as the one copy everybody sees.
//
// The rock used to be each client's own random pick, so two players standing together were
// mining two different rocks — and a bonus for mining side by side needs them at the same one.
// The server now picks, and every client shows the rocks where this component says.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's rock entity with its client-side counterpart. */
export const ROCK_ENTITY_ENUM_ID = 3

/** How many rocks stand in the area at once. */
export const ROCKS_AT_ONCE = 5

/**
 * How close two rocks may stand, as a fraction of the area. A new spot is drawn until it is at
 * least this far from every other rock (the one it replaces included, so a move never lands on
 * top of the rock just mined). If the draws run out, the spot furthest from the rest is taken:
 * still never on top of another, just closer than wanted.
 */
const MIN_GAP = 0.25
const SPOT_TRIES = 30

/** A random spot in the area, 0..1 on each side, as far as it can get from `taken`. */
export function pickRockSpot(taken: readonly { u: number; v: number }[]): { u: number; v: number } {
  let best = { u: Math.random(), v: Math.random() }
  let bestGap = -1
  for (let i = 0; i < SPOT_TRIES; i++) {
    const spot = { u: Math.random(), v: Math.random() }
    let gap = Infinity
    for (const other of taken) gap = Math.min(gap, Math.hypot(spot.u - other.u, spot.v - other.v))
    if (gap >= MIN_GAP) return spot
    if (gap > bestGap) {
      best = spot
      bestGap = gap
    }
  }
  return best
}

// One entry per rock. `u` and `v` are 0..1 across `Mining_Area` (the server has no scene, so it
// cannot pick in metres; each client maps them onto the area's mesh). `yaw` is the rock's turn
// in degrees. `seq` is the rock's own id, never reused: a rock that moves gets a new one, so a
// client can tell "a new rock" from "the same rock", and a swing or a finished bar names the
// rock it was for.
export const ActiveRock = engine.defineComponent('claimbite:ActiveRock', {
  rocks: Schemas.Array(
    Schemas.Map({
      u: Schemas.Float,
      v: Schemas.Float,
      yaw: Schemas.Float,
      seq: Schemas.Int64
    })
  )
})

// Only the server moves the rock. Otherwise a client could park it next to itself.
ActiveRock.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
