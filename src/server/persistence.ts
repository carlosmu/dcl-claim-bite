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

/** Per-player key. One record holds the whole purse: a partial save is worse than none. */
const PURSE_KEY = 'purse'

/** Scene-wide key: the town's ore price, which belongs to the world and not to anyone. */
const MARKET_PRICE_KEY = 'market-price'

export type StoredPurse = {
  ore: number
  coins: number
  owned: Record<string, number>
}

/**
 * Reads a player's purse, or null if they have never played here.
 *
 * Throws are caught and reported as null rather than allowed to escape: a storage service
 * that is briefly unreachable should leave the player mining with an empty bag for a moment,
 * not take down the scene for everyone.
 */
export async function loadPurse(address: string): Promise<StoredPurse | null> {
  try {
    return await Storage.player.get<StoredPurse>(address, PURSE_KEY)
  } catch (error) {
    console.log(`[Server] could not load purse for ${address}: ${error}`)
    return null
  }
}

/** Fire-and-forget: the caller is a system and cannot wait for the round trip. */
export function savePurse(address: string, purse: StoredPurse): void {
  Storage.player.set(address, PURSE_KEY, purse).catch((error) => {
    console.log(`[Server] could not save purse for ${address}: ${error}`)
  })
}

export async function loadMarketPrice(): Promise<number | null> {
  try {
    return await Storage.get<number>(MARKET_PRICE_KEY)
  } catch (error) {
    console.log(`[Server] could not load market price: ${error}`)
    return null
  }
}

export function saveMarketPrice(price: number): void {
  Storage.set(MARKET_PRICE_KEY, price).catch((error) => {
    console.log(`[Server] could not save market price: ${error}`)
  })
}
