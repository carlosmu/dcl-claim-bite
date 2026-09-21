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

import { muleCapacity } from '../shared/economy/catalogue'
import { FUEL_MAX_TANKS, FUEL_TANK_HOURS, MULE_ORE_PER_HOUR } from '../shared/economy/constants'

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000

export type MuleState = {
  /** Ore sitting in the rig, waiting to be collected. */
  muleOre: number
  /** When the rig was last settled, as a wall-clock timestamp in milliseconds. */
  muleAt: number
  /**
   * Fuel left, in level-hours: a level-N rig burns N per hour. Counting it this way rather than
   * in hours means upgrading with a half-full tank makes it run out sooner, instead of letting
   * cheap level-1 tanks power a level-5 rig.
   */
  muleFuel: number
}

/**
 * Brings the rig up to date, crediting whatever it dug since it was last settled.
 *
 * Must run BEFORE the level changes, so the hours already worked are paid at the old level.
 *
 * Called on arrival, before any collection, and periodically — the result is the same either
 * way, which is the point of settling from a timestamp instead of accumulating.
 */
export function settleMule(state: MuleState, muleLevel: number, now: number = Date.now()): void {
  const since = state.muleAt

  // The clock is always advanced, even with no rig. Otherwise a player who has been away a
  // month and buys one on arrival would be paid for the month before they owned it.
  state.muleAt = now

  if (muleLevel <= 0) return
  if (!(since > 0) || now <= since) return

  // It runs until the first of three things: the time is up, the tank is dry, or it is full.
  // A full rig stops burning fuel too (balance.md §3), so a player is never charged for output
  // they could not have received.
  const orePerHour = MULE_ORE_PER_HOUR * muleLevel
  const elapsed = (now - since) / MILLISECONDS_PER_HOUR
  const untilDry = state.muleFuel / muleLevel
  const untilFull = (muleCapacity(muleLevel) - state.muleOre) / orePerHour
  const running = Math.max(0, Math.min(elapsed, untilDry, untilFull))

  state.muleOre += running * orePerHour
  state.muleFuel = Math.max(0, state.muleFuel - running * muleLevel)
}

/** Hours the rig will keep running on what is in the tank. */
export function fuelHoursLeft(state: MuleState, muleLevel: number): number {
  return muleLevel > 0 ? state.muleFuel / muleLevel : 0
}

/** Adds one tank at the rig's current level. False, and nothing added, if it would overflow. */
export function addFuelTank(state: MuleState, muleLevel: number): boolean {
  if (muleLevel <= 0) return false
  if (fuelHoursLeft(state, muleLevel) + FUEL_TANK_HOURS > FUEL_MAX_TANKS * FUEL_TANK_HOURS) return false
  state.muleFuel += FUEL_TANK_HOURS * muleLevel
  return true
}

/** Whole ore the rig is holding. The fraction stays in the rig rather than rounding away. */
export function collectableOre(state: MuleState): number {
  return Math.floor(state.muleOre)
}
