import { engine } from '@dcl/sdk/ecs'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { addCoins, getOre, takeOre } from '../state/wallet'
import { applySale, getOrePrice, quoteSale, recoverPrice } from '../state/market'
import { playSfx } from '../world/sfx'

export const BANK_ENTITY_NAME = 'Bank'
export const BANK_RADIUS_METERS = 5
const BANK_SOUND_CLIP = 'assets/sounds/bank.mp3'
const BANK_SOUND_VOLUME = 0.8

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

/** Turns the selected ore into coins at today's price, and pushes the price down. */
export function sellSelectedOre(): void {
  const amount = getSellAmount()
  if (amount <= 0) return

  const payout = quoteSale(amount) // priced before the sale moves the market
  if (!takeOre(amount)) return

  applySale(amount)
  addCoins(payout)
  sellAmount = getOre() // whatever is left, ready to sell again
  playSfx(BANK_SOUND_CLIP, BANK_SOUND_VOLUME)

  console.log(`[bank] sold ${amount} ore for ${payout} coins · price now ${getOrePrice().toFixed(2)}`)
}

export function setupBank(): void {
  zone = createProximityZone({
    entityName: BANK_ENTITY_NAME,
    radiusMeters: BANK_RADIUS_METERS,
    // Walking in with a full bag, the common move is to sell it — so it starts selected.
    onEnter: () => setSellAmount(getOre())
  })

  engine.addSystem((dt: number) => recoverPrice(dt), undefined, 'market-recovery')
}
