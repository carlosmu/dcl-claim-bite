// The town's ore price: falls as ore is sold, climbs back on its own.
//
// Linear in both directions with a hard floor (owner call, 2026-09-02): two dials that can be
// reasoned about by hand, per decisions.md 2026-08-31.
//
// A sale is priced ore by ore, not at one flat rate: the first unit of a batch fetches today's
// price and each following unit fetches a notch less. Dumping 100 ore at once therefore pays
// less per unit than selling them in batches with the price recovering in between — which is
// what makes choosing an amount an actual decision instead of always tapping "all".
//
// Same rule as the wallet: no ECS, React or rendering imports, so this module can move to the
// authoritative server in week 2 (§9) unchanged.

import { ORE_BASE_PRICE, ORE_MIN_PRICE, PRICE_DROP_PER_ORE, PRICE_RECOVERY_PER_SECOND } from '../economy/constants'

let price = ORE_BASE_PRICE

export function getOrePrice(): number {
  return price
}

/**
 * Coins that selling `oreAmount` right now would pay, rounded down so a sale never
 * invents a fraction of a coin. Does not change anything.
 */
export function quoteSale(oreAmount: number): number {
  if (oreAmount <= 0) return 0

  // Units priced above the floor, before the descending price bottoms out.
  const aboveFloor = Math.min(oreAmount, Math.max(0, Math.ceil((price - ORE_MIN_PRICE) / PRICE_DROP_PER_ORE)))
  const descending = aboveFloor * price - (PRICE_DROP_PER_ORE * aboveFloor * (aboveFloor - 1)) / 2
  const atFloor = (oreAmount - aboveFloor) * ORE_MIN_PRICE

  return Math.floor(descending + atFloor)
}

/** Pushes the price down for a sale that has just happened. */
export function applySale(oreAmount: number): void {
  if (oreAmount <= 0) return
  price = Math.max(ORE_MIN_PRICE, price - oreAmount * PRICE_DROP_PER_ORE)
}

/** Lets the price drift back toward its base. Call once per frame with the frame's dt. */
export function recoverPrice(dt: number): void {
  if (price >= ORE_BASE_PRICE) return
  price = Math.min(ORE_BASE_PRICE, price + PRICE_RECOVERY_PER_SECOND * dt)
}
