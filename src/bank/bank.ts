import { createClickCube } from '../world/click-cube'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getOre } from '../shared/state/wallet'
import { getSyncedRate, quoteSaleForDisplay, sendSell } from '../net/economy-link'
import { oreForCoins } from '../shared/state/market'

export const BANK_ENTITY_NAME = 'Bank'
export const BANK_RADIUS_METERS = 4

let zone: ProximityZone | null = null

// How much of the bag the player has lined up to sell, counted in the COINS it will buy.
// Selling is player-timed and never automatic (decisions.md, 2026-08-31), so nothing here
// fires on its own.
//
// Counting coins rather than ore keeps the selection on whole multiples of the rate: the ore
// shown is always ore that converts, never a remainder the bank would hand back. The rate can
// move while the panel is open, so the ore is worked out from the coins each time it is read.
let sellCoins = 0

export function isPlayerAtBank(): boolean {
  return zone !== null && zone.isPlayerInside()
}

// Closing the panel only hides it for this visit: walking out and back in, or clicking the
// building, opens it again.
let panelClosed = false

export function isBankPanelOpen(): boolean {
  return isPlayerAtBank() && !panelClosed
}

export function closeBankPanel(): void {
  panelClosed = true
  // Otherwise a click would keep the player "at" the bank and walking back in would not reopen it.
  zone?.release()
}

/** Coins the selection buys, clamped to what the bag can pay for at the rate right now. */
export function getSellCoins(): number {
  return clampToBag(sellCoins)
}

/** The ore the selection sells: exactly what leaves the bag for getSellCoins(). */
export function getSellAmount(): number {
  return oreForCoins(getSyncedRate(), getSellCoins())
}

export function changeSellCoins(delta: number): void {
  sellCoins = clampToBag(getSellCoins() + delta)
}

export function setSellCoins(coins: number): void {
  sellCoins = clampToBag(coins)
}

/** The most coins the whole bag buys. */
export function maxSellCoins(): number {
  return quoteSaleForDisplay(getOre())
}

function clampToBag(coins: number): number {
  return Math.max(0, Math.min(Math.floor(coins), maxSellCoins()))
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
  // The sign above the door is a TextShape the Creator Hub names 'Text'.
  const cube = createClickCube(BANK_ENTITY_NAME, 'Text')
  zone = createProximityZone({
    entityName: BANK_ENTITY_NAME,
    radiusMeters: BANK_RADIUS_METERS,
    // Measured from the cube by the door, not the building.
    entity: cube ?? undefined,
    // Walking in with a full bag, the common move is to sell it — so it starts selected.
    click: cube !== null ? { entity: cube, hoverText: 'Open Bank' } : undefined,
    onEnter: () => {
      panelClosed = false
      setSellCoins(maxSellCoins())
      focusPanel('bank')
    },
    onClick: () => {
      if (!panelClosed) return
      panelClosed = false
      setSellCoins(maxSellCoins())
      focusPanel('bank')
    }
  })
  registerPanel('bank', closeBankPanel)

  // The price recovery system moved to the server: one town, one price, one clock.
}
