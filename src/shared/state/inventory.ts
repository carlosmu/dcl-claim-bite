// What the player owns, by catalogue id.
//
// Buying is currently only a transaction: coins leave, the count goes up. None of these items
// does anything yet — the pick's yield bonus, the M.U.L.E.'s idle production and the house's
// visible tier are all still ahead (§4.2).
//
// Same rule as the wallet and the market: no ECS, React or rendering imports, so this module
// can move to the authoritative server in week 2 (§9) unchanged.

import { ShopItemId } from '../economy/catalogue'

const owned: Partial<Record<ShopItemId, number>> = {}
let equipped = ''

export function getOwned(id: ShopItemId): number {
  return owned[id] ?? 0
}

/** The id of the pick in use, as the server last said. Empty means no pick. */
export function getEquipped(): string {
  return equipped
}

export function applyServerEquipped(id: string): void {
  equipped = id
}

/** Replaces the inventory from the `id:count` pairs the server sends. */
export function applyServerOwned(encoded: string): void {
  for (const id of Object.keys(owned)) delete owned[id as ShopItemId]
  if (encoded === '') return

  for (const pair of encoded.split(',')) {
    const [id, count] = pair.split(':')
    owned[id as ShopItemId] = Number(count)
  }
}

