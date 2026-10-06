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

/** Per-player key. One record holds the whole purse: a partial save is worse than none. */
const PURSE_KEY = 'purse'

/** Scene-wide key: the town's ore price, which belongs to the world and not to anyone. */
const MARKET_PRICE_KEY = 'market-price'

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
}

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
  Storage.set(MARKET_PRICE_KEY, price)
    .then((ok) => {
      if (!ok) console.log('[Server] could not save market price')
    })
    .catch((error) => console.log(`[Server] could not save market price: ${error}`))
}
