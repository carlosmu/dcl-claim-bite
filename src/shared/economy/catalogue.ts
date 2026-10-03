// What the Market sells, and what owning it does.
//
// V1 economy, owner-approved 2026-10-03. Five lines, bought roughly in this order:
//
//   picks     Stranger's Pick → Miner's Pick → Master Pick: how fast you dig by hand
//   M.U.L.E.  idle rigs, bought one by one, each digging into your storage
//   fuel      packs of days that keep the rigs running
//   storage   how much ore can pile up
//   housing   Wagon → Cabin → House → Ranch: status, the long goal
//
// Lines with tiers are bought in order: each tier names the one it `requires`.
//
// Item ids are what saves store, so they are never renamed: 'pick', 'steel-pick' and
// 'miners-pick' stay the ids of the three picks whatever the labels say.

import { FUEL_PRICE_PER_DAY, MULE_MAX_COUNT, STORAGE_BASE, STORAGE_TIER_1, STORAGE_TIER_2 } from './constants'

export type ShopItemId =
  | 'pick'
  | 'steel-pick'
  | 'miners-pick'
  | 'mule'
  | 'fuel-12h'
  | 'fuel'
  | 'fuel-3'
  | 'fuel-7'
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
  /** Coins. For fuel this is for one rig: days × FUEL_PRICE_PER_DAY (see priceOf). */
  price: number
  /** The main benefit, in a few words, as the Market shows it. */
  benefit: string
  /** The tier that has to be owned first. */
  requires?: ShopItemId
  /** Never sold: the mayor hands it out. */
  starter?: boolean
  /** Hits a rock takes while this pick is in use — fewer is better. Only picks carry it. */
  hitsPerRock?: number
  /** Days of fuel one pack holds. Only fuel carries it. */
  fuelDays?: number
  /** Ore the storage holds with this upgrade. Only storage carries it. */
  storage?: number
}

// Picks: 12 / 8 / 6 hits a rock is 20 / 30 / 40 coins a day for the same time at the rocks.
export const CATALOGUE: ShopItem[] = [
  { id: 'pick', label: "Stranger's Pick", line: 'pick', price: 0, starter: true, hitsPerRock: 12, benefit: 'Mining output ~20 coins/day' },
  { id: 'steel-pick', label: "Miner's Pick", line: 'pick', price: 20, requires: 'pick', hitsPerRock: 8, benefit: 'Mining output ~30 coins/day' },
  { id: 'miners-pick', label: 'Master Pick', line: 'pick', price: 70, requires: 'steel-pick', hitsPerRock: 6, benefit: 'Mining output ~40 coins/day' },
  { id: 'mule', label: 'M.U.L.E.', line: 'mule', price: 100, benefit: 'Produces 200 ore/day · needs fuel' },
  { id: 'fuel-12h', label: 'Fuel 12 Hours', line: 'fuel', price: FUEL_PRICE_PER_DAY * 0.5, fuelDays: 0.5, benefit: 'Runs your M.U.L.E.s 12 hours' },
  { id: 'fuel', label: 'Fuel 1 Day', line: 'fuel', price: FUEL_PRICE_PER_DAY * 1, fuelDays: 1, benefit: 'Runs your M.U.L.E.s 1 day' },
  { id: 'fuel-3', label: 'Fuel 3 Days', line: 'fuel', price: FUEL_PRICE_PER_DAY * 3, fuelDays: 3, benefit: 'Runs your M.U.L.E.s 3 days' },
  { id: 'fuel-7', label: 'Fuel 7 Days', line: 'fuel', price: FUEL_PRICE_PER_DAY * 7, fuelDays: 7, benefit: 'Runs your M.U.L.E.s 7 days' },
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
  if (item.line === 'fuel') return muleCount(ownedCount) > 0 ? null : 'No M.U.L.E.'
  if (item.line === 'mule') return muleCount(ownedCount) >= MULE_MAX_COUNT ? 'Max reached' : null
  if (ownedCount(item.id) > 0) return 'Owned'
  if (item.requires !== undefined && ownedCount(item.requires) <= 0) return `Needs ${findItem(item.requires)?.label ?? item.requires}`
  return null
}

/**
 * What buying this costs right now, or null when it cannot be bought at all.
 *
 * Fuel is priced per rig: a pack runs every rig the player owns for its days, so it costs its
 * price once for each of them. Coins are whole, so a half-day for an odd fleet rounds up: one
 * rig for 12 hours is 3 coins, not 2.5.
 */
export function priceOf(item: ShopItem, ownedCount: (id: ShopItemId) => number): number | null {
  if (unavailableReason(item, ownedCount) !== null) return null
  if (item.line === 'fuel') return Math.ceil(item.price * muleCount(ownedCount))
  return item.price
}
