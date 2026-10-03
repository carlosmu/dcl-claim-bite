import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getOwned } from '../shared/state/inventory'
import { CATALOGUE, priceOf, ShopItem, ShopItemId, unavailableReason } from '../shared/economy/catalogue'
import { getCoins } from '../shared/state/wallet'
import { sendBuy } from '../net/economy-link'

// The Market: where coins turn back into gear. Not to be confused with `state/market.ts`,
// which is the town's ore *price* — this module is the shop the player walks into.

export const SHOP_ENTITY_NAME = 'Market'
export const SHOP_RADIUS_METERS = 5
let zone: ProximityZone | null = null

// Closing the store only hides it for this visit, and the selection only lasts the visit too:
// walking out and back in opens it again on its default product.
let closed = false
let selected: string | null = null

export function isPlayerAtShop(): boolean {
  return zone !== null && zone.isPlayerInside()
}

export function isStorePanelOpen(): boolean {
  return isPlayerAtShop() && !closed
}

export function closeStorePanel(): void {
  closed = true
}

/** The product shown in the detail panel, or null for the store's default. */
export function getSelectedProduct(): string | null {
  return selected
}

export function selectProduct(key: string): void {
  selected = key
}

/** What buying this costs right now, or null when it cannot be bought. */
export function currentPrice(item: ShopItem): number | null {
  return priceOf(item, (id) => getOwned(id))
}

/** Why this cannot be bought right now (coins aside), or null when it can. */
export function whyUnavailable(item: ShopItem): string | null {
  return unavailableReason(item, (id) => getOwned(id))
}

/** Whether the player can buy this right now, coins included. */
export function canBuy(item: ShopItem): boolean {
  const price = currentPrice(item)
  return price !== null && getCoins() >= price
}

/**
 * Asks the server to buy an item.
 *
 * `canBuy()` still gates the button, but that is a courtesy to the player, not a check: the
 * server refuses a purchase the balance cannot cover regardless of what this client believed.
 * The sound and the equipped pick follow the server's answer, in `net/economy-link.ts`, so a
 * refused purchase is silent.
 */
export function buyItem(id: ShopItemId): void {
  sendBuy(id)
}

export function setupShop(): void {
  zone = createProximityZone({
    entityName: SHOP_ENTITY_NAME,
    radiusMeters: SHOP_RADIUS_METERS,
    onEnter: () => {
      closed = false
      selected = null
    }
  })

  console.log(`[shop] catalogue: ${CATALOGUE.map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
