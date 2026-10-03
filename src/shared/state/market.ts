// The town's ore rate, quoted as ORE PER COIN — how much ore buys one coin, the way a
// currency board quotes a rate. Selling pushes it UP, and up is worse for the seller.
//
// One shared rate between RATE_BASE (10) and RATE_CAP (12):
//
//   settled   the rate as of the last closed window. Persisted across restarts.
//   window    ore sold since that window opened. Its impact is a log of the TOTAL, so many
//             small sales cost the same as one big one, and a whale moves the market less
//             than proportionally.
//
// The live rate is settled + the open window's impact, so a sale shows on the board at once
// instead of a minute later, and nobody can sell a second load at the pre-dump price. When the
// window closes the impact is folded into the settled rate and recovery takes one 0.1 step
// back toward the base.
//
// Same rule as the wallet: no ECS, React or rendering imports. The server owns this.

import {
  MARKET_IMPACT_SCALE,
  MARKET_IMPACT_VOLUME,
  MARKET_WINDOW_SECONDS,
  RATE_BASE,
  RATE_CAP,
  RATE_RECOVERY_PER_WINDOW
} from '../economy/constants'

let settled = RATE_BASE
let windowOre = 0
let windowElapsed = 0

/** How much the rate rises for `oreSold` ore sold within one window. */
export function marketImpact(oreSold: number): number {
  if (oreSold <= 0) return 0
  return MARKET_IMPACT_SCALE * Math.log2(1 + oreSold / MARKET_IMPACT_VOLUME)
}

/** What one coin costs in ore right now. Higher is worse for the seller. */
export function getRate(): number {
  return Math.min(RATE_CAP, settled + marketImpact(windowOre))
}

/** The rate as of the last closed window — the part worth persisting. */
export function getSettledRate(): number {
  return settled
}

/**
 * The rate a sale is priced at: the live rate to one decimal, as the bank shows it.
 *
 * A sale's impact is a log, so the live rate is rarely a round tenth: 10.26 is shown as
 * "10.3". Priced unrounded, the screen and the sale disagreed — at 10.004, ten ore bought
 * 0.9996 of a coin, nothing once floored, and the bank refused a sale it said would pay one.
 * Pricing at the shown rate makes the screen and the sale agree, on the client and the server.
 */
export function quotedRate(rate: number): number {
  return rateTenths(rate) / 10
}

// The quoted rate in whole tenths of an ore: 10.1 becomes 101. Sales are priced with these
// integers, because in floating point 101 / 10.1 can land a hair under 10 and floor a coin away.
function rateTenths(rate: number): number {
  return Math.round(rate * 10)
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
  return Math.floor((oreAmount * 10) / rateTenths(rawRate))
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
 * bag means the advertised rate is the rate the player actually gets.
 *
 * Rounded UP to a whole ore: one coin at 10.1 costs 11. That is the amount the bank panel
 * shows as the sale, so the ore on screen is exactly the ore that leaves the bag. Never more
 * than the offer it priced: quoteSaleAt floors, so `coins` at `rate` always fits in it.
 */
export function oreForCoins(rawRate: number, coins: number): number {
  if (coins <= 0) return 0
  return Math.ceil((coins * rateTenths(rawRate)) / 10)
}

/** Adds a sale to the open window. The rate it moves is visible right away through getRate(). */
export function applySale(oreAmount: number): void {
  if (oreAmount <= 0) return
  windowOre += oreAmount
}

/**
 * Advances the market clock. Call once per frame with the frame's dt.
 *
 * Each time a window closes: its impact is settled into the rate, then the rate takes one
 * recovery step back toward the base. A town selling about 100 ore a minute therefore holds
 * the rate where it is; a quiet one walks it down 0.1 a minute, 12 to 10 in twenty minutes.
 */
export function tickMarket(dt: number): void {
  windowElapsed += dt
  while (windowElapsed >= MARKET_WINDOW_SECONDS) {
    windowElapsed -= MARKET_WINDOW_SECONDS
    const withSales = Math.min(RATE_CAP, settled + marketImpact(windowOre))
    windowOre = 0
    settled = Math.max(RATE_BASE, withSales - RATE_RECOVERY_PER_WINDOW)
  }
}

/** Puts the settled rate back to a value read from storage, on server start. */
export function restoreRate(stored: number): void {
  settled = Math.max(RATE_BASE, Math.min(RATE_CAP, stored))
}
