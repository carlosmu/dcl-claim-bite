// Tunable economy numbers, all in one place.
//
// TBD: every number here is a placeholder. The GDD (§3) parks loop tuning until the full
// mine -> sell -> spend loop is built and playtested, so these exist to make the loop
// runnable, not because they are balanced.
//
// The two anchors they are guessed against are the only prices the GDD does fix: a starting
// pick costs 10 coins, an idle rig 100 coins (decisions.md, 2026-08-31).

/** Ore granted by a swing that lands inside the sweet spot. */
export const ORE_PER_HIT = 3

/** Ore granted by a swing that misses the sweet spot. Nothing: a bad swing is a wasted one. */
export const ORE_PER_MISS = 0

/** Coins per ore when the town has not sold anything for a while. */
export const ORE_BASE_PRICE = 2

/** The price never falls below this, no matter how much the town dumps. */
export const ORE_MIN_PRICE = 0.5

/** How much every single ore sold pushes the price down. */
export const PRICE_DROP_PER_ORE = 0.01

/** How fast the price climbs back toward ORE_BASE_PRICE while nobody sells. */
export const PRICE_RECOVERY_PER_SECOND = 0.02

/**
 * The shortest gap the server accepts between two swings from the same player. Anything
 * faster is dropped, not paid.
 *
 * The bar sweeps in 1.6s and the needle bounces, so the sweet spot passes about every 0.8s:
 * that is the fastest a player can legitimately *score*. This sits below that on purpose, so
 * network jitter or an eager tapper is never punished — it exists to cap an autoclicker at
 * two swings a second instead of twenty, not to police honest play.
 *
 * TBD: a real fix validates the swing's timing rather than its rate, which needs the sweep
 * to be server-driven (design/decisions.md, 2026-09-15).
 */
export const MIN_SWING_INTERVAL_SECONDS = 0.5
