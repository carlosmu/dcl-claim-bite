// The idle rig's accounting. Server-only, and deliberately clock-based rather than tick-based.
//
// The rig's whole value is that it works while nobody is connected, so its output cannot be
// accumulated by a system running frames — there are no frames when the player is gone, and
// on a preview the server scene restarts often enough that a tick counter would lose hours.
// Instead it stores WHEN it was last settled and works out what it owes on arrival.
//
// That means wall-clock time, which is normally the thing not to trust. It is safe here only
// because this runs on the server: the timestamp is written and read by the authority, never
// sent by a client. The same arithmetic on the client would be an invitation to move the
// system clock forward and harvest a year.

import { MULE_CAPACITY, MULE_ORE_PER_HOUR } from '../shared/economy/constants'

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

export type MuleState = {
  /** Ore sitting in the rig, waiting to be collected. */
  muleOre: number
  /** When the rig was last settled, as a wall-clock timestamp in milliseconds. */
  muleAt: number
}

/**
 * Brings the rig up to date, crediting whatever it dug since it was last settled.
 *
 * Called on arrival, before any collection, and periodically — the result is the same either
 * way, which is the point of settling from a timestamp instead of accumulating.
 */
export function settleMule(state: MuleState, ownsMule: boolean, now: number = Date.now()): void {
  const since = state.muleAt

  // The clock is always advanced, even with no rig. Otherwise a player who has been away a
  // month and buys one on arrival would be paid for the month before they owned it.
  state.muleAt = now

  if (!ownsMule) return
  if (!(since > 0) || now <= since) return

  const hours = (now - since) / MILLISECONDS_PER_HOUR
  state.muleOre = Math.min(MULE_CAPACITY, state.muleOre + hours * MULE_ORE_PER_HOUR)
}

/** Whole ore the rig is holding. The fraction stays in the rig rather than rounding away. */
export function collectableOre(state: MuleState): number {
  return Math.floor(state.muleOre)
}
