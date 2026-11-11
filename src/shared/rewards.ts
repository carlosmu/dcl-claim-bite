// The Claim Office's rewards: free wearables given to players who complete a short quest. Shared
// by both halves: the server checks the steps and asks the Rewards service, the client shows them.
//
// One entry of REWARD_CAMPAIGNS per reward. To add one: add an entry here, create its campaign at
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
  /** The item's picture, the whole image (a scene path or a URL). Empty: the gift icon from the UI atlas instead. */
  thumbnail: string
  /** The quest, in the order it is listed. Each step counts from the day the campaign went live. */
  steps: readonly RewardStepId[]
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
    steps: ['sold', 'bought', 'surveyed'],
    dispenserKeyVar: 'REWARDS_DISPENSER_KEY'
  }
]

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
