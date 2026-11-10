import { engine } from '@dcl/sdk/ecs'

import { feedback } from './scene-feedback'
import { isBankPanelOpen } from './bank/bank'
import { isStorePanelOpen } from './shop/shop'
import { isLandOfficePanelOpen } from './land-office/land-office'

// When the playtest asks (Scene Feedback, src/scene-feedback/questions.ts).
//
// Paced by the store purchases the player has ever made, which the server keeps with the purse
// and sends after each one (`purchaseCount`), so a returning player is not asked all over again:
// - the first purchase ever: the Intro and the onboarding questions, queued at once, so Give
//   feedback leads straight into the first one and Skip drops them;
// - then every PURCHASES_BETWEEN_ASKS more (11, 21, ...): one question alone, no Intro, unless
//   the player has said no to the Intro or skipped one of these this visit.
// Each waits until the Store, the Bank or the Land Office has closed, so it never covers a counter.
//
// The Feedback button (src/ui.tsx) asks whenever the player wants, apart from all this.

/** Purchases between one repeat ask and the next, after the first purchase. */
const PURCHASES_BETWEEN_ASKS = 10

/** The purchase count waiting for the counters to close, or 0. */
let pendingCount = 0
/** A repeat ask skipped this visit: no more of them until the next. */
let repeatsDeclined = false

/** Fed every `purchaseCount` from the economy link. */
export function notePurchaseCount(count: number): void {
  if (count === 1 || (count > 1 && (count - 1) % PURCHASES_BETWEEN_ASKS === 0)) pendingCount = count
}

function update(): void {
  if (pendingCount === 0 || isBankPanelOpen() || isStorePanelOpen() || isLandOfficePanelOpen()) return
  const count = pendingCount
  pendingCount = 0

  if (count === 1) {
    // not-shown when participation is already known (feedback.enroll()): the ask still follows
    void feedback.intro('first-purchase')
    void feedback.ask(['startMining', 'sellingOre', 'playMore'], 'first-purchase')
    return
  }
  if (repeatsDeclined || feedback.participation() === 'out') return
  void feedback.ask('playMore', `purchase-${count}`, { skipIntro: true }).then((result) => {
    if (result === 'skipped') repeatsDeclined = true
  })
}

/** The Feedback button's two choices: no Intro, straight to the question. */
export function giveFeedback(): void {
  void feedback.leaveFeedback(['generalFeedback'], 'button-feedback', { skipIntro: true })
}

export function reportBug(): void {
  void feedback.leaveFeedback(['bugReport'], 'button-bug', { skipIntro: true })
}

export function setupPlaytest(): void {
  engine.addSystem(update, undefined, 'client:playtest')
}
