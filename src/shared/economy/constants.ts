// Tunable economy numbers, all in one place.
//
// These are the owner-approved values of 2026-09-16; design/balance.md explains where each
// one comes from and what it is meant to feel like. If the two disagree, this file is wrong.
//
// They are still hand-tuned rather than measured: the playtest that would justify them has
// not happened, so treat every number here as a starting point (GDD §3).

// --- Mining a rock ---------------------------------------------------------------------
//
// No timing bar (design/balance.md §2, 2026-09-17): standing at the active rock swings on its
// own, one hit per swing, and a full progress bar pays the rock. The pick decides how many
// hits that takes.

/** Ore a completed rock pays. */
export const ORE_PER_ROCK = 5

/**
 * The boom-town bonus (balance.md §2): extra ore for each OTHER player active on the same rock
 * when a bar completes. Alone 5, two players 6 each, three 7. No cap yet (open).
 */
export const BOOM_TOWN_BONUS_PER_MINER = 1

/**
 * One swing: the length of `assets/animations/mine_emote.glb` (1.083s, read off the clip).
 *
 * The hit lands when this runs out, so the bar gains its block as the animation finishes rather
 * than mid-swing. Shorter than the clip and every swing cuts the previous one off before it
 * ends — including the last one, whose follow-through never got drawn. Re-measure this if the
 * emote is ever re-exported.
 */
export const SWING_SECONDS = 1

/**
 * How recently another player must have landed a hit to count as active on the rock. A bit
 * over two swings, so one late message does not drop a miner who is still there.
 */
export const BOOM_TOWN_ACTIVE_SECONDS = SWING_SECONDS * 2.5

/** How close to the rock the player has to stand, measured flat on the ground. */
export const MINE_REACH_METERS = 1.8

/**
 * How far the player's facing may stray from the rock and still swing, either side. 60° is a
 * generous cone: facing roughly toward it counts, standing sideways or with your back to it
 * does not.
 */
export const MINE_FACING_DEGREES = 60

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

/**
 * Pockets: what a player holds before owning a warehouse (balance.md §4, tier 0) — about 20
 * completed rocks, enough that manual mining works from the first swing.
 */
export const CARRY_BASE = 100

/**
 * With a tier-1 warehouse (balance.md §4). One storage for all ore: manual mining fills it and
 * selling draws from it. Replaces the carry bag and the wheelbarrow.
 */
export const CARRY_WITH_WAREHOUSE = 500

// --- Anti-abuse -----------------------------------------------------------------------

/**
 * How much of a rock's honest duration (hits × SWING_SECONDS) the server insists on between
 * two paid rocks from the same player. Below 1 so network jitter never costs an honest miner
 * a rock; it exists to stop a modified client claiming rocks it never swung at.
 */
export const ROCK_TIME_TOLERANCE = 0.8

// --- The M.U.L.E. ---------------------------------------------------------------------
//
// The idle rig. It works while the player is away, which is the whole reason it justifies its
// price — see design/balance.md §4.

/** Ore the rig digs per hour, running or not, whether anyone is watching. */
export const MULE_ORE_PER_HOUR = 60

/**
 * How much it holds before it stops. Matched to the warehouse on purpose, so a full load is
 * always one trip and never strands ore the player cannot carry.
 */
export const MULE_CAPACITY = 500
