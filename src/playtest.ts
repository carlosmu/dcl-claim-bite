import { engine } from '@dcl/sdk/ecs'

import { feedback } from './scene-feedback'
import { isBankPanelOpen } from './bank/bank'
import { isStorePanelOpen } from './shop/shop'
import { isLandOfficePanelOpen } from './land-office/land-office'

// When the onboarding playtest asks (Scene Feedback, src/scene-feedback/questions.ts).
//
// The invitation comes once the first sale is done and the Bank's panel has closed, so it never
// covers the counter; the questions come once the first purchase is done and the Store or the
// Land Office has closed, and only to a player who said yes. Both are once a visit.
//
// Which actions happened is the server's word (`actionResult`), not the button's: a refused
// sale or purchase does not count.

let sold = false
let bought = false
let introAsked = false
let questionsAsked = false

/** Fed every action result, refused or not, from the economy link. */
export function notePlaytestAction(action: string, ok: boolean): void {
  if (!ok) return
  if (action === 'sell') sold = true
  if (action === 'buy') bought = true
}

function update(): void {
  if (sold && !introAsked && !isBankPanelOpen()) {
    introAsked = true
    void feedback.intro('first-sale')
  }

  if (!bought || questionsAsked || isStorePanelOpen() || isLandOfficePanelOpen()) return
  const participation = feedback.participation()
  // Still waiting on the invitation (or it has not come yet): the purchase is kept until it is answered.
  if (participation === 'unknown') return
  questionsAsked = true
  if (participation === 'out') return
  void feedback.ask(['startMining', 'sellingOre', 'playMore'], 'first-purchase')
}

export function setupPlaytest(): void {
  engine.addSystem(update, undefined, 'client:playtest')
}
