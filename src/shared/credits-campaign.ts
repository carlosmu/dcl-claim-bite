// The Marketplace Credits campaign: "Claim Bite – Mine Twice, Get Paid!". Shared by both halves:
// the server counts and decides, the client only shows what it is told.
//
// Day 1: mine CAMPAIGN_ROCKS_PER_DAY shared rocks to reserve the reward. Any later game day while
// the campaign is open: mine as many again to claim it. Once per wallet. The mayor's practice
// rocks do not count. Days are game days, turning over at DAY_START_HOUR_UTC (shared/titles.ts).
//
// The credits are not paid by the scene: the owner delivers them by hand to the winners, read from
// the Storage panel (scene key `<CAMPAIGN_ID>-entries`, the rows with `claimedAt`) or copied from
// the admin row in the bug-report menu.
//
// Start, end and the soft cap are not here: they live in the scene key `<CAMPAIGN_ID>-config`,
// edited live at decentraland.org/storage (server/credits-campaign.ts).

/** Part of every storage key. Never change it while the campaign is live: everyone would start over. */
export const CAMPAIGN_ID = 'credits-1'

/** Shared rocks to finish on each of the two days, unless the live config's `rocksPerDay` says otherwise. */
export const CAMPAIGN_ROCKS_PER_DAY = 20

/** Marketplace Credits each winner gets, as the screen says it. */
export const CAMPAIGN_REWARD_CREDITS = 10

/**
 * Where a player stands, as the server tells it:
 *   off       no campaign right now (over, or not configured): nothing shown
 *   soon      configured but not started yet: shown with the time left to the start
 *   late     open, but this is its last day and they have not reserved: day 2 would never come
 *   day1      counting towards the reservation
 *   reserved  reserved today; the claim opens with the next game day
 *   day2      a later day: counting towards the claim
 *   claimed   done: the credits are on their way
 */
export type CampaignPhase = 'off' | 'soon' | 'late' | 'day1' | 'reserved' | 'day2' | 'claimed'

export const CAMPAIGN_PHASES: readonly CampaignPhase[] = ['off', 'soon', 'late', 'day1', 'reserved', 'day2', 'claimed']
