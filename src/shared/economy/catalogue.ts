// What the Market sells, and what owning it does.
//
// Prices and effects are the owner-approved values of 2026-09-16 — see design/balance.md for
// the reasoning behind each one. Two axes that ask different questions: how fast you dig
// (picks) and how much you can carry (wheelbarrow), plus the two long goals.
//
// The Shovel was removed on 2026-09-16: it had no answer to "what is this for".

import { CARRY_BASE, CARRY_WITH_WHEELBARROW } from './constants'

export type ShopItemId = 'pick' | 'steel-pick' | 'miners-pick' | 'wheelbarrow' | 'mule' | 'house'

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
  { id: 'wheelbarrow', label: 'Wheelbarrow', price: 60 },
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

/** Hits a rock takes with the best pick owned. Zero means no pick: the player cannot mine. */
export function bestHitsPerRock(ownedCount: (id: ShopItemId) => number): number {
  return bestPick(ownedCount)?.hitsPerRock ?? 0
}

/** How much ore the bag holds, given what the player owns. */
export function carryCapacity(ownedCount: (id: ShopItemId) => number): number {
  return ownedCount('wheelbarrow') > 0 ? CARRY_WITH_WHEELBARROW : CARRY_BASE
}
