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

export function getOwned(id: ShopItemId): number {
  return owned[id] ?? 0
}

export function addOwned(id: ShopItemId, amount: number = 1): void {
  if (amount <= 0) return
  owned[id] = getOwned(id) + amount
}
