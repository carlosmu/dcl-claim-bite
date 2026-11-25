// The town's titles and its newest property owners.
//
// One stored record holds the whole board: a record per day for the last two weeks, plus the
// newest owners. Titles are worked out from those days rather than kept, so when a day lapses the
// next-best player simply takes over, without anyone having to do anything or be here. A title (or
// the week's economy) with nothing in the last seven days shows last week's instead, marked as such.
//
// Like the other town-wide records, the board is only changed once it has been read (or confirmed
// absent): a failed read is never taken for an empty board, or the next write would wipe it. What
// happens before then waits in a queue.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { PANIC_SELLER_MIN_ORE, RATE_BASE } from '../shared/economy/constants'
import { TOWN_TITLES_ENTITY_ENUM_ID, TownTitles } from '../shared/net/town-titles-sync'
import {
  dayOf,
  daysInPreviousWindow,
  daysInWindow,
  DayStats,
  emptyDayStats,
  featuredOwners,
  isEmptyDayStats,
  KEPT_DAYS,
  NEW_OWNERS_SHOWN,
  NewOwner,
  titleHolders,
  TownDay,
  weekStats
} from '../shared/titles'
import { coinsInCirculation } from './coin-ledger'
import { loadTitles, saveTitles } from './persistence'

/** How often the board is published. */
const PUBLISH_SECONDS = 1

/** How often a changed board is written out: mining changes it all the time. */
const SAVE_SECONDS = 5

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

/**
 * Miners kept per day; past this the smallest tally makes room. A value may hold 512 KB, and at
 * about 90 bytes a miner this keeps the two weeks of days (KEPT_DAYS) near 380 KB.
 */
const MAX_MINERS_PER_DAY = 300

let boardEntity = engine.RootEntity
let days: TownDay[] = []
let owners: NewOwner[] = []

let loaded = false
let loading = false
let retryIn = 0
let boardDirty = false
let lastPublished = ''
let sinceLastPublish = 0
let sinceLastSave = 0

/** Events from before the board was read, applied once it has been. */
const waiting: (() => void)[] = []

function whenLoaded(apply: () => void): void {
  if (loaded) apply()
  else waiting.push(apply)
}

/** Drops the days that are no longer kept (KEPT_DAYS). */
function dropOldDays(): void {
  const kept = daysInWindow(days, dayOf(Date.now()), KEPT_DAYS)
  if (kept.length === days.length) return
  days = kept
  boardDirty = true
}

function today(): TownDay {
  const day = dayOf(Date.now())
  let entry = days.find((other) => other.day === day)
  if (entry === undefined) {
    entry = { day, miners: {} }
    days.push(entry)
  }
  return entry
}

/** Today's economy figures, started on first need. */
function todayStats(): DayStats {
  const entry = today()
  if (entry.stats === undefined) entry.stats = emptyDayStats()
  return entry.stats
}

/** Coins that came into the town (`created`) or were spent (`spent`), for the board's weekly totals. Debug grants are not counted. */
export function noteCoins(created: number, spent: number): void {
  if (created <= 0 && spent <= 0) return
  whenLoaded(() => {
    const stats = todayStats()
    stats.coinsIn += Math.max(0, created)
    stats.coinsOut += Math.max(0, spent)
    boardDirty = true
  })
}

/** Coins spent on something bought (not a slot bet), for the board's weekly purchases. */
export function noteSpentOnPurchase(coins: number): void {
  if (coins <= 0) return
  whenLoaded(() => {
    const stats = todayStats()
    stats.purchases = (stats.purchases ?? 0) + coins
    boardDirty = true
  })
}

/** A sale went through: `ore` sold for `coins`, at the rate it was priced at. Within a day a draw goes to the latest. */
export function noteSale(address: string, name: string, ore: number, rate: number, coins: number): void {
  whenLoaded(() => {
    const stats = todayStats()
    stats.oreSold += ore
    stats.bankPaid += coins
    stats.coinsIn += coins
    const entry = today()
    if (ore >= (entry.whale?.value ?? 0)) entry.whale = { address, name, value: ore }
    // A market at its base is not a panic, it is just a sale.
    if (ore >= PANIC_SELLER_MIN_ORE && rate > RATE_BASE && rate >= (entry.panic?.value ?? 0)) {
      entry.panic = { address, name, value: rate }
    }
    boardDirty = true
  })
}

/** A slot machine paid `coins` on one spin. Within a day a draw goes to the latest. */
export function noteSlotWin(address: string, name: string, coins: number): void {
  whenLoaded(() => {
    const entry = today()
    if (coins >= (entry.roller?.value ?? 0)) entry.roller = { address, name, value: coins }
    boardDirty = true
  })
}

/** Ore a player just dug, by hand or by rig. */
export function noteMined(address: string, name: string, hand: number, rig: number): void {
  if (hand <= 0 && rig <= 0) return
  whenLoaded(() => {
    const stats = todayStats()
    stats.hand += Math.max(0, hand)
    stats.rig += Math.max(0, rig)
    const { miners } = today()
    const miner = miners[address] ?? { name, hand: 0, rig: 0 }
    miner.name = name
    miner.hand += hand
    miner.rig += rig
    miners[address] = miner
    makeRoom(miners, address)
    boardDirty = true
  })
}

function makeRoom(miners: TownDay['miners'], keep: string): void {
  const addresses = Object.keys(miners)
  if (addresses.length <= MAX_MINERS_PER_DAY) return
  const others = addresses.filter((address) => address !== keep)
  const dug = (address: string) => miners[address].hand + miners[address].rig
  delete miners[others.reduce((smallest, address) => (dug(address) < dug(smallest) ? address : smallest))]
}

/** A property was bought. Only the newest few of each kind are kept: all the board can ever need. */
export function noteNewOwner(address: string, name: string, kind: string): void {
  const at = Date.now()
  whenLoaded(() => {
    const sameKind = owners.filter((owner) => owner.kind === kind).sort((a, b) => b.at - a.at)
    const dropped = sameKind.slice(NEW_OWNERS_SHOWN - 1)
    owners = owners.filter((owner) => !dropped.includes(owner))
    owners.push({ kind, address, name, at })
    boardDirty = true
  })
}

function load(): void {
  if (loading) return
  loading = true
  loadTitles()
    .then((stored) => {
      loading = false
      loaded = true
      days = stored?.days ?? []
      owners = stored?.owners ?? []
      dropOldDays()
      for (const apply of waiting.splice(0)) apply()
    })
    .catch((error) => {
      loading = false
      retryIn = LOAD_RETRY_SECONDS
      console.log(`[Server] titles restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

function save(): void {
  if (!boardDirty) return
  boardDirty = false
  saveTitles({ days, owners })
    .then((ok) => {
      if (!ok) boardDirty = true
    })
    .catch(() => (boardDirty = true))
}

/** Saves the board now if it changed (maintenance, see economy.ts). True if there was something to save. */
export function saveTitlesNow(): boolean {
  const had = boardDirty
  save()
  return had
}

function publish(): void {
  const now = dayOf(Date.now())
  const thisWeek = daysInWindow(days, now)
  const lastWeek = daysInPreviousWindow(days, now)

  // Each title from the last seven days; one nobody earned in them, from the seven before.
  const current = titleHolders(thisWeek)
  const fallback = titleHolders(lastWeek).filter((holder) => !current.some((other) => other.id === holder.id))
  const titles = [
    ...current.map(({ id, address, name, value }) => ({ id, address, name, value, previous: false })),
    ...fallback.map(({ id, address, name, value }) => ({ id, address, name, value, previous: true }))
  ]

  // The same for the economy, as a whole: a quiet week shows the one before.
  let week = weekStats(thisWeek)
  let weekPrevious = false
  if (isEmptyDayStats(week)) {
    const previous = weekStats(lastWeek)
    if (!isEmptyDayStats(previous)) {
      week = previous
      weekPrevious = true
    }
  }

  const board = {
    titles,
    owners: featuredOwners(owners).map(({ kind, address, name }) => ({ kind, address, name })),
    week: { ...week, purchases: week.purchases ?? 0 },
    weekPrevious,
    // -1 until the ledger has been read.
    circulation: coinsInCirculation() ?? -1
  }

  // Only on a real change, like the rest of the synced state.
  const encoded = JSON.stringify(board)
  if (encoded === lastPublished) return
  lastPublished = encoded
  const mutable = TownTitles.getMutable(boardEntity)
  mutable.titles = board.titles
  mutable.owners = board.owners
  mutable.week = board.week
  mutable.weekPrevious = board.weekPrevious
  mutable.circulation = board.circulation
}

function tick(dt: number): void {
  sinceLastPublish += dt
  if (sinceLastPublish < PUBLISH_SECONDS) return
  retryIn -= sinceLastPublish
  sinceLastSave += sinceLastPublish
  sinceLastPublish = 0

  if (!loaded) {
    if (retryIn <= 0) load()
    return
  }
  dropOldDays()
  publish()
  if (sinceLastSave < SAVE_SECONDS) return
  sinceLastSave = 0
  save()
}

export function setupTitles(): void {
  boardEntity = engine.addEntity()
  TownTitles.create(boardEntity, { titles: [], owners: [], week: { ...emptyDayStats(), purchases: 0 }, weekPrevious: false, circulation: -1 })
  syncEntity(boardEntity, [TownTitles.componentId], TOWN_TITLES_ENTITY_ENUM_ID)

  engine.addSystem(tick, undefined, 'server:titles')
  load()
}
