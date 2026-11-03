// The town's titles and its newest property owners.
//
// One stored record holds the whole board: a record per day for the last seven days, plus the
// newest owners. Titles are worked out from those days rather than kept, so when a day lapses the
// next-best player simply takes over, without anyone having to do anything or be here.
//
// Like the other town-wide records, the board is only changed once it has been read (or confirmed
// absent): a failed read is never taken for an empty board, or the next write would wipe it. What
// happens before then waits in a queue.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { PANIC_SELLER_MIN_ORE, RATE_BASE } from '../shared/economy/constants'
import { TOWN_TITLES_ENTITY_ENUM_ID, TownTitles } from '../shared/net/town-titles-sync'
import { dayOf, daysInWindow, featuredOwners, NEW_OWNERS_SHOWN, NewOwner, titleHolders, TownDay } from '../shared/titles'
import { loadTitles, saveTitles } from './persistence'

/** How often the board is published. */
const PUBLISH_SECONDS = 1

/** How often a changed board is written out: mining changes it all the time. */
const SAVE_SECONDS = 5

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

/**
 * Miners kept per day; past this the smallest tally makes room. A value may hold 512 KB, and at
 * about 90 bytes a miner this keeps a full week of days near 190 KB.
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

/** Drops the days that have left the window. */
function dropOldDays(): void {
  const kept = daysInWindow(days, dayOf(Date.now()))
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

/** A sale went through: `ore` sold, at the rate it was priced at. Within a day a draw goes to the latest. */
export function noteSale(address: string, name: string, ore: number, rate: number): void {
  whenLoaded(() => {
    const entry = today()
    if (ore >= (entry.whale?.value ?? 0)) entry.whale = { address, name, value: ore }
    // A market at its base is not a panic, it is just a sale.
    if (ore >= PANIC_SELLER_MIN_ORE && rate > RATE_BASE && rate >= (entry.panic?.value ?? 0)) {
      entry.panic = { address, name, value: rate }
    }
    boardDirty = true
  })
}

/** Ore a player just dug, by hand or by rig. */
export function noteMined(address: string, name: string, hand: number, rig: number): void {
  if (hand <= 0 && rig <= 0) return
  whenLoaded(() => {
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

function publish(): void {
  const board = {
    titles: titleHolders(days).map(({ id, address, name, value }) => ({ id, address, name, value })),
    owners: featuredOwners(owners).map(({ kind, address, name }) => ({ kind, address, name }))
  }

  // Only on a real change, like the rest of the synced state.
  const encoded = JSON.stringify(board)
  if (encoded === lastPublished) return
  lastPublished = encoded
  const mutable = TownTitles.getMutable(boardEntity)
  mutable.titles = board.titles
  mutable.owners = board.owners
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
  TownTitles.create(boardEntity, { titles: [], owners: [] })
  syncEntity(boardEntity, [TownTitles.componentId], TOWN_TITLES_ENTITY_ENUM_ID)

  engine.addSystem(tick, undefined, 'server:titles')
  load()
}
