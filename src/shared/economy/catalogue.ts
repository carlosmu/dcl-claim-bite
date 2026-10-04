// What the Market sells, and what owning it does.
//
// V1 economy, owner-approved 2026-10-03. Five lines, bought roughly in this order:
//
//   picks     Stranger's Pick → Miner's Pick → Master Pick: how fast you dig by hand
//   M.U.L.E.  idle rigs, bought one by one, each digging into your storage
//   fuel      gallons that keep the rigs running
//   storage   how much ore can pile up
//   housing   Wagon → Cabin → House → Ranch: status, the long goal
//
// Lines with tiers are bought in order: each tier names the one it `requires`.
//
// Item ids are what saves store, so they are never renamed: 'pick', 'steel-pick' and
// 'miners-pick' stay the ids of the three picks whatever the labels say.

import {
  FUEL_GALLONS_PER_RIG_DAY,
  FUEL_MAX_DAYS,
  FUEL_PRICE_PER_GALLON,
  MULE_MAX_COUNT,
  STORAGE_BASE,
  STORAGE_TIER_1,
  STORAGE_TIER_2
} from './constants'

export type ShopItemId =
  | 'pick'
  | 'steel-pick'
  | 'miners-pick'
  | 'mule'
  | 'fuel-10'
  | 'fuel-25'
  | 'fuel-50'
  | 'fuel-fill'
  | 'warehouse'
  | 'warehouse-2'
  | 'cabin'
  | 'house'
  | 'ranch'

export type ShopLine = 'pick' | 'mule' | 'fuel' | 'storage' | 'housing'

export type ShopItem = {
  id: ShopItemId
  label: string
  line: ShopLine
  /** Coins. For fuel see fuelOrder: the Fill Tank price depends on what is in the tank. */
  price: number
  /** The main benefit, in a few words, as the Market shows it. */
  benefit: string
  /** The tier that has to be owned first. */
  requires?: ShopItemId
  /** Never sold: the mayor hands it out. */
  starter?: boolean
  /** Hits a rock takes while this pick is in use — fewer is better. Only picks carry it. */
  hitsPerRock?: number
  /** Gallons this fuel order adds. Only fuel carries it, except Fill Tank, which tops up. */
  fuelGallons?: number
  /** Fuel only: buy exactly what the tank is missing. */
  fillTank?: boolean
  /** Ore the storage holds with this upgrade. Only storage carries it. */
  storage?: number
}

// Picks: 12 / 8 / 6 hits a rock is 20 / 30 / 40 coins a day for the same time at the rocks.
export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: "Stranger's Pick", line: 'pick', price: 0, starter: true, hitsPerRock: 12, benefit: 'Mining output ~20 coins/day' },
  { id: 'steel-pick', label: "Miner's Pick", line: 'pick', price: 20, requires: 'pick', hitsPerRock: 8, benefit: 'Mining output ~30 coins/day' },
  { id: 'miners-pick', label: 'Master Pick', line: 'pick', price: 70, requires: 'steel-pick', hitsPerRock: 6, benefit: 'Mining output ~40 coins/day' },
  { id: 'mule', label: 'M.U.L.E.', line: 'mule', price: 100, benefit: 'Produces 200 ore/day · needs fuel' },
  { id: 'fuel-10', label: '+10 Gallons', line: 'fuel', price: 10 * FUEL_PRICE_PER_GALLON, fuelGallons: 10, benefit: '10 rig-days of fuel' },
  { id: 'fuel-25', label: '+25 Gallons', line: 'fuel', price: 25 * FUEL_PRICE_PER_GALLON, fuelGallons: 25, benefit: '25 rig-days of fuel' },
  { id: 'fuel-50', label: '+50 Gallons', line: 'fuel', price: 50 * FUEL_PRICE_PER_GALLON, fuelGallons: 50, benefit: '50 rig-days of fuel' },
  { id: 'fuel-fill', label: 'Fill Tank', line: 'fuel', price: 0, fillTank: true, benefit: 'Tops the tank up' },
  { id: 'warehouse', label: 'Storage I', line: 'storage', price: 30, storage: STORAGE_TIER_1, benefit: `Holds ${STORAGE_TIER_1} ore` },
  { id: 'warehouse-2', label: 'Storage II', line: 'storage', price: 60, requires: 'warehouse', storage: STORAGE_TIER_2, benefit: `Holds ${STORAGE_TIER_2} ore` },
  { id: 'cabin', label: 'Cabin', line: 'housing', price: 300, benefit: 'Your first real home' },
  { id: 'house', label: 'House', line: 'housing', price: 700, requires: 'cabin', benefit: 'A house in town' },
  { id: 'ranch', label: 'Ranch', line: 'housing', price: 2000, requires: 'house', benefit: 'The finest claim in town' }
]

/** What a player lives in before buying any housing. */
export const STARTER_HOME = 'Wagon'

export function findItem(id: ShopItemId): ShopItem | null {
  return CATALOGUE.find((item) => item.id === id) ?? null
}

/** Every item of one line, in the order it is bought. */
export function itemsOf(line: ShopLine): ShopItem[] {
  return CATALOGUE.filter((item) => item.line === line)
}

/** Every pick in the catalogue, worst first. */
export const PICKS: ShopItem[] = itemsOf('pick')

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

/** The highest tier of a line the player owns, or null for none. */
export function ownedTier(line: ShopLine, ownedCount: (id: ShopItemId) => number): ShopItem | null {
  let top: ShopItem | null = null
  for (const item of itemsOf(line)) if (ownedCount(item.id) > 0) top = item
  return top
}

/** The next tier of a line the player could buy, or null when they own the top one. */
export function nextTier(line: ShopLine, ownedCount: (id: ShopItemId) => number): ShopItem | null {
  const top = ownedTier(line, ownedCount)
  const items = itemsOf(line)
  return top === null ? items[0] : items[items.indexOf(top) + 1] ?? null
}

/** How much ore the player's storage holds: the free base, or the best upgrade owned. */
export function carryCapacity(ownedCount: (id: ShopItemId) => number): number {
  return ownedTier('storage', ownedCount)?.storage ?? STORAGE_BASE
}

/** How many rigs the player has. Saves from before the cap may hold more; they run at the cap. */
export function muleCount(ownedCount: (id: ShopItemId) => number): number {
  return Math.min(ownedCount('mule'), MULE_MAX_COUNT)
}

/**
 * Why this item cannot be bought right now, or null when it can (coins aside — affording it is
 * checked separately, so the Market can tell "not yet" from "not enough coins").
 */
export function unavailableReason(item: ShopItem, ownedCount: (id: ShopItemId) => number): string | null {
  if (item.starter === true) return ownedCount(item.id) > 0 ? 'Owned' : 'Free from the Mayor'
  if (item.line === 'fuel') return muleCount(ownedCount) > 0 ? null : 'Requires a M.U.L.E.'
  if (item.line === 'mule') return muleCount(ownedCount) >= MULE_MAX_COUNT ? 'Max reached' : null
  if (ownedCount(item.id) > 0) return 'Owned'
  if (item.requires !== undefined && ownedCount(item.requires) <= 0) return `Needs ${findItem(item.requires)?.label ?? item.requires}`
  return null
}

/**
 * What buying this costs right now, or null when it cannot be bought at all.
 *
 * Not for fuel: what a fuel order costs depends on what is in the tank — see fuelOrder.
 */
export function priceOf(item: ShopItem, ownedCount: (id: ShopItemId) => number): number | null {
  if (unavailableReason(item, ownedCount) !== null) return null
  if (item.line === 'fuel') return null
  return item.price
}

// --- Fuel -------------------------------------------------------------------------------

/** Gallons the tank holds for this many rigs: a week of running for each. */
export function fuelTankGallons(mules: number): number {
  return mules * FUEL_MAX_DAYS * FUEL_GALLONS_PER_RIG_DAY
}

/**
 * What a fuel order would add and cost, given the rigs owned and the gallons in the tank — or
 * why it cannot be placed. The same rule on both sides: the client greys the button with it and
 * the server charges with it.
 *
 * Never past the tank: an order that would overflow is refused rather than trimmed, so the
 * gallons on the button are the gallons you get. Fill Tank buys exactly what is missing; the
 * tank drains continuously, so that is rarely a whole number of gallons, and the price rounds
 * up to a whole coin.
 */
export function fuelOrder(item: ShopItem, mules: number, gallonsNow: number): { gallons: number; price: number } | { reason: string } {
  if (mules <= 0) return { reason: 'Requires a M.U.L.E.' }
  const room = fuelTankGallons(mules) - gallonsNow
  if (room < 0.01) return { reason: 'Tank full' }
  if (item.fillTank === true) return { gallons: room, price: Math.ceil(room * FUEL_PRICE_PER_GALLON) }
  const gallons = item.fuelGallons ?? 0
  if (gallons > room + 1e-6) return { reason: 'Too much for the tank' }
  return { gallons, price: gallons * FUEL_PRICE_PER_GALLON }
}
