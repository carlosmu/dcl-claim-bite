// What the Market sells, and for how much.
//
// Purchase prices are fixed, not dynamic — only the bank's ore price moves (decisions.md,
// 2026-08-31): a fixed catalogue is easier to balance by hand than tuning every item against
// demand.
//
// TBD: only two of these prices are real. The GDD fixes the starting pick at 10 coins and the
// idle rig at 100 (decisions.md, 2026-08-31), and M.U.L.E. is taken to be that rig. The rest
// are placeholders, to be tuned once the loop is playtested.

export type ShopItemId = 'pick' | 'shovel' | 'wheelbarrow' | 'house' | 'mule'

export type ShopItem = {
  id: ShopItemId
  label: string
  price: number
}

export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: 'Pick', price: 10 },
  { id: 'shovel', label: 'Shovel', price: 25 },
  { id: 'wheelbarrow', label: 'Wheelbarrow', price: 60 },
  { id: 'house', label: 'House', price: 500 },
  { id: 'mule', label: 'M.U.L.E.', price: 100 }
]

export function findItem(id: ShopItemId): ShopItem | null {
  return CATALOGUE.find((item) => item.id === id) ?? null
}
