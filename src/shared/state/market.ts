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
 * The rate a sale is priced at: the live rate to one decimal, as the bank shows it.
 *
 * The live rate eases back toward its base without ever quite landing on it, so it sits a
 * hair above: 10.004 shown as "10.0". Priced unrounded, ten ore bought 0.9996 of a coin —
 * nothing, once floored — and the bank refused a sale its own screen said would pay one.
 * Pricing at the shown rate makes the screen and the sale agree, on the client and the server.
 */
export function quotedRate(rate: number): number {
  return Math.round(rate * 10) / 10
}

/**
 * Coins that selling `oreAmount` would pay at `rate`, rounded down so a sale never invents a
 * fraction of a coin. Changes nothing.
 *
 * The whole sale is priced at the rate it was offered at: the quote on the screen is the deal.
 * The rate moves only afterwards (applySale), so dumping a full bag still costs — but the
 * next sale, not this one. Pricing each ore a notch dearer inside the sale made the shown
 * rate a promise the sale could not keep: ten ore at a rate of ten came to 0.9975 of a coin.
 */
export function quoteSaleAt(rawRate: number, oreAmount: number): number {
  if (oreAmount <= 0) return 0
  return Math.floor(oreAmount / quotedRate(rawRate))
}

/** The same quote at the rate right now. */
export function quoteSale(oreAmount: number): number {
  return quoteSaleAt(getRate(), oreAmount)
}

/**
 * The ore that buys `coins` at `rate` — the quote's inverse.
 *
 * This is what stops a sale from eating ore it did not pay for. A payout floors to whole
 * coins, and charging the player's whole offer for a floored payout silently burns the
 * remainder: selling 11 ore at a rate of 10 pays 1 coin and used to cost all 11, so a tenth
 * of a coin — about one ore — vanished. Selling the exact cost and leaving the rest in the
 * bag means the advertised rate is the rate the player actually gets. Rounded down, so a
 * fractional rate never charges a part of an ore the player does not have.
 */
export function oreForCoins(rawRate: number, coins: number): number {
  if (coins <= 0) return 0
  return Math.floor(coins * quotedRate(rawRate))
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
