// The economy, now that it is the server's.
//
// Two kinds of state live here and they are kept apart on purpose:
//
//   - The ore price is ONE value for the whole town, so it stays in `shared/state/market.ts`
//     exactly as it was tuned. That module is now the authoritative copy rather than one of
//     N private ones, and its number is mirrored into a synced component for clients to read.
//   - A purse is PER PLAYER, so it cannot use the single-purse module the client mirrors.
//     Each wallet is keyed by wallet address here.
//
// Purses are in memory only: a restart still wipes them. Persisting them is the next step
// (design/gdd.md §9), and is what the M.U.L.E. has been waiting for.

import { engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { MARKET_ENTITY_ENUM_ID, OreMarket } from '../shared/net/market-sync'
import { room } from '../shared/net/protocol'
import { applySale, getOrePrice, quoteSale, recoverPrice, restorePrice } from '../shared/state/market'
import { loadMarketPrice, loadPurse, savePurse, saveMarketPrice } from './persistence'
import { MIN_SWING_INTERVAL_SECONDS, ORE_PER_HIT, ORE_PER_MISS } from '../shared/economy/constants'
import { findItem, ShopItemId } from '../shared/economy/catalogue'

type Purse = {
  ore: number
  coins: number
  owned: Record<string, number>
}

const purses = new Map<string, Purse>()
let marketEntity = engine.RootEntity
let lastPublishedPrice = -1

/** How often presence is diffed. Once a second: arrivals can wait a beat, and this walks
 * every player entity, so it has no business running at frame rate. */
const PRESENCE_CHECK_PERIOD_SECONDS = 1

/** How often the dropped-swing report is printed, so a spammer cannot flood the log too. */
const ABUSE_REPORT_PERIOD_SECONDS = 5

// Seconds since the server started, accumulated from the frame delta rather than read off
// the wall clock: it only ever needs to measure gaps, and a monotonic count cannot be
// disturbed by the host's clock moving.
let serverClock = 0

/** How often pending changes are written out. Saving on every swing would be a round trip
 * per 0.8s per player; batching turns that into one write per player per flush. */
const SAVE_PERIOD_SECONDS = 5

// Addresses whose purse is on its way from storage. A purse is only put in `purses` once it
// has actually been read, so "present in the map" means "safe to spend from".
const loading = new Set<string>()

/** Purses changed since the last flush. */
const dirty = new Set<string>()

let marketDirty = false
let sinceLastSave = 0

const lastSwingAt = new Map<string, number>()
const droppedSwings = new Map<string, number>()
let sinceLastAbuseReport = 0

/**
 * Starts reading a purse from storage, once.
 *
 * Nothing is put in `purses` until the read comes back, which is the whole safety property
 * here: an empty purse is never invented for someone who has played before, so a slow read
 * can never be mistaken for a fresh player and then saved over their real balance.
 */
function beginLoad(address: string): void {
  if (purses.has(address) || loading.has(address)) return
  loading.add(address)

  loadPurse(address)
    .then((stored) => {
      loading.delete(address)
      purses.set(address, {
        ore: stored?.ore ?? 0,
        coins: stored?.coins ?? 0,
        owned: stored?.owned ?? {}
      })
      sendWallet(address)
      console.log(`[Server] purse ${stored === null ? 'created for' : 'restored for'} ${address}`)
    })
    .catch((error) => {
      loading.delete(address)
      console.log(`[Server] purse load failed for ${address}: ${error}`)
    })
}

/** The player's purse, or null while it is still being read. */
function purseOf(address: string): Purse | null {
  const purse = purses.get(address)
  if (purse !== undefined) return purse
  beginLoad(address)
  return null
}

/** Serialises the inventory as the `id:count` pairs the wallet message carries. */
function encodeOwned(purse: Purse): string {
  return Object.keys(purse.owned)
    .map((id) => `${id}:${purse.owned[id]}`)
    .join(',')
}

/**
 * Tells one player what they now hold. Nobody else is told.
 *
 * Reads the map directly instead of going through purseOf: this must never be the thing
 * that triggers a load, or a message sent mid-load would race the read it started.
 */
function sendWallet(address: string): void {
  const purse = purses.get(address)
  if (purse === undefined) return

  room.send(
    'wallet',
    { ore: purse.ore, coins: purse.coins, owned: encodeOwned(purse) },
    { to: [address] }
  )
}

function sendResult(address: string, action: string, ok: boolean, detail: string): void {
  room.send('actionResult', { action, ok, detail }, { to: [address] })
}

function handleSwing(address: string, hit: boolean): void {
  // Dropped silently: an honest client never reaches this rate, and answering would hand a
  // spammer a reply for every message they send.
  const last = lastSwingAt.get(address)
  if (last !== undefined && serverClock - last < MIN_SWING_INTERVAL_SECONDS) {
    droppedSwings.set(address, (droppedSwings.get(address) ?? 0) + 1)
    return
  }
  const purse = purseOf(address)
  // Still loading: the swing is dropped rather than paid into a purse that is about to be
  // replaced. The window is a fraction of a second, right after arriving.
  if (purse === null) return

  lastSwingAt.set(address, serverClock)
  purse.ore += hit ? ORE_PER_HIT : ORE_PER_MISS
  dirty.add(address)
  sendWallet(address)
}

function handleSell(address: string, requested: number): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'sell', false, 'still loading')
    return
  }

  // Never trust the amount: the client can ask to sell more than it has, or a fraction, or
  // a negative. Clamp to what the purse actually holds before anything is priced.
  const amount = Math.max(0, Math.min(Math.floor(requested), purse.ore))
  if (amount <= 0) {
    sendResult(address, 'sell', false, 'nothing to sell')
    return
  }

  const payout = quoteSale(amount) // priced before the sale moves the market
  purse.ore -= amount
  purse.coins += payout
  applySale(amount)
  dirty.add(address)
  marketDirty = true

  sendWallet(address)
  sendResult(address, 'sell', true, `${amount} ore for ${payout} coins`)
  console.log(`[Server] ${address} sold ${amount} ore for ${payout} · price now ${getOrePrice().toFixed(2)}`)
}

function handleBuy(address: string, itemId: string): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'buy', false, 'still loading')
    return
  }

  const item = findItem(itemId as ShopItemId)
  if (item === null) {
    sendResult(address, 'buy', false, 'no such item')
    return
  }

  if (purse.coins < item.price) {
    sendResult(address, 'buy', false, `needs ${item.price - purse.coins} more coins`)
    return
  }

  purse.coins -= item.price
  purse.owned[item.id] = (purse.owned[item.id] ?? 0) + 1
  dirty.add(address)

  sendWallet(address)
  sendResult(address, 'buy', true, item.id)
  console.log(`[Server] ${address} bought ${item.label} for ${item.price} · balance ${purse.coins}`)
}

// Who is in the scene right now. There is no join or leave message, so presence is read off
// the player entities and diffed against the last look.
//
// Tracking departures is not bookkeeping for its own sake: a player who leaves and comes back
// arrives with an empty client mirror, so unless their address is forgotten on the way out
// they are never greeted again and sit looking at 0 ore while the server still holds their
// purse. Arrivals alone are not enough.
const present = new Set<string>()

let sinceLastPresenceCheck = 0

function checkPresence(dt: number) {
  sinceLastPresenceCheck += dt
  if (sinceLastPresenceCheck < PRESENCE_CHECK_PERIOD_SECONDS) return
  sinceLastPresenceCheck = 0

  const here = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address !== '') here.add(identity.address)
  }

  for (const address of here) {
    if (present.has(address)) continue
    present.add(address)
    // The wallet message is sent by the load itself, once there is something true to send.
    beginLoad(address)
    if (purses.has(address)) sendWallet(address)
  }

  for (const address of present) {
    if (here.has(address)) continue
    present.delete(address)
    // The purse stays in `purses` — only the greeting is forgotten, so the next arrival is
    // treated as new and gets told what it holds.
    lastSwingAt.delete(address)
    // Written out now rather than at the next flush: leaving is exactly when a player is
    // most likely to not come back before the server stops.
    flushPurse(address)
    console.log(`[Server] ${address} left`)
  }
}

function flushPurse(address: string): void {
  const purse = purses.get(address)
  if (purse === undefined || !dirty.has(address)) return
  dirty.delete(address)
  savePurse(address, { ore: purse.ore, coins: purse.coins, owned: purse.owned })
}

function flushSaves(dt: number) {
  sinceLastSave += dt
  if (sinceLastSave < SAVE_PERIOD_SECONDS) return
  sinceLastSave = 0

  for (const address of [...dirty]) flushPurse(address)

  if (marketDirty) {
    marketDirty = false
    saveMarketPrice(getOrePrice())
  }
}

function advanceClock(dt: number) {
  serverClock += dt
}

// Rate limiting that nobody can see is rate limiting nobody can debug, so what was dropped
// gets said out loud — in one periodic line rather than one per drop.
function reportAbuse(dt: number) {
  sinceLastAbuseReport += dt
  if (sinceLastAbuseReport < ABUSE_REPORT_PERIOD_SECONDS) return
  sinceLastAbuseReport = 0
  if (droppedSwings.size === 0) return

  for (const [address, count] of droppedSwings) {
    console.log(`[Server] dropped ${count} over-rate swing(s) from ${address}`)
  }
  droppedSwings.clear()
}

function publishPrice(dt: number) {
  recoverPrice(dt)

  // Only on a real change, and only to two decimals: the recovery moves the price by a
  // fraction every frame, and syncing that every frame would be 30 writes a second of noise.
  const price = Math.round(getOrePrice() * 100) / 100
  if (price === lastPublishedPrice) return
  lastPublishedPrice = price
  marketDirty = true
  OreMarket.getMutable(marketEntity).price = price
}

export function setupEconomy(): void {
  // The price is restored rather than reset so a restart does not quietly hand the town a
  // fresh market. It also keeps balance playtests honest: a floored price stays floored.
  loadMarketPrice()
    .then((stored) => {
      if (stored === null) return
      restorePrice(stored)
      console.log(`[Server] market price restored at ${stored.toFixed(2)}`)
    })
    .catch((error) => console.log(`[Server] market price restore failed: ${error}`))

  marketEntity = engine.addEntity()
  OreMarket.create(marketEntity, { price: getOrePrice() })
  syncEntity(marketEntity, [OreMarket.componentId], MARKET_ENTITY_ENUM_ID)

  room.onMessage('hello', (_data, context) => {
    if (!context) return
    // purseOf starts the read if it has not happened yet; the load's own completion sends the
    // wallet in that case, so this only sends when there is already something true to send.
    if (purseOf(context.from) !== null) sendWallet(context.from)
  })

  room.onMessage('swing', (data, context) => {
    if (!context) return
    handleSwing(context.from, data.hit)
  })

  room.onMessage('sell', (data, context) => {
    if (!context) return
    handleSell(context.from, data.amount)
  })

  room.onMessage('buy', (data, context) => {
    if (!context) return
    handleBuy(context.from, data.itemId)
  })

  // The clock goes first so everything scheduled after it reads the current frame's time.
  engine.addSystem(advanceClock, undefined, 'server:clock')
  engine.addSystem(publishPrice, undefined, 'server:market-price')
  engine.addSystem(reportAbuse, undefined, 'server:abuse-report')
  engine.addSystem(flushSaves, undefined, 'server:save')
  engine.addSystem(checkPresence, undefined, 'server:presence')
}
