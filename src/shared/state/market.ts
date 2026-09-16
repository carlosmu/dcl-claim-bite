// The town's ore rate, quoted as ORE PER COIN — how much ore buys one coin, the way a
// currency board quotes a rate. Selling pushes it UP, and up is worse for the seller.
//
// The rate is the sum of two parts moving at different speeds (design/balance.md §2):
//
//   macro     the town's rate today. Moves on aggregate volume, recovers over hours, and
//             persists across restarts. No single sale visibly moves it.
//   slippage  your own immediate impact. Your sale pushes it hard; it fades in a minute or
//             two. This is what punishes dumping a full bag at once.
//
// Both are needed because one rate cannot do both jobs: with a recovery measured in hours, an
// impact large enough to feel drives the equilibrium far past the cap, and the market ends up
// pinned at its worst value with no variance — which is the same as having no market at all.
//
// Same rule as the wallet: no ECS, React or rendering imports. The server owns this.

import {
  MACRO_PER_ORE,
  MACRO_RECOVERY_SECONDS_PER_PLAYER,
  RATE_BASE,
  RATE_CAP,
  SLIPPAGE_PER_ORE,
  SLIPPAGE_RECOVERY_SECONDS
} from '../economy/constants'

let macro = RATE_BASE
let slippage = 0

/** What one coin costs in ore right now. Higher is worse for the seller. */
export function getRate(): number {
  return Math.min(RATE_CAP, macro + slippage)
}

/** The slow half, on its own — the only part worth persisting. */
export function getMacroRate(): number {
  return macro
}

/**
 * Coins that selling `oreAmount` would pay at `rate`, rounded down so a sale never invents a
 * fraction of a coin. Changes nothing.
 *
 * Priced ore by ore down a rising ladder rather than at one flat rate: the first unit is
 * charged today's rate and each following unit a notch more, so dumping a full bag pays less
 * per ore than selling it in batches with the rate easing in between. That is what makes
 * choosing an amount a decision instead of always tapping "all".
 *
 * Inverting the quote turned that ladder from a sum into a logarithm — the integral of 1/rate
 * as the rate climbs — which is also why the penalty for dumping bites harder here than it
 * did in coins-per-ore.
 */
export function quoteSaleAt(rate: number, oreAmount: number): number {
  if (oreAmount <= 0) return 0

  // Ore that can be sold before the rate hits its cap and stops getting worse.
  const beforeCap = Math.max(0, Math.min(oreAmount, (RATE_CAP - rate) / SLIPPAGE_PER_ORE))
  const climbing = beforeCap > 0 ? Math.log((rate + beforeCap * SLIPPAGE_PER_ORE) / rate) / SLIPPAGE_PER_ORE : 0
  const atCap = (oreAmount - beforeCap) / RATE_CAP

  return Math.floor(climbing + atCap)
}

/** The same quote at the rate right now. */
export function quoteSale(oreAmount: number): number {
  return quoteSaleAt(getRate(), oreAmount)
}

/**
 * The ore that exactly buys `coins` at `rate` — the ladder's inverse.
 *
 * This is what stops a sale from eating ore it did not pay for. A payout floors to whole
 * coins, and charging the player's whole offer for a floored payout silently burns the
 * remainder: selling 11 ore at a rate of 10 pays 1 coin and used to cost all 11, so a tenth
 * of a coin — about one ore — vanished. Selling the exact cost and leaving the rest in the
 * bag means the advertised rate is the rate the player actually gets.
 */
export function oreForCoins(rate: number, coins: number): number {
  if (coins <= 0) return 0

  const oreToCap = Math.max(0, (RATE_CAP - rate) / SLIPPAGE_PER_ORE)
  const coinsToCap = oreToCap > 0 ? Math.log((rate + oreToCap * SLIPPAGE_PER_ORE) / rate) / SLIPPAGE_PER_ORE : 0

  // Past the cap the ladder stops climbing and the price is flat, so the inverse is linear.
  if (coins > coinsToCap) return Math.floor(oreToCap + (coins - coinsToCap) * RATE_CAP)

  return Math.floor((rate / SLIPPAGE_PER_ORE) * (Math.exp(SLIPPAGE_PER_ORE * coins) - 1))
}

/** Moves the rate for a sale that has just happened. */
export function applySale(oreAmount: number): void {
  if (oreAmount <= 0) return
  slippage += oreAmount * SLIPPAGE_PER_ORE
  macro = Math.min(RATE_CAP, macro + oreAmount * MACRO_PER_ORE)
}

/**
 * Lets both halves drift back. Call once per frame with the frame's dt and the number of
 * players connected.
 *
 * Exponential rather than linear, in both: a restoring force proportional to how far the rate
 * has strayed is what gives the market an equilibrium at all. With the flat recovery this
 * module used to have, the rate was a race between two fixed speeds and one always won — it
 * sat at the base or at the cap, and the interesting middle only existed while travelling
 * between them.
 */
export function recoverRate(dt: number, players: number): void {
  slippage *= Math.exp(-dt / SLIPPAGE_RECOVERY_SECONDS)
  if (slippage < 0.0001) slippage = 0

  // A town with nobody in it has no demand, so the macro simply waits.
  if (players <= 0) return
  const k = players / MACRO_RECOVERY_SECONDS_PER_PLAYER
  macro = RATE_BASE + (macro - RATE_BASE) * Math.exp(-k * dt)
}

/**
 * Puts the macro back to a value read from storage, on server start.
 *
 * Deliberately not a general setter, and deliberately only the macro: slippage fades in
 * ninety seconds, so persisting it would restore something already gone.
 */
export function restoreMacroRate(stored: number): void {
  macro = Math.max(RATE_BASE, Math.min(RATE_CAP, stored))
}
