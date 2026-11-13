// What the slot machines did, day by day, for the owner to read in the Storage export. Nothing in
// the game reads it, so a failure here never stops a spin.
//
// Like the other town-wide records, it is only changed once it has been read (or confirmed
// absent): a failed read is never taken for an empty record, or the next write would wipe it. Spins
// from before then wait in a queue.

import { engine } from '@dcl/sdk/ecs'

import { CasinoDay, loadCasinoStats, saveCasinoStats, StoredCasinoStats } from './persistence'

/** How many days are kept: enough to compare weeks, and the record stays a few KB. */
const DAYS_KEPT = 30

/** How often changed figures are written out. */
const SAVE_SECONDS = 5

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

/** What the casino has won in all. It outlives the days, which lapse. */
let won = 0
let days: StoredCasinoStats['days'] = {}
let loaded = false
let loading = false
let retryIn = 0
let statsDirty = false
let sinceLastSave = 0

/** Spins from before the record was read, applied once it has been. */
const waiting: (() => void)[] = []

/** The pot grows by fractions of a coin: two decimals keep the record readable. */
function cents(value: number): number {
  return Math.round(value * 100) / 100
}

function dropOldDays(): void {
  // The keys are YYYY-MM-DD, so they sort by date.
  const old = Object.keys(days).sort().slice(0, -DAYS_KEPT)
  for (const day of old) delete days[day]
}

function apply(day: string, bet: number, win: number, jackpot: boolean, potChange: number): void {
  let entry: CasinoDay | undefined = days[day]
  if (entry === undefined) {
    entry = { spins: 0, wagered: 0, paid: 0, jackpots: 0, won: 0 }
    days[day] = entry
    dropOldDays()
  }
  const wonNow = bet - win - potChange
  entry.spins += 1
  entry.wagered += bet
  entry.paid += win
  if (jackpot) entry.jackpots += 1
  entry.won = cents(entry.won + wonNow)
  won = cents(won + wonNow)
  statsDirty = true
}

/**
 * One spin. `potChange` is what the jackpot gained or lost on it: those coins are still in the
 * game, so what the casino won is the bet, less the win, less that.
 */
export function noteSpin(bet: number, win: number, jackpot: boolean, potChange: number): void {
  // UTC, the same day the town's titles count by.
  const day = new Date(Date.now()).toISOString().slice(0, 10)
  if (loaded) apply(day, bet, win, jackpot, potChange)
  else waiting.push(() => apply(day, bet, win, jackpot, potChange))
}

function load(): void {
  if (loading) return
  loading = true
  loadCasinoStats()
    .then((stored) => {
      loading = false
      loaded = true
      won = stored?.won ?? 0
      days = stored?.days ?? {}
      for (const replay of waiting.splice(0)) replay()
    })
    .catch((error) => {
      loading = false
      retryIn = LOAD_RETRY_SECONDS
      console.log(`[Server] casino stats restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

function save(): void {
  if (!statsDirty) return
  statsDirty = false
  saveCasinoStats({ won, days })
    .then((ok) => {
      if (!ok) statsDirty = true
    })
    .catch(() => (statsDirty = true))
}

/** Saves the figures now if they changed (maintenance, see economy.ts). True if there was something to save. */
export function saveCasinoStatsNow(): boolean {
  const had = statsDirty
  save()
  return had
}

function tick(dt: number): void {
  if (!loaded) {
    retryIn -= dt
    if (retryIn <= 0 && !loading) load()
    return
  }
  sinceLastSave += dt
  if (sinceLastSave < SAVE_SECONDS) return
  sinceLastSave = 0
  save()
}

export function setupCasinoStats(): void {
  engine.addSystem(tick, undefined, 'server:casino-stats')
  load()
}
