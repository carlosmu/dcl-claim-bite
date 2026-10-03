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

/** The worst it can ever get, no matter how much the town dumps. */
export const RATE_CAP = 12

// --- Market window --------------------------------------------------------------------
//
// Sales are pooled per window rather than priced one by one: the impact is worked out from
// the window's TOTAL volume, on a log curve, so splitting a dump into many small sales buys
// nothing and a whale moves the market less than proportionally. Once a window closes its
// impact is settled into the rate and recovery takes one step back toward the base.

/** How long one market window lasts. */
export const MARKET_WINDOW_SECONDS = 60

/** Impact = IMPACT_SCALE × log2(1 + ore / IMPACT_VOLUME): 100 ore ≈ +0.5, 500 ≈ +1.3, a
 * full minute of ~1500 ore reaches the cap. Strong on purpose: the recovery brings it back. */
export const MARKET_IMPACT_SCALE = 0.5
export const MARKET_IMPACT_VOLUME = 100

/** How far the rate walks back toward the base per window: 12 → 10 takes twenty minutes. */
export const RATE_RECOVERY_PER_WINDOW = 0.1

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

/** Ore the rig digs per hour at level 1, running or not, whether anyone is watching. Each
 * level adds this much again: level N digs N times it. */
export const MULE_ORE_PER_HOUR = 10

/**
 * The player owns one rig and levels it up rather than buying a second (balance.md §0). The
 * level is the count stored in `owned`, so a save from before levels existed keeps its rigs as
 * levels instead of losing them.
 */
export const MULE_MAX_LEVEL = 5

/** Each level costs this much times the one before it. ×1.5 rather than balance.md §0's ×2:
 * yield only grows linearly, and at ×2 the upgrade from level 4 takes 100 days to pay back. */
export const MULE_PRICE_GROWTH = 1.5

/**
 * How much it holds before it stops. Matched to the warehouse on purpose, so a full load is
 * always one trip and never strands ore the player cannot carry.
 */
export const MULE_CAPACITY = 500

// --- Fuel -----------------------------------------------------------------------------
//
// The rig's running cost (balance.md §3). One tank runs it for a day at any level: a higher
// level burns faster and its tank costs more, so the daily return stays the same while the
// margin grows with the level.

/** Hours one tank runs the rig, whatever its level. */
export const FUEL_TANK_HOURS = 24

/** Tanks the rig can hold at once — a missed day is forgiven, a week away is not. */
export const FUEL_MAX_TANKS = 2

/** Coins per tank, times the rig's level. */
export const FUEL_PRICE_PER_LEVEL = 10
