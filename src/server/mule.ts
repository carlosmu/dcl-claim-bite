// The idle rigs' accounting. Server-only, and deliberately clock-based rather than tick-based.
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

import { FUEL_GALLONS_PER_RIG_DAY, MULE_ORE_PER_HOUR } from '../shared/economy/constants'
import { fuelTankGallons } from '../shared/economy/catalogue'

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000
const HOURS_PER_DAY = 24

export type MuleState = {
  /** The player's storage: the rigs dig straight into it. */
  ore: number
  /**
   * Dug but not yet in storage: the fraction of an ore still being dug, plus anything that did
   * not fit. Saves from the days when the rig held its own load keep that load here, and it
   * moves into storage as room appears — nothing is lost.
   */
  muleOre: number
  /** When the rigs were last settled, as a wall-clock timestamp in milliseconds. */
  muleAt: number
  /**
   * Fuel left, in rig-hours: N rigs burn N per hour. One gallon is a rig-day, so gallons are
   * this over 24 (fuelGallons). Kept in rig-hours because saves already store it that way.
   */
  muleFuel: number
}

/** Moves whole ore from the rigs into storage, as much as fits. */
function unload(state: MuleState, capacity: number): void {
  const moved = Math.max(0, Math.min(Math.floor(state.muleOre), capacity - state.ore))
  state.ore += moved
  state.muleOre -= moved
}

/**
 * Brings the rigs up to date, crediting whatever they dug since they were last settled.
 *
 * Must run BEFORE the rig count or the storage changes, so the hours already worked are paid
 * at the old values.
 *
 * Called on arrival and periodically — the result is the same either way, which is the point
 * of settling from a timestamp instead of accumulating.
 */
export function settleMule(state: MuleState, mules: number, capacity: number, now: number = Date.now()): void {
  const since = state.muleAt

  // The clock is always advanced, even with no rig. Otherwise a player who has been away a
  // month and buys one on arrival would be paid for the month before they owned it.
  state.muleAt = now

  // Whatever was waiting goes in first, so room freed by a sale is filled before new digging.
  unload(state, capacity)

  if (mules <= 0) return
  if (!(since > 0) || now <= since) return

  // They run until the first of three things: the time is up, the fuel is gone, or the storage
  // is full. A full storage stops the fuel too, so a player is never charged for output they
  // could not receive.
  const orePerHour = MULE_ORE_PER_HOUR * mules
  const elapsed = (now - since) / MILLISECONDS_PER_HOUR
  const untilDry = state.muleFuel / mules
  const untilFull = Math.max(0, capacity - state.ore - state.muleOre) / orePerHour
  const running = Math.max(0, Math.min(elapsed, untilDry, untilFull))

  state.muleOre += running * orePerHour
  state.muleFuel = Math.max(0, state.muleFuel - running * mules)
  unload(state, capacity)
}

/** Hours the rigs will keep running on what is in the tank. */
export function fuelHoursLeft(state: MuleState, mules: number): number {
  return mules > 0 ? state.muleFuel / mules : 0
}

const RIG_HOURS_PER_GALLON = HOURS_PER_DAY / FUEL_GALLONS_PER_RIG_DAY

/** Gallons in the tank. */
export function fuelGallons(state: MuleState): number {
  return state.muleFuel / RIG_HOURS_PER_GALLON
}

/**
 * Pours `gallons` into the tank. False, and nothing added, if they would overflow it — beyond a
 * hair, so Fill Tank's exact top-up never trips on rounding; it then lands exactly on full.
 */
export function addFuelGallons(state: MuleState, mules: number, gallons: number): boolean {
  if (mules <= 0 || gallons <= 0) return false
  const capacity = fuelTankGallons(mules)
  if (fuelGallons(state) + gallons > capacity + 1e-6) return false
  state.muleFuel = Math.min(capacity * RIG_HOURS_PER_GALLON, state.muleFuel + gallons * RIG_HOURS_PER_GALLON)
  return true
}
