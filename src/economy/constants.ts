// Tunable economy numbers, all in one place.
//
// TBD: every number here is a placeholder. The GDD (§3) parks loop tuning until the full
// mine -> sell -> spend loop is built and playtested, so these exist to make the loop
// runnable, not because they are balanced.

/** Ore granted by a swing that lands inside the sweet spot. */
export const ORE_PER_HIT = 3

/** Ore granted by a swing that misses. A miss still pays: the pick did hit the rock. */
export const ORE_PER_MISS = 1
