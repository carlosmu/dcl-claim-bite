// Tunable economy numbers, all in one place.
//
// These are the owner-approved values of 2026-09-16; design/balance.md explains where each
// one comes from and what it is meant to feel like. If the two disagree, this file is wrong.
//
// They are still hand-tuned rather than measured: the playtest that would justify them has
// not happened, so treat every number here as a starting point (GDD §3).

/** Ore granted by a swing that misses the sweet spot. Nothing: a bad swing is a wasted one. */
export const ORE_PER_MISS = 0

// --- The rate -------------------------------------------------------------------------
//
// Quoted as ORE PER COIN, like a currency board: selling pushes it UP, and up is worse for
// the seller. Ten hits pay a coin, which is the one number a player can verify unaided.

/** The rate a quiet market settles at. */
export const RATE_BASE = 10

/** The worst it can ever get, no matter how much the town dumps. 4x the base. */
export const RATE_CAP = 40

// --- Two speeds -----------------------------------------------------------------------
//
// One rate cannot both recover over hours and visibly answer a single sale: a slow recovery
// with a perceptible impact drives the equilibrium far past the cap. So the rate is the sum
// of a slow macro drift and a fast personal slippage.

/** How much one ore sold pushes the slippage up. 200 ore moves the rate a full point. */
export const SLIPPAGE_PER_ORE = 0.005

/** Slippage decays toward zero with this time constant: about a minute and a half. */
export const SLIPPAGE_RECOVERY_SECONDS = 90

/** How much one ore sold pushes the macro up. Invisible per sale; the town's volume is not. */
export const MACRO_PER_ORE = 0.00002

/**
 * The macro's time constant PER CONNECTED PLAYER: about three hours for one player, and
 * proportionally faster as the town fills.
 *
 * Scaling this with population is what keeps the market alive at twenty players. Production
 * scales with population too, so the two cancel and the equilibrium rate lands in the same
 * place in an empty town and a full one. Held fixed, a crowd would pin the rate at the cap
 * permanently — killing the choice of when to sell, and putting the market at odds with the
 * boom-town bonus, which exists to make a crowd a good thing.
 */
export const MACRO_RECOVERY_SECONDS_PER_PLAYER = 3 * 60 * 60

// --- Carrying -------------------------------------------------------------------------

/** What fits in the bag with no wheelbarrow: about two minutes of digging at the base pick. */
export const CARRY_BASE = 150

/**
 * What fits with one.
 *
 * The base sits below the 200 ore needed to move the slippage a full point, and this sits
 * well above it — so the wheelbarrow is what promotes a player from a seller the market
 * ignores to one it notices, and only then does choosing a sale amount start to matter.
 */
export const CARRY_WITH_WHEELBARROW = 500

// --- Anti-abuse -----------------------------------------------------------------------

/**
 * The shortest gap the server accepts between two swings from the same player. Anything
 * faster is dropped, not paid.
 *
 * The bar sweeps in 1.6s and the needle bounces, so the sweet spot passes about every 0.8s:
 * that is the fastest a player can legitimately score. This sits below that on purpose, so
 * network jitter or an eager tapper is never punished — it exists to cap an autoclicker at
 * two swings a second instead of twenty, not to police honest play.
 *
 * TBD: a real fix validates the swing's timing rather than its rate, which needs the sweep
 * to be server-driven (design/decisions.md, 2026-09-15).
 */
export const MIN_SWING_INTERVAL_SECONDS = 0.5

// --- The M.U.L.E. ---------------------------------------------------------------------
//
// The idle rig. It works while the player is away, which is the whole reason it justifies its
// price — see design/balance.md §4.

/** Ore the rig digs per hour, running or not, whether anyone is watching. */
export const MULE_ORE_PER_HOUR = 60

/**
 * How much it holds before it stops. Matched to the wheelbarrow on purpose, so a full load is
 * always one trip and never strands ore the player cannot carry.
 */
export const MULE_CAPACITY = 500
