// What the Market sells, and what owning it does.
//
// Prices and effects are the owner-approved values of 2026-09-16 — see design/balance.md for
// the reasoning behind each one. Two axes that ask different questions: how fast you dig
// (picks) and how much ore can pile up (warehouse), plus the two long goals.
//
// The Shovel was removed on 2026-09-16: it had no answer to "what is this for".

import {
  CARRY_BASE,
  CARRY_WITH_WAREHOUSE,
  FUEL_PRICE_PER_LEVEL,
  MULE_CAPACITY,
  MULE_MAX_LEVEL,
  MULE_PRICE_GROWTH
} from './constants'

export type ShopItemId = 'pick' | 'steel-pick' | 'miners-pick' | 'warehouse' | 'mule' | 'fuel' | 'house' | 'horse' | 'revolver'

export type ShopItem = {
  id: ShopItemId
  label: string
  price: number
  /** Hits a rock takes while this is the best pick owned — fewer is better. Only picks carry it. */
  hitsPerRock?: number
  /** Shown in the Market but not for sale yet. */
  comingSoon?: boolean
}

export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: 'Iron Pick', price: 5, hitsPerRock: 12 },
  { id: 'steel-pick', label: 'Steel Pick', price: 10, hitsPerRock: 9 },
  { id: 'miners-pick', label: 'Diamond Pick', price: 30, hitsPerRock: 6 },
  { id: 'warehouse', label: 'Warehouse', price: 50 },
  { id: 'mule', label: 'M.U.L.E.', price: 100 },
  // One tank; the price shown is per level of the rig (see priceOf). Needs a rig to go in.
  { id: 'fuel', label: 'Fuel', price: FUEL_PRICE_PER_LEVEL },
  { id: 'house', label: 'House', price: 500 },
  { id: 'horse', label: 'Horse', price: 0, comingSoon: true },
  { id: 'revolver', label: 'Revolver', price: 0, comingSoon: true }
]

export function findItem(id: ShopItemId): ShopItem | null {
  return CATALOGUE.find((item) => item.id === id) ?? null
}

/** Every pick in the catalogue, worst first. */
export const PICKS: ShopItem[] = CATALOGUE.filter((item) => item.hitsPerRock !== undefined)

/**
 * The best pick the player owns: the one that needs the fewest hits.
 *
 * Null when they own no pick at all — the mayor's gift is what starts the loop, so having
 * nothing in hand should pay nothing rather than quietly paying as if bare hands were a tool.
 */
export function bestPick(ownedCount: (id: ShopItemId) => number): ShopItem | null {
  let best: ShopItem | null = null
  for (const pick of PICKS) {
    if (ownedCount(pick.id) > 0 && (best === null || pick.hitsPerRock! < best.hitsPerRock!)) best = pick
  }
  return best
}

/**
 * The pick the player is actually using: the one they chose in the inventory, if they still
 * own it, otherwise the best they own. Choosing is only ever between picks already owned.
 */
export function activePick(ownedCount: (id: ShopItemId) => number, equipped: string): ShopItem | null {
  const chosen = PICKS.find((pick) => pick.id === equipped)
  if (chosen !== undefined && ownedCount(chosen.id) > 0) return chosen
  return bestPick(ownedCount)
}

/** Hits a rock takes with the best pick owned. Zero means no pick: the player cannot mine. */
export function bestHitsPerRock(ownedCount: (id: ShopItemId) => number): number {
  return bestPick(ownedCount)?.hitsPerRock ?? 0
}

/** How much ore the player can hold — pockets, or a warehouse once they own one. */
export function carryCapacity(ownedCount: (id: ShopItemId) => number): number {
  return ownedCount('warehouse') > 0 ? CARRY_WITH_WAREHOUSE : CARRY_BASE
}

/**
 * What the next purchase of this item costs, or null when it cannot be bought again.
 *
 * The M.U.L.E. varies: buying it again is levelling it up, and each level costs
 * MULE_PRICE_GROWTH times the one before. Fuel costs more per tank the higher the rig. `item.price` is the price of level 1.
 */
export function priceOf(item: ShopItem, ownedCount: (id: ShopItemId) => number): number | null {
  if (item.comingSoon === true) return null
  const level = muleLevel(ownedCount)
  if (item.id === 'fuel') return level > 0 ? item.price * level : null
  if (item.id !== 'mule') return item.price
  if (level >= MULE_MAX_LEVEL) return null
  return Math.round(item.price * Math.pow(MULE_PRICE_GROWTH, level))
}

/**
 * The rig's level: how many times it was bought, capped. Saves from before the cap came down
 * may hold more, and they simply run at the top level.
 */
export function muleLevel(ownedCount: (id: ShopItemId) => number): number {
  return Math.min(ownedCount('mule'), MULE_MAX_LEVEL)
}

/** Ore the rig holds before it stops: about two days of its own output at every level. */
export function muleCapacity(level: number): number {
  return MULE_CAPACITY * level
}
