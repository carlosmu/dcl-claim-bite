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

/** Ore a completed rock pays, before the Social Bonus. */
export const ORE_PER_ROCK = 10

/**
 * The Social Bonus: extra ore per finished rock, by how many players are actively mining in the
 * area right now — the finisher included, on any rock, not just the same one. Indexed by that
 * count; past the end it stays at the last value (capped at +10 from four miners up).
 *
 * Each player gets the whole bonus on their own rock; nothing is split.
 */
export const SOCIAL_BONUS_BY_MINERS = [0, 0, 5, 8, 10]

/** The Social Bonus for this many active miners. */
export function socialBonus(activeMiners: number): number {
  const index = Math.max(0, Math.min(Math.floor(activeMiners), SOCIAL_BONUS_BY_MINERS.length - 1))
  return SOCIAL_BONUS_BY_MINERS[index]
}

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
 * How recently another player must have landed a hit to count as still working a rock, which
 * holds the rock in place until they finish. A bit over two swings, so one late message does
 * not drop a miner who is still there.
 */
export const ROCK_ACTIVE_SECONDS = SWING_SECONDS * 2.5

/**
 * How long after their last swing (or finished rock) a player still counts as an active miner
 * for the Social Bonus. Miners with different picks fall out of step: one with a 6-hit pick
 * finishes and waits while a companion on 12 hits is still at it, then both walk on. So this
 * covers a whole rock with the slowest pick (12 hits) plus the walk to the next, and someone
 * who truly wanders off or idles still drops out.
 */
export const SOCIAL_ACTIVE_SECONDS = 15

/** How close to the rock the player has to stand, measured flat on the ground. */
export const MINE_REACH_METERS = 2.5

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

// One storage for all ore: manual mining and the M.U.L.E.s fill it, selling draws from it. When
// it is full, mining stops paying and the rigs pause until there is room (V1 economy,
// 2026-10-03).

/** Free from the start: about 40 completed rocks. */
export const STORAGE_BASE = 200

/** With the first storage upgrade. */
export const STORAGE_TIER_1 = 1000

/** With the second storage upgrade. */
export const STORAGE_TIER_2 = 3000

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
// price. V1 economy (2026-10-03): rigs are bought one by one at a flat price and output scales
// linearly with how many the player owns. Each digs straight into the player's storage.

/** Ore one rig digs per hour while it has fuel and the storage has room: 200 a day, about 20
 * coins at the base rate. */
export const MULE_ORE_PER_HOUR = 200 / 24

/**
 * The most rigs one player can own. The design sets no limit; this only keeps a typo or a
 * runaway purchase loop from parking a hundred rigs in the yard. The count is stored in
 * `owned`, so a save from the levelled-rig days keeps its levels as rigs.
 */
export const MULE_MAX_COUNT = 10

// --- Fuel -----------------------------------------------------------------------------
//
// The rigs' running cost, as a physical resource: gallons. One gallon runs one rig for one day,
// so a fleet of N burns N gallons a day, and at 5 coins a gallon every rig nets about 15 coins
// a day whatever the fleet size. When the fuel runs out the rigs pause; nothing is lost.
//
// The tank grows with the fleet: it holds FUEL_MAX_DAYS days for every rig, so however many
// rigs a player owns, a full tank keeps them running a week away and no longer.

/** Coins per gallon. */
export const FUEL_PRICE_PER_GALLON = 5

/** Gallons one rig burns in a day. */
export const FUEL_GALLONS_PER_RIG_DAY = 1

/** The most autonomy the tank can hold: its capacity is this many days for each rig owned. */
export const FUEL_MAX_DAYS = 7
