import { ColliderLayer, engine, GltfContainer } from '@dcl/sdk/ecs'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getOwned } from '../shared/state/inventory'
import { buybackOffer, CATALOGUE, demandPrice, priceOf, ShopItem, ShopItemId, unavailableReason } from '../shared/economy/catalogue'
import { PropertyLots } from '../shared/net/property-lots-sync'
import { getCoins } from '../shared/state/wallet'
import { sendBuy } from '../net/economy-link'

// The Market: where coins turn back into gear. Not to be confused with `state/market.ts`,
// which is the town's ore *price* — this module is the shop the player walks into.

/** The officer at the counter: clicking him opens the store, and walking up to him does too. */
const SHOP_OFFICER_ENTITY_NAME = 'store_officer'
export const SHOP_RADIUS_METERS = 4
let zone: ProximityZone | null = null

// Closing the store only hides it for this visit, and the selection only lasts the visit too:
// walking out and back in, or clicking the building, opens it again on its default product.
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
  // Otherwise a click would keep the player "at" the store and walking back in would not reopen it.
  zone?.release()
}

/** The product shown in the detail panel, or null for the store's default. */
export function getSelectedProduct(): string | null {
  return selected
}

export function selectProduct(key: string): void {
  selected = key
}

/** How many homes of this tier stand in town, as the server last synced them. */
function standingCount(id: ShopItemId): number {
  let count = 0
  for (const [, lots] of engine.getEntitiesWith(PropertyLots)) for (const lot of lots.lots) if (lot.kind === id) count++
  return count
}

/** What buying this costs right now, or null when it cannot be bought. */
export function currentPrice(item: ShopItem): number | null {
  return priceOf(item, (id) => getOwned(id), standingCount)
}

/** What the bank pays today for the player's home, or null when they only have the Wagon. */
export function homeBuyback(): { item: ShopItem; coins: number } | null {
  return buybackOffer((id) => getOwned(id), standingCount)
}

/** What this costs at today's demand, even when owned or locked: for price tags. */
export function listPrice(item: ShopItem): number {
  return demandPrice(item, standingCount)
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
  const officer = engine.getEntityOrNullByName(SHOP_OFFICER_ENTITY_NAME)
  // His visible meshes take the pointer too: the model may have no invisible collider to click.
  const model = officer === null ? null : GltfContainer.getMutableOrNull(officer)
  if (model !== null) model.visibleMeshesCollisionMask = (model.visibleMeshesCollisionMask ?? 0) | ColliderLayer.CL_POINTER
  zone = createProximityZone({
    entityName: SHOP_OFFICER_ENTITY_NAME,
    radiusMeters: SHOP_RADIUS_METERS,
    click: officer !== null ? { entity: officer, hoverText: 'hover.store' } : undefined,
    onEnter: () => {
      closed = false
      selected = null
      focusPanel('store')
    },
    onClick: () => {
      if (!closed) return
      closed = false
      selected = null
      focusPanel('store')
    }
  })
  registerPanel('store', closeStorePanel)

  console.log(`[shop] catalogue: ${CATALOGUE.map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
