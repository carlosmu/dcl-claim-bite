import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getOre } from '../shared/state/wallet'
import { sendSell } from '../net/economy-link'

export const BANK_ENTITY_NAME = 'Bank'
export const BANK_RADIUS_METERS = 5

let zone: ProximityZone | null = null

// How much of the bag the player has lined up to sell. Selling is player-timed and never
// automatic (decisions.md, 2026-08-31), so nothing here fires on its own.
let sellAmount = 0

export function isPlayerAtBank(): boolean {
  return zone !== null && zone.isPlayerInside()
}

export function getSellAmount(): number {
  return clampToBag(sellAmount)
}

export function changeSellAmount(delta: number): void {
  sellAmount = clampToBag(getSellAmount() + delta)
}

export function setSellAmount(amount: number): void {
  sellAmount = clampToBag(amount)
}

function clampToBag(amount: number): number {
  return Math.max(0, Math.min(Math.floor(amount), getOre()))
}

/**
 * Asks the server to sell the selected ore. Nothing changes here.
 *
 * The payout is not computed on this side any more, not even optimistically: the price can
 * have moved since the panel drew it, because somebody else sold. What the bank pays is
 * whatever the server says it pays, and the HUD updates when the wallet message lands.
 */
export function sellSelectedOre(): void {
  const amount = getSellAmount()
  if (amount <= 0) return

  sendSell(amount)
  // The selection is left alone: getSellAmount() clamps to the bag, so it shrinks by itself
  // once the smaller purse arrives.
}

export function setupBank(): void {
  zone = createProximityZone({
    entityName: BANK_ENTITY_NAME,
    radiusMeters: BANK_RADIUS_METERS,
    // Walking in with a full bag, the common move is to sell it — so it starts selected.
    onEnter: () => setSellAmount(getOre())
  })

  // The price recovery system moved to the server: one town, one price, one clock.
}
