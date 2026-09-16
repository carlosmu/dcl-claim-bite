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
  /** Ore per landed swing while this is the best pick owned. Only picks carry it. */
  orePerHit?: number
}

export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: 'Pick', price: 10, orePerHit: 1 },
  { id: 'steel-pick', label: 'Steel Pick', price: 40, orePerHit: 2 },
  { id: 'miners-pick', label: "Miner's Pick", price: 120, orePerHit: 3 },
  { id: 'wheelbarrow', label: 'Wheelbarrow', price: 60 },
  { id: 'mule', label: 'M.U.L.E.', price: 100 },
  { id: 'house', label: 'House', price: 500 }
]

export function findItem(id: ShopItemId): ShopItem | null {
  return CATALOGUE.find((item) => item.id === id) ?? null
}

/** Every pick in the catalogue, worst first. */
export const PICKS: ShopItem[] = CATALOGUE.filter((item) => item.orePerHit !== undefined)

/**
 * Ore a landed swing pays, given what the player owns: the best pick they have.
 *
 * Zero when they own no pick at all — the mayor's gift is what starts the loop, so having
 * nothing in hand should pay nothing rather than quietly paying as if bare hands were a tool.
 */
export function bestPick(ownedCount: (id: ShopItemId) => number): ShopItem | null {
  let best: ShopItem | null = null
  for (const pick of PICKS) {
    if (ownedCount(pick.id) > 0 && (best === null || pick.orePerHit! > best.orePerHit!)) best = pick
  }
  return best
}

export function bestOrePerHit(ownedCount: (id: ShopItemId) => number): number {
  return bestPick(ownedCount)?.orePerHit ?? 0
}

/** How much ore the bag holds, given what the player owns. */
export function carryCapacity(ownedCount: (id: ShopItemId) => number): number {
  return ownedCount('wheelbarrow') > 0 ? CARRY_WITH_WHEELBARROW : CARRY_BASE
}
