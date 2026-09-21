import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getOwned } from '../shared/state/inventory'
import { CATALOGUE, findItem, priceOf, ShopItem, ShopItemId } from '../shared/economy/catalogue'
import { getCoins } from '../shared/state/wallet'
import { sendBuy } from '../net/economy-link'

// The Market: where coins turn back into gear. Not to be confused with `state/market.ts`,
// which is the town's ore *price* — this module is the shop the player walks into.

export const SHOP_ENTITY_NAME = 'Market'
export const SHOP_RADIUS_METERS = 5
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
  if (item === null) return false
  const price = currentPrice(item)
  return price !== null && getCoins() >= price
}

/** What buying this costs right now — the M.U.L.E. gets dearer per level. Null when maxed. */
export function currentPrice(item: ShopItem): number | null {
  return priceOf(item, (id) => getOwned(id))
}

/**
 * Asks the server to buy the selected item.
 *
 * `canAffordSelected()` still gates the button, but that is a courtesy to the player, not a
 * check: the server refuses a purchase the balance cannot cover regardless of what this
 * client believed. The sound and the equipped pick follow the server's answer, in
 * `net/economy-link.ts`, so a refused purchase is silent.
 */
export function buySelected(): void {
  const item = getSelectedItem()
  if (item === null) return

  sendBuy(item.id)
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
