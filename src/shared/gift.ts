// The free wearable the Claim Office gives away, to players who have sold ore at the Bank, bought
// something at the General Store and answered a feedback survey. Shared by both halves: the
// server checks the requirements and asks the Rewards service for it, the client shows it.
//
// Which item the player gets is the Rewards campaign's business, not this file's: the server
// only sends the campaign's dispenser key (the REWARDS_DISPENSER_KEY environment variable) and
// the player's address. What is here is only how the Claim Office presents it.

export const GIFT_WEARABLE = {
  name: 'Bug Catcher Gear',
  description: 'Suit up, catch bugs, and make games better!',
  // The item's picture, the whole image (a scene path or a URL). Empty: the gift icon from the UI atlas instead.
  thumbnail: 'assets/images/wearable.png'
}

/**
 * The questions whose answer counts as completing a survey: the first purchase's onboarding
 * set, the one repeated every few purchases and the Feedback button's. Not the bug report.
 */
export const GIFT_SURVEY_QUESTIONS: readonly string[] = ['startMining', 'sellingOre', 'playMore', 'generalFeedback']

/** Where the player stands with the gift. Each requirement counts from the day the gift went live. */
export type GiftStatus = {
  sold: boolean
  bought: boolean
  surveyed: boolean
  claimed: boolean
  /** A claim sent to the Rewards service and not answered yet. */
  claiming: boolean
}
