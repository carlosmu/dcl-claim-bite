// Everything that has to outlive the server process.
//
// Server-only: `@dcl/sdk/server` does not exist on a client, so nothing here may be reached
// from the client half of the tree.
//
// The service serialises to JSON on the way in and parses on the way out, so these store
// real objects rather than hand-rolled strings. Reads are cached and repeated writes of the
// same value are skipped by the SDK, which is why the save path below can afford to be
// simple-minded about writing a purse that may not have changed.

import { Storage } from '@dcl/sdk/server'
import { getStorageServerUrl } from '@dcl/sdk/server/storage-url'
import { signedFetch } from '~system/SignedFetch'

import { Note } from '../shared/notes'
import { NewOwner, TownDay } from '../shared/titles'

/**
 * Appended to every key that holds player progress. Bump it to start everyone from scratch: the
 * old records stay in storage under the previous suffix, so going back is a matter of setting it
 * back. Keys with no suffix at all are the testing stage, before seasons existed.
 */
const SAVE_SEASON = 's1'

function seasonKey(key: string): string {
  return `${key}-${SAVE_SEASON}`
}

/** Per-player key. One record holds the whole purse: a partial save is worse than none. */
const PURSE_KEY = seasonKey('purse')

/** Per-player key: the notes left at their door. Apart from the purse, so a note never rewrites it. */
const NOTES_KEY = seasonKey('notes')

/** Scene-wide key: the town's ore price, which belongs to the world and not to anyone, so it
 * carries over from season to season. */
const MARKET_PRICE_KEY = 'market-price'

/** Scene-wide key: every property standing in town, so it stays up while its owner is away. */
const PROPERTY_LOTS_KEY = seasonKey('property-lots')

/** Scene-wide key: every rig parked in the yard, so it stays parked while its owner is away. */
const MULE_YARD_KEY = seasonKey('mule-yard')

/** Scene-wide key: the town's titles and its newest property owners. */
const TITLES_KEY = seasonKey('town-titles')

/** Scene-wide key: the coins in the casino's jackpot, which are progress like any others. */
const JACKPOT_KEY = seasonKey('casino-pot')

/** Scene-wide key: the slot machines' figures per day, for the owner to read in the Storage export. */
const CASINO_STATS_KEY = seasonKey('casino-stats')

/**
 * Scene-wide key: things the owner has to look at and maybe put right by hand (coins owed to a
 * player, say), for reading in the Storage panel. Not per season: an alert outlives a reset.
 */
const ALERTS_KEY = 'alerts'

/**
 * Scene-wide key: the newest server to start (server/generation.ts). Not per season: it is about
 * deploys, not progress.
 */
const GENERATION_KEY = 'server-generation'

export type StoredGeneration = { id: string; entity: string; startedAt: number }

/**
 * Set once a newer server has started (server/generation.ts). From then on this one is a leftover
 * of an old deploy: whatever it holds in memory is out of date, so every save below is skipped,
 * as if it had gone through, rather than written over what the newer server keeps.
 */
let writesStopped = false

export function stopWrites(): void {
  writesStopped = true
}

export function areWritesStopped(): boolean {
  return writesStopped
}

/** The newest server's record, or null if none was ever written. Throws if the read failed. */
export function loadGeneration(): Promise<StoredGeneration | null> {
  return readValue<StoredGeneration>(`/values/${encodeURIComponent(GENERATION_KEY)}`)
}

/** Resolves true once the write is confirmed. Not stopped by stopWrites: only a newer server writes it. */
export async function saveGeneration(generation: StoredGeneration): Promise<boolean> {
  try {
    return await Storage.set(GENERATION_KEY, generation)
  } catch (error) {
    console.log(`[Server] could not save the server generation: ${error}`)
    return false
  }
}

/** How many alerts are kept, newest last. The oldest go once there are more. */
const MAX_ALERTS = 200

/**
 * One alert. `at`: when, as an ISO date (UTC). `kind`: what happened, short and fixed, to scan the
 * list by. `address`: the player it is about, if any. `coins`: owed to them, if any.
 */
export type StoredAlert = { at: string; kind: string; message: string; address?: string; coins?: number }

export type StoredTitles = { days: TownDay[]; owners: NewOwner[] }

/** One day of the slot machines. `won` is what left the game: bets, less wins, less the pot's growth. */
export type CasinoDay = { spins: number; wagered: number; paid: number; jackpots: number; won: number }

/** `won` is what the casino has won in all, the headline figure. `days` are by UTC day, as YYYY-MM-DD. */
export type StoredCasinoStats = { won: number; days: Record<string, CasinoDay> }

export type StoredLot = { kind: string; lot: number; address: string; name: string }

export type StoredMule = { slot: number; address: string; name: string; level: number }

export type StoredPurse = {
  ore: number
  coins: number
  owned: Record<string, number>
  /**
   * The idle rig: what it holds, and the wall-clock moment it was last settled.
   *
   * The timestamp is the part that has to survive a restart. Without it the rig would only
   * ever pay for time the server happened to be up, which is the opposite of what an idle
   * rig is for — it is meant to pay for the hours nobody was there.
   */
  muleOre?: number
  muleAt?: number
  /** Fuel left in level-hours. Missing means a save from before fuel existed. */
  muleFuel?: number
  /** The pick chosen in the inventory. Missing or not owned means the best one owned. */
  equipped?: string
  /**
   * Rocks each owned pick has left. A pick missing here is at full durability: saves from before
   * durability existed, and a pick just got, which is set full anyway.
   */
  pickDurability?: Record<string, number>
  /**
   * Store purchases since the feedback asks were last restarted (2026-11-11): the next one after
   * that is everyone's "first", then every 10th. A new key on purpose, so saves that already held
   * the old `purchases` tally start over too. Missing means none since.
   */
  feedbackPurchases?: number
  /**
   * The Claim Office's rewards, by campaign id (shared/rewards.ts): the quest steps met since the
   * campaign went live, and whether it was claimed.
   */
  rewards?: Record<string, StoredReward>
  /** The ids of the compensations already credited (server/compensations.ts). Missing means none. */
  compensations?: string[]
  /** Read only: the one reward from before there were several. Folded into `rewards` on load, never written. */
  gift?: StoredGift
}

export type StoredReward = { steps: Record<string, boolean>; claimed: boolean }

export type StoredGift = { sold: boolean; bought: boolean; surveyed: boolean; claimed: boolean }

/**
 * Reads one stored value: null ONLY when the service confirms the key does not exist.
 *
 * This bypasses `Storage.get` on purpose. The SDK answers null both for "no such key" and
 * for "the request failed", and treating a failed read as a first visit is how purses got
 * wiped: a freshly started server whose first read hiccups hands the player an empty purse,
 * and the next flush writes it over their real one. Here a failure throws instead, so the
 * caller can retry and never invent a value.
 */
async function readValue<T>(path: string): Promise<T | null> {
  const baseUrl = await getStorageServerUrl()
  const response = await signedFetch({ url: `${baseUrl}${path}` })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)

  const body = JSON.parse(response.body || '{}') as { value?: T | null }
  // A 200 without a value is neither a value nor a confirmed absence.
  if (body.value === undefined || body.value === null) throw new Error('empty response')
  return body.value
}

/** A player's purse, or null if they have never played here. Throws if the read failed. */
export function loadPurse(address: string): Promise<StoredPurse | null> {
  return readValue<StoredPurse>(`/players/${encodeURIComponent(address)}/values/${encodeURIComponent(PURSE_KEY)}`)
}

/**
 * Resolves true once the write is confirmed. The SDK does not throw on a failed write, it
 * resolves false, so the caller has to look at the result to know the purse is still unsaved.
 */
export async function savePurse(address: string, purse: StoredPurse): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.player.set(address, PURSE_KEY, purse)
    if (!ok) console.log(`[Server] could not save purse for ${address}`)
    return ok
  } catch (error) {
    console.log(`[Server] could not save purse for ${address}: ${error}`)
    return false
  }
}

/** The town's stored price, or null if none was ever saved. Throws if the read failed. */
export function loadMarketPrice(): Promise<number | null> {
  return readValue<number>(`/values/${encodeURIComponent(MARKET_PRICE_KEY)}`)
}

export function saveMarketPrice(price: number): void {
  if (writesStopped) return
  Storage.set(MARKET_PRICE_KEY, price)
    .then((ok) => {
      if (!ok) console.log('[Server] could not save market price')
    })
    .catch((error) => console.log(`[Server] could not save market price: ${error}`))
}

/** The town's stored lots, or null if none were ever saved. Throws if the read failed. */
export function loadPropertyLots(): Promise<StoredLot[] | null> {
  return readValue<StoredLot[]>(`/values/${encodeURIComponent(PROPERTY_LOTS_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function savePropertyLots(lots: StoredLot[]): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.set(PROPERTY_LOTS_KEY, lots)
    if (!ok) console.log('[Server] could not save property lots')
    return ok
  } catch (error) {
    console.log(`[Server] could not save property lots: ${error}`)
    return false
  }
}

/** The notes left at a player's door, or null if none ever were. Throws if the read failed. */
export function loadNotes(address: string): Promise<Note[] | null> {
  return readValue<Note[]>(`/players/${encodeURIComponent(address)}/values/${encodeURIComponent(NOTES_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function saveNotes(address: string, notes: Note[]): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.player.set(address, NOTES_KEY, notes)
    if (!ok) console.log(`[Server] could not save notes for ${address}`)
    return ok
  } catch (error) {
    console.log(`[Server] could not save notes for ${address}: ${error}`)
    return false
  }
}

/** The jackpot, or null if none was ever saved. Throws if the read failed. */
export function loadJackpot(): Promise<number | null> {
  return readValue<number>(`/values/${encodeURIComponent(JACKPOT_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function saveJackpot(pot: number): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.set(JACKPOT_KEY, pot)
    if (!ok) console.log('[Server] could not save the jackpot')
    return ok
  } catch (error) {
    console.log(`[Server] could not save the jackpot: ${error}`)
    return false
  }
}

/** The casino's figures, or null if none were ever saved. Throws if the read failed. */
export function loadCasinoStats(): Promise<StoredCasinoStats | null> {
  return readValue<StoredCasinoStats>(`/values/${encodeURIComponent(CASINO_STATS_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function saveCasinoStats(stats: StoredCasinoStats): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.set(CASINO_STATS_KEY, stats)
    if (!ok) console.log('[Server] could not save the casino stats')
    return ok
  } catch (error) {
    console.log(`[Server] could not save the casino stats: ${error}`)
    return false
  }
}

/** The town's board, or null if none was ever saved. Throws if the read failed. */
export function loadTitles(): Promise<StoredTitles | null> {
  return readValue<StoredTitles>(`/values/${encodeURIComponent(TITLES_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function saveTitles(titles: StoredTitles): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.set(TITLES_KEY, titles)
    if (!ok) console.log('[Server] could not save titles')
    return ok
  } catch (error) {
    console.log(`[Server] could not save titles: ${error}`)
    return false
  }
}

/** The town's parked rigs, or null if none were ever saved. Throws if the read failed. */
export function loadMuleYard(): Promise<StoredMule[] | null> {
  return readValue<StoredMule[]>(`/values/${encodeURIComponent(MULE_YARD_KEY)}`)
}

/** Resolves true once the write is confirmed, like savePurse. */
export async function saveMuleYard(mules: StoredMule[]): Promise<boolean> {
  if (writesStopped) return true
  try {
    const ok = await Storage.set(MULE_YARD_KEY, mules)
    if (!ok) console.log('[Server] could not save mule yard')
    return ok
  } catch (error) {
    console.log(`[Server] could not save mule yard: ${error}`)
    return false
  }
}

/** Alerts are written one at a time, each after the last, so two never read the same list and one is lost. */
let alertQueue: Promise<void> = Promise.resolve()

/**
 * Adds an alert to the stored list (ALERTS_KEY) and to the log. Never throws. A list that cannot
 * be read is not written over: the alert then stays in the log only.
 */
export function recordAlert(alert: Omit<StoredAlert, 'at'>): void {
  const entry: StoredAlert = { at: new Date().toISOString(), ...alert }
  console.log(`[Server] ALERT ${entry.kind}: ${entry.message}`)
  alertQueue = alertQueue.then(async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const alerts = (await readValue<StoredAlert[]>(`/values/${encodeURIComponent(ALERTS_KEY)}`)) ?? []
        alerts.push(entry)
        if (await Storage.set(ALERTS_KEY, alerts.slice(-MAX_ALERTS))) return
      } catch (error) {
        console.log(`[Server] could not read the alerts (try ${attempt}): ${error}`)
      }
    }
    console.log(`[Server] ALERT NOT STORED, only in this log: ${JSON.stringify(entry)}`)
  })
}
