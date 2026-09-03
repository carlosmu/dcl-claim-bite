import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { CATALOGUE, findItem, ShopItem, ShopItemId } from '../economy/catalogue'
import { getCoins, spendCoins } from '../state/wallet'
import { addOwned } from '../state/inventory'
import { playSfx } from '../world/sfx'
import { equipPick } from '../player/held-pick'

// The Market: where coins turn back into gear. Not to be confused with `state/market.ts`,
// which is the town's ore *price* — this module is the shop the player walks into.

export const SHOP_ENTITY_NAME = 'Market'
export const SHOP_RADIUS_METERS = 5
const BUY_SOUND_CLIP = 'assets/sounds/buy.mp3'
const BUY_SOUND_VOLUME = 0.8

let zone: ProximityZone | null = null
let selectedId: ShopItemId | null = null

export function isPlayerAtShop(): boolean {
  return zone !== null && zone.isPlayerInside()
}

export function getSelectedItem(): ShopItem | null {
  return selectedId === null ? null : findItem(selectedId)
}

export function getSelectedItemId(): ShopItemId | null {
  return selectedId
}

export function selectItem(id: ShopItemId): void {
  selectedId = id
}

export function canAffordSelected(): boolean {
  const item = getSelectedItem()
  return item !== null && getCoins() >= item.price
}

/** Buys the selected item, if the balance covers it. Does nothing otherwise. */
export function buySelected(): void {
  const item = getSelectedItem()
  if (item === null) return

  if (!spendCoins(item.price)) {
    console.log(`[shop] not enough coins for ${item.label} (${item.price}, balance ${getCoins()})`)
    return
  }

  addOwned(item.id)
  playSfx(BUY_SOUND_CLIP, BUY_SOUND_VOLUME)
  if (item.id === 'pick') equipPick()
  console.log(`[shop] bought ${item.label} for ${item.price} coins · balance ${getCoins()}`)
}

export function setupShop(): void {
  zone = createProximityZone({
    entityName: SHOP_ENTITY_NAME,
    radiusMeters: SHOP_RADIUS_METERS,
    // Walking away drops the selection, so the panel never reopens on a stale choice.
    onLeave: () => {
      selectedId = null
    }
  })

  console.log(`[shop] catalogue: ${CATALOGUE.map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
