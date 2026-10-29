import { engine } from '@dcl/sdk/ecs'

import { feedback } from './scene-feedback'
import { isBankPanelOpen } from './bank/bank'
import { isStorePanelOpen } from './shop/shop'
import { isLandOfficePanelOpen } from './land-office/land-office'

// When the onboarding playtest asks (Scene Feedback, src/scene-feedback/questions.ts).
//
// Invitation and questions come together, once the first purchase is done and the Store or the
// Land Office has closed, so they never cover a counter. Both are queued at once: Give feedback
// leads straight into the first question, Skip drops them. Once a visit.
//
// Which actions happened is the server's word (`actionResult`), not the button's: a refused
// purchase does not count.

let bought = false
let asked = false

/** Fed every action result, refused or not, from the economy link. */
export function notePlaytestAction(action: string, ok: boolean): void {
  if (ok && action === 'buy') bought = true
}

function update(): void {
  if (!bought || asked || isBankPanelOpen() || isStorePanelOpen() || isLandOfficePanelOpen()) return
  asked = true
  // not-shown when participation is already known (feedback.enroll()): the ask still follows
  void feedback.intro('first-purchase')
  void feedback.ask(['startMining', 'sellingOre', 'playMore'], 'first-purchase')
}

export function setupPlaytest(): void {
  engine.addSystem(update, undefined, 'client:playtest')
}
