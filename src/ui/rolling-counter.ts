import { engine } from '@dcl/sdk/ecs'

import { getCoins, getOre } from '../shared/state/wallet'

// The HUD's ore and coin numbers count up instead of jumping.
//
// The duration is per CHANGE, not per unit, so a payout always resolves in about the same
// beat — but it is clamped at both ends: a +3 that took a full second would feel sluggish, and
// a +5,000 sale ticking one unit at a time would run for minutes. Between the two, bigger
// payouts do take visibly longer, which is the point: a big number should feel big.
//
// The animation is display only. Nothing here touches a balance — the wallet module stays the
// truth, and this always lands exactly on it.

/** Seconds added per unit of change, before clamping. */
const SECONDS_PER_UNIT = 0.04

const MIN_DURATION = 0.25
const MAX_DURATION = 1

type Counter = {
  /** What is on screen, mid-roll. */
  shown: number
  /** Where the roll started, and what it is rolling toward. */
  from: number
  target: number
  elapsed: number
  duration: number
}

function counter(): Counter {
  return { shown: 0, from: 0, target: 0, elapsed: 0, duration: 0 }
}

const ore = counter()
const coins = counter()

function advance(c: Counter, truth: number, dt: number): void {
  if (truth !== c.target) {
    // A change that lands mid-roll re-aims from wherever the number is now, so the digits never
    // jump backwards to restart.
    c.from = c.shown
    c.target = truth
    c.elapsed = 0
    c.duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.abs(truth - c.from) * SECONDS_PER_UNIT))
  }

  if (c.shown === c.target) return

  c.elapsed += dt
  if (c.elapsed >= c.duration) {
    c.shown = c.target
    return
  }

  const progress = c.elapsed / c.duration
  const value = c.from + (c.target - c.from) * progress
  // Toward the target, so the last digit is reached at the end of the roll rather than a frame
  // early: rounding down on the way up would sit one short until the clamp above fires.
  c.shown = c.target > c.from ? Math.floor(value) : Math.ceil(value)
}

/** Ore as the HUD should draw it right now. */
export function shownOre(): number {
  return ore.shown
}

/** Coins as the HUD should draw it right now. */
export function shownCoins(): number {
  return coins.shown
}

function update(dt: number): void {
  advance(ore, getOre(), dt)
  advance(coins, getCoins(), dt)
}

export function setupRollingCounters(): void {
  engine.addSystem(update, undefined, 'client:rolling-counters')
}
