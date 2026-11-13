// The compensation screen's state: coins the server says it owes this player for something that
// went wrong (server/compensations.ts). Shown until credited and then closed; the server never
// offers a credited one again, so once closed it is gone for good.

import { sendClaimCompensation } from '../net/economy-link'

/** Who apologises on screen: the bank, for its ledger, or the casino, for a jammed machine. */
export type CompensationOffer = { id: string; coins: number; date: string; kind: 'bank' | 'casino'; claimed: boolean }

let offer: CompensationOffer | null = null
let claiming = false
/** Closed by the player after it was credited: not shown again this visit, even if repeated. */
const closed = new Set<string>()

/** The server's word on a compensation: offered, or credited. */
export function applyCompensation(next: CompensationOffer): void {
  if (closed.has(next.id)) return
  // A repeat of the offer must not undo a credit already seen.
  if (offer !== null && offer.id === next.id && offer.claimed && !next.claimed) return
  offer = next
  if (next.claimed) claiming = false
}

/** The claim was refused: the button can be pressed again. */
export function onCompensationRefused(): void {
  claiming = false
}

/** The compensation to show, or null when there is none. */
export function getCompensation(): CompensationOffer | null {
  return offer
}

export function isClaimingCompensation(): boolean {
  return claiming
}

export function claimCompensation(): void {
  if (offer === null || offer.claimed || claiming) return
  claiming = true
  sendClaimCompensation(offer.id)
}

/** Only a credited compensation can be closed: until then the screen waits for the button. */
export function closeCompensation(): void {
  if (offer === null || !offer.claimed) return
  closed.add(offer.id)
  offer = null
}
