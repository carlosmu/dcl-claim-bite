// How many of each sold item its dispenser has handed over, so the shop stops selling it before
// the dispenser runs dry rather than taking coins and giving them back.
//
// The dispensers are real and outlive seasons, so the tally is kept town-wide and without a season
// suffix. A claim reserves a unit while the Rewards service answers, so two players buying the last
// one at once cannot both be let through. When the tally reaches an item's stock (shared/rewards.ts),
// the item is listed as sold out for everyone (RewardStock).
//
// Like the other town-wide records, the tally is only changed once it has been read (or confirmed
// absent): a failed read is never taken for zero sold. Until then, sales of stocked items wait.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { REWARD_STOCK_ENTITY_ENUM_ID, RewardStock } from '../shared/net/reward-stock-sync'
import { REWARD_CAMPAIGNS } from '../shared/rewards'
import { loadRewardStock, saveRewardStock } from './persistence'

/**
 * Units each dispenser had handed over before this tally began (test purchases included), from the
 * Rewards dashboard. The tally never goes below these: raise one to bring it in line with the
 * dashboard, then deploy.
 */
const DELIVERED_BEFORE_TALLY: Record<string, number> = {
  'drifter-boots': 0,
  'drifter-hat': 0,
  'drifter-gear': 0,
  'drifter-pants': 0
}

/** How often a changed tally is written out. */
const SAVE_SECONDS = 5

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

let stockEntity = engine.RootEntity
let delivered: Record<string, number> = {}
/** Units reserved by claims the Rewards service has not answered yet. */
const reserved = new Map<string, number>()
let loaded = false
let loading = false
let retryIn = 0
let dirty = false
let sinceLastSave = 0
let lastPublished = ''

function stockOf(id: string): number | undefined {
  return REWARD_CAMPAIGNS.find((campaign) => campaign.id === id)?.stock
}

/**
 * Holds one unit of `id` for a claim about to be sent. 'ok': go ahead, and call releaseStock with
 * the answer. 'soldOut': none left. 'loading': the tally has not been read yet. An item with no
 * stock set is always 'ok' and needs no release.
 */
export function reserveStock(id: string): 'ok' | 'soldOut' | 'loading' {
  const stock = stockOf(id)
  if (stock === undefined) return 'ok'
  if (!loaded) return 'loading'
  const held = reserved.get(id) ?? 0
  if ((delivered[id] ?? 0) + held >= stock) return 'soldOut'
  reserved.set(id, held + 1)
  return 'ok'
}

/**
 * The answer to a reserved claim: `handedOver` if the dispenser gave the item, `outOfStock` if it
 * said it had none left, whatever the tally thought (then the item is sold out from now on).
 */
export function releaseStock(id: string, handedOver: boolean, outOfStock: boolean): void {
  const stock = stockOf(id)
  if (stock === undefined) return
  reserved.set(id, Math.max(0, (reserved.get(id) ?? 0) - 1))
  if (handedOver) {
    delivered[id] = (delivered[id] ?? 0) + 1
    dirty = true
  } else if (outOfStock && (delivered[id] ?? 0) < stock) {
    console.log(`[Server] the dispenser for ${id} ran out at ${delivered[id] ?? 0} of ${stock}: marked sold out`)
    delivered[id] = stock
    dirty = true
  }
  publish()
}

function publish(): void {
  const soldOut = REWARD_CAMPAIGNS.filter((campaign) => campaign.stock !== undefined && (delivered[campaign.id] ?? 0) >= campaign.stock).map(
    (campaign) => campaign.id
  )
  const encoded = JSON.stringify(soldOut)
  if (encoded === lastPublished) return
  lastPublished = encoded
  RewardStock.getMutable(stockEntity).soldOut = soldOut
}

function load(): void {
  if (loading) return
  loading = true
  loadRewardStock()
    .then((stored) => {
      loading = false
      loaded = true
      delivered = stored ?? {}
      // Never below what the dashboard said had gone before the tally began.
      for (const id of Object.keys(DELIVERED_BEFORE_TALLY)) {
        if ((delivered[id] ?? 0) < DELIVERED_BEFORE_TALLY[id]) {
          delivered[id] = DELIVERED_BEFORE_TALLY[id]
          dirty = true
        }
      }
      console.log(`[Server] reward stock restored: ${JSON.stringify(delivered)}`)
      publish()
    })
    .catch((error) => {
      loading = false
      retryIn = LOAD_RETRY_SECONDS
      console.log(`[Server] reward stock restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

function save(): void {
  if (!dirty) return
  dirty = false
  saveRewardStock(delivered)
    .then((ok) => {
      if (!ok) dirty = true
    })
    .catch(() => (dirty = true))
}

/** Saves the tally now if it changed (maintenance, see economy.ts). True if there was something to save. */
export function saveRewardStockNow(): boolean {
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

export function setupRewardStock(): void {
  stockEntity = engine.addEntity()
  RewardStock.create(stockEntity, { soldOut: [] })
  syncEntity(stockEntity, [RewardStock.componentId], REWARD_STOCK_ENTITY_ENUM_ID)
  engine.addSystem(tick, undefined, 'server:reward-stock')
  load()
}
