// The items handed out through Decentraland Rewards campaigns: the Claim Office's free wearables,
// given to players who complete a short quest, and the Tailor Shop's, sold for coins. Shared by
// both halves: the server checks the steps (or takes the coins) and asks the Rewards service, the
// client shows them.
//
// One entry of REWARD_CAMPAIGNS per item. To add one: add an entry here, create its campaign at
// rewards.decentraland.org and put the campaign's dispenser key in the environment variable the
// entry names (decentraland.org/storage → Environment, or `.env` in a local preview).
//
// Which item the player gets is the Rewards campaign's business, not this file's: the server only
// sends the campaign's dispenser key and the player's address. What is here is the quest and how
// the Claim Office presents it.

/**
 * The things a quest can ask for, each noticed by the server when it happens:
 *   sold      sold ore at the Bank
 *   bought    bought something at the General Store
 *   surveyed  answered one of REWARD_SURVEY_QUESTIONS
 * A new kind of step needs its name here, its line below and a noteRewardStep call in the server.
 */
export type RewardStepId = 'sold' | 'bought' | 'surveyed'

/** How each step reads in the quest's checklist. */
export const REWARD_STEP_LABELS: Record<RewardStepId, string> = {
  sold: 'Sell ore at the Bank',
  bought: 'Buy at the General Store',
  surveyed: 'Answer a feedback survey'
}

/** Where an item is handed out: the Claim Office for quests, the Tailor Shop for sales. */
export type RewardVenue = 'claim' | 'tailor'

export type RewardCampaign = {
  /**
   * The key the player's progress is stored under. Never change it once the campaign is live:
   * everybody's progress and claims would be forgotten.
   */
  id: string
  /** The card in the list: short, the full name is in the detail. */
  cardTitle: string
  name: string
  description: string
  /** The item's picture, the whole image (a scene path or a URL). Empty: an icon from the UI atlas instead (ui.tsx, REWARD_ICONS, else the gift). */
  thumbnail: string
  venue: RewardVenue
  /** The quest, in the order it is listed. Each step counts from the day the campaign went live. Empty for an item that is only sold. */
  steps: readonly RewardStepId[]
  /**
   * Coins taken when it is claimed, on top of the quest. Taken before the Rewards service is
   * asked and given back if it says no, so a failed claim costs nothing. 0: free.
   */
  price: number
  /** Shown but not claimable yet: the card says Coming Soon and the server turns claims down. */
  comingSoon: boolean
  /** The server environment variable that holds the campaign's dispenser key. The key itself is a secret and never here. */
  dispenserKeyVar: string
}

export const REWARD_CAMPAIGNS: readonly RewardCampaign[] = [
  {
    id: 'bug-catcher',
    cardTitle: 'Jacket',
    name: 'Bug Catcher Gear',
    description: 'Suit up, catch bugs, and make games better!',
    thumbnail: 'assets/images/wearable.png',
    venue: 'claim',
    steps: ['sold', 'bought', 'surveyed'],
    price: 0,
    comingSoon: false,
    dispenserKeyVar: 'REWARDS_DISPENSER_KEY'
  },
  {
    // An emote. Until its campaign exists: no dispenser key, and Coming Soon at the Tailor Shop.
    id: 'claim-bite-mining',
    cardTitle: 'Mining Emote',
    name: 'Claim Bite Mining',
    description: 'Swing a pick wherever you go, like a true Claim Bite miner.',
    // Empty: the UI shows the ore icon from its atlas (ui.tsx, REWARD_ICONS).
    thumbnail: '',
    venue: 'tailor',
    steps: [],
    price: 500,
    comingSoon: true,
    dispenserKeyVar: 'REWARDS_DISPENSER_KEY_MINING_EMOTE'
  }
]

/** The items one place hands out, in the order they are listed. */
export function rewardCampaignsAt(venue: RewardVenue): RewardCampaign[] {
  return REWARD_CAMPAIGNS.filter((campaign) => campaign.venue === venue)
}

/** The campaign that saves from before there were several (the purse's old `gift`) belong to. */
export const LEGACY_GIFT_CAMPAIGN_ID = 'bug-catcher'

export function findRewardCampaign(id: string): RewardCampaign | null {
  return REWARD_CAMPAIGNS.find((campaign) => campaign.id === id) ?? null
}

/**
 * The questions whose answer counts as completing a survey: the first purchase's onboarding
 * set, the one repeated every few purchases and the Feedback button's. Not the bug report.
 */
export const REWARD_SURVEY_QUESTIONS: readonly string[] = ['startMining', 'sellingOre', 'playMore', 'generalFeedback']

/** Where the player stands with one campaign, as the server tells it. */
export type RewardStatus = {
  /** The campaign's id. */
  id: string
  /** The steps of its quest already met. */
  done: string[]
  claimed: boolean
  /** A claim sent to the Rewards service and not answered yet. */
  claiming: boolean
}
