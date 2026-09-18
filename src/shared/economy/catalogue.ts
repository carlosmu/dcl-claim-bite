// What the Market sells, and what owning it does.
//
// Prices and effects are the owner-approved values of 2026-09-16 — see design/balance.md for
// the reasoning behind each one. Two axes that ask different questions: how fast you dig
// (picks) and how much ore can pile up (warehouse), plus the two long goals.
//
// The Shovel was removed on 2026-09-16: it had no answer to "what is this for".

import { CARRY_BASE, CARRY_WITH_WAREHOUSE } from './constants'

export type ShopItemId = 'pick' | 'steel-pick' | 'miners-pick' | 'warehouse' | 'mule' | 'house'

export type ShopItem = {
  id: ShopItemId
  label: string
  price: number
  /** Hits a rock takes while this is the best pick owned — fewer is better. Only picks carry it. */
  hitsPerRock?: number
}

export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: 'Iron Pick', price: 10, hitsPerRock: 12 },
  { id: 'steel-pick', label: 'Steel Pick', price: 40, hitsPerRock: 9 },
  { id: 'miners-pick', label: 'Diamond Pick', price: 120, hitsPerRock: 6 },
  { id: 'warehouse', label: 'Warehouse', price: 60 },
  { id: 'mule', label: 'M.U.L.E.', price: 100 },
  { id: 'house', label: 'House', price: 500 }
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
