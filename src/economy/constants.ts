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

/** Ore granted by a swing that misses. A miss still pays: the pick did hit the rock. */
export const ORE_PER_MISS = 1

/** Coins per ore when the town has not sold anything for a while. */
export const ORE_BASE_PRICE = 2

/** The price never falls below this, no matter how much the town dumps. */
export const ORE_MIN_PRICE = 0.5

/** How much every single ore sold pushes the price down. */
export const PRICE_DROP_PER_ORE = 0.01

/** How fast the price climbs back toward ORE_BASE_PRICE while nobody sells. */
export const PRICE_RECOVERY_PER_SECOND = 0.02
