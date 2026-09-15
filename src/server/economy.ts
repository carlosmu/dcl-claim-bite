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
import { applySale, getOrePrice, quoteSale, recoverPrice } from '../shared/state/market'
import { ORE_PER_HIT, ORE_PER_MISS } from '../shared/economy/constants'
import { findItem, ShopItemId } from '../shared/economy/catalogue'

type Purse = {
  ore: number
  coins: number
  owned: Record<string, number>
}

const purses = new Map<string, Purse>()
let marketEntity = engine.RootEntity
let lastPublishedPrice = -1

function purseOf(address: string): Purse {
  let purse = purses.get(address)
  if (purse === undefined) {
    purse = { ore: 0, coins: 0, owned: {} }
    purses.set(address, purse)
  }
  return purse
}

/** Serialises the inventory as the `id:count` pairs the wallet message carries. */
function encodeOwned(purse: Purse): string {
  return Object.keys(purse.owned)
    .map((id) => `${id}:${purse.owned[id]}`)
    .join(',')
}

/** Tells one player what they now hold. Nobody else is told. */
function sendWallet(address: string): void {
  const purse = purseOf(address)
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
  const purse = purseOf(address)
  purse.ore += hit ? ORE_PER_HIT : ORE_PER_MISS
  sendWallet(address)
}

function handleSell(address: string, requested: number): void {
  const purse = purseOf(address)
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

  sendWallet(address)
  sendResult(address, 'sell', true, `${amount} ore for ${payout} coins`)
  console.log(`[Server] ${address} sold ${amount} ore for ${payout} · price now ${getOrePrice().toFixed(2)}`)
}

function handleBuy(address: string, itemId: string): void {
  const purse = purseOf(address)
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

  sendWallet(address)
  sendResult(address, 'buy', true, item.id)
  console.log(`[Server] ${address} bought ${item.label} for ${item.price} · balance ${purse.coins}`)
}

// A player who just arrived has no idea what they hold until told, and there is no join
// message — so arrival is detected by their entity showing up.
const greeted = new Set<string>()

function greetArrivals() {
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const address = identity.address
    if (address === '' || greeted.has(address)) continue
    greeted.add(address)
    sendWallet(address)
    console.log(`[Server] wallet sent to ${address}`)
  }
}

function publishPrice(dt: number) {
  recoverPrice(dt)

  // Only on a real change, and only to two decimals: the recovery moves the price by a
  // fraction every frame, and syncing that every frame would be 30 writes a second of noise.
  const price = Math.round(getOrePrice() * 100) / 100
  if (price === lastPublishedPrice) return
  lastPublishedPrice = price
  OreMarket.getMutable(marketEntity).price = price
}

export function setupEconomy(): void {
  marketEntity = engine.addEntity()
  OreMarket.create(marketEntity, { price: getOrePrice() })
  syncEntity(marketEntity, [OreMarket.componentId], MARKET_ENTITY_ENUM_ID)

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

  engine.addSystem(publishPrice, undefined, 'server:market-price')
  engine.addSystem(greetArrivals, undefined, 'server:greet-arrivals')
}
