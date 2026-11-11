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
// window closes the impact is folded into the settled rate. Separately, every few seconds,
// recovery gives back a small share of the settled rate's distance to the base.
//
// Both depend on the crowd: how many players are in the scene, held between MARKET_MIN_PLAYERS
// and MARKET_MAX_PLAYERS. A bigger crowd makes a deeper market (the same sale moves it less) and
// a faster recovery.
//
// Same rule as the wallet: no ECS, React or rendering imports. The server owns this.

import {
  MARKET_IMPACT_SCALE,
  MARKET_IMPACT_VOLUME_MAX_PLAYERS,
  MARKET_IMPACT_VOLUME_MIN_PLAYERS,
  MARKET_MAX_PLAYERS,
  MARKET_MIN_PLAYERS,
  MARKET_WINDOW_SECONDS,
  RATE_BASE,
  RATE_CAP,
  RATE_RECOVERY_SHARE_MAX_PLAYERS,
  RATE_RECOVERY_SHARE_MIN_PLAYERS,
  RATE_RECOVERY_SNAP,
  RATE_RECOVERY_STEP_SECONDS
} from '../economy/constants'

let settled = RATE_BASE
let windowOre = 0
let windowElapsed = 0
let recoveryElapsed = 0
// The crowd the open window is priced for, and the latest head count from the server.
let windowPlayers = MARKET_MIN_PLAYERS
let latestPlayers = MARKET_MIN_PLAYERS

// Where a crowd sits between the smallest (0) and the biggest (1) the market is tuned for.
function crowdShare(players: number): number {
  const clamped = Math.max(MARKET_MIN_PLAYERS, Math.min(MARKET_MAX_PLAYERS, players))
  return (clamped - MARKET_MIN_PLAYERS) / (MARKET_MAX_PLAYERS - MARKET_MIN_PLAYERS)
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** How much ore it takes to move the market, for this crowd. */
function marketDepth(players: number): number {
  return lerp(MARKET_IMPACT_VOLUME_MIN_PLAYERS, MARKET_IMPACT_VOLUME_MAX_PLAYERS, crowdShare(players))
}

/**
 * The share of its distance above the base the rate gives back per recovery step, for this
 * crowd. The constants are per minute; a step is a fraction of one, compounded so that a
 * minute of steps gives back exactly the per-minute share.
 */
function recoveryShare(players: number): number {
  const perMinute = lerp(RATE_RECOVERY_SHARE_MIN_PLAYERS, RATE_RECOVERY_SHARE_MAX_PLAYERS, crowdShare(players))
  return 1 - Math.pow(1 - perMinute, RATE_RECOVERY_STEP_SECONDS / 60)
}

/** The rate one recovery step later, with nothing sold. */
function recoverOnce(rate: number, players: number): number {
  const distance = (rate - RATE_BASE) * (1 - recoveryShare(players))
  return distance < RATE_RECOVERY_SNAP ? RATE_BASE : RATE_BASE + distance
}

/** How much the rate rises for `oreSold` ore sold within one window, by a crowd of `players`. */
export function marketImpact(oreSold: number, players: number = windowPlayers): number {
  if (oreSold <= 0) return 0
  return MARKET_IMPACT_SCALE * Math.log2(1 + oreSold / marketDepth(players))
}

/**
 * Tells the market how many players are in the scene. Call whenever the count is known.
 *
 * The open window keeps the crowd it was priced for once something has been sold in it, so a
 * player leaving mid-window cannot move the rate without a sale. An empty window has no impact
 * to reprice, so it takes the new count at once.
 */
export function setMarketPlayers(players: number): void {
  latestPlayers = players
  if (windowOre <= 0) windowPlayers = players
}

/**
 * Seconds until the rate is back at the base if nobody sells and the crowd stays at `players`.
 * For the bank's estimate.
 */
export function secondsToRecover(rate: number, players: number): number {
  let steps = 0
  // The snap guarantees arrival; the bound is only a guard against a bad input.
  while (rate > RATE_BASE && steps < 10000) {
    rate = recoverOnce(rate, players)
    steps += 1
  }
  return steps * RATE_RECOVERY_STEP_SECONDS
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
 * Every recovery step the settled rate gives back a small share of its distance to the base,
 * for the crowd there is now. Each time a window closes its impact is settled into the rate and
 * the next window opens for the latest crowd. A steady stream of sales therefore settles at a
 * level instead of climbing forever, and a quiet town walks the rate down fast from the cap and
 * slowly near the base.
 */
export function tickMarket(dt: number): void {
  recoveryElapsed += dt
  while (recoveryElapsed >= RATE_RECOVERY_STEP_SECONDS) {
    recoveryElapsed -= RATE_RECOVERY_STEP_SECONDS
    settled = recoverOnce(settled, latestPlayers)
  }

  windowElapsed += dt
  while (windowElapsed >= MARKET_WINDOW_SECONDS) {
    windowElapsed -= MARKET_WINDOW_SECONDS
    settled = Math.min(RATE_CAP, settled + marketImpact(windowOre, windowPlayers))
    windowOre = 0
    windowPlayers = latestPlayers
  }
}

/** Puts the settled rate back to a value read from storage, on server start. */
export function restoreRate(stored: number): void {
  settled = Math.max(RATE_BASE, Math.min(RATE_CAP, stored))
}
