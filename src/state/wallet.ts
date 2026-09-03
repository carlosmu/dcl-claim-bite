// What the player carries: raw ore (mined) and coins (legal tender).
//
// Two currencies, and only the bank converts one into the other — see design/decisions.md,
// 2026-08-31. Coins stay at 0 until the bank exists.
//
// Deliberately free of ECS, React and rendering imports: this module is plain data and
// plain functions, so it can move to the authoritative server later without dragging
// anything that draws along with it.

let ore = 0
let coins = 0

export function getOre(): number {
  return ore
}

export function getCoins(): number {
  return coins
}

export function addOre(amount: number): void {
  if (amount <= 0) return
  ore += amount
}

/** Removes ore from the bag. Returns false and changes nothing if there isn't enough. */
export function takeOre(amount: number): boolean {
  if (amount <= 0 || amount > ore) return false
  ore -= amount
  return true
}

export function addCoins(amount: number): void {
  if (amount <= 0) return
  coins += amount
}

/** Spends coins. Returns false and changes nothing if the balance can't cover it. */
export function spendCoins(amount: number): boolean {
  if (amount <= 0 || amount > coins) return false
  coins -= amount
  return true
}
