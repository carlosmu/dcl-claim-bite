// Coins in circulation: what every player of the season holds right now, added up.
//
// Each purse is stored apart, under its player, and storage cannot add them all up, so the server
// keeps its own ledger: one stored record with the last balance it saw for each player. A balance
// is noted whenever the server tells a player their wallet, so the total follows play. A player who
// has not been here since the ledger began is not in it until they come back.
//
// Like the other town-wide records, the ledger is only changed once it has been read (or confirmed
// absent): a failed read is never taken for an empty ledger, or the next write would wipe it. What
// is noted before then waits, and wins over what was stored, being newer.

import { engine } from '@dcl/sdk/ecs'

import { loadCoinLedger, saveCoinLedger } from './persistence'

/** How often a changed ledger is written out. */
const SAVE_SECONDS = 10

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

let ledger: Record<string, number> = {}
let loaded = false
let loading = false
let retryIn = 0
let dirty = false
let sinceLastSave = 0

/** Balances noted before the ledger was read. */
const waiting = new Map<string, number>()

/** What `address` holds now. */
export function noteBalance(address: string, coins: number): void {
  if (!loaded) {
    waiting.set(address, coins)
    return
  }
  if (ledger[address] === coins) return
  ledger[address] = coins
  dirty = true
}

/** Every balance in the ledger, added up; null until it has been read. */
export function coinsInCirculation(): number | null {
  if (!loaded) return null
  let total = 0
  for (const address of Object.keys(ledger)) total += ledger[address]
  return total
}

function load(): void {
  if (loading) return
  loading = true
  loadCoinLedger()
    .then((stored) => {
      loading = false
      loaded = true
      ledger = stored ?? {}
      for (const [address, coins] of waiting) noteBalance(address, coins)
      waiting.clear()
    })
    .catch((error) => {
      loading = false
      retryIn = LOAD_RETRY_SECONDS
      console.log(`[Server] coin ledger restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

function save(): void {
  if (!dirty) return
  dirty = false
  saveCoinLedger(ledger)
    .then((ok) => {
      if (!ok) dirty = true
    })
    .catch(() => (dirty = true))
}

/** Saves the ledger now if it changed (maintenance, see economy.ts). True if there was something to save. */
export function saveCoinLedgerNow(): boolean {
  const had = loaded && dirty
  if (loaded) save()
  return had
}

function tick(dt: number): void {
  if (!loaded) {
    retryIn -= dt
    if (retryIn <= 0) load()
    return
  }
  sinceLastSave += dt
  if (sinceLastSave < SAVE_SECONDS) return
  sinceLastSave = 0
  save()
}

export function setupCoinLedger(): void {
  engine.addSystem(tick, undefined, 'server:coin-ledger')
  load()
}
