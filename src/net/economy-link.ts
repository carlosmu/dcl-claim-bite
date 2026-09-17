// The client's end of the economy: asks, then believes what it is told.
//
// Nothing here changes a balance on its own. A swing, a sale and a purchase are all requests
// sent to the server, and the numbers on screen move when the `wallet` message comes back.
// That round trip is the whole point — it is what makes the HUD show a balance that cannot
// be edited by the player holding it.

import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'

import { room } from '../shared/net/protocol'
import { OreMarket } from '../shared/net/market-sync'
import { applyServerWallet } from '../shared/state/wallet'
import { applyServerOwned, getOwned } from '../shared/state/inventory'
import { RATE_BASE } from '../shared/economy/constants'
import { quoteSaleAt } from '../shared/state/market'
import { playSfx } from '../world/sfx'
import { equipPick } from '../player/held-pick'

const BANK_SOUND_CLIP = 'assets/sounds/bank.mp3'
const BUY_SOUND_CLIP = 'assets/sounds/buy.mp3'
const SOUND_VOLUME = 0.8

// Falls back to the base price only until the first sync lands, so the panel never has to
// render an empty slot.
let price = RATE_BASE

/** How often the client re-announces itself while it still has no purse. */
const HELLO_RETRY_SECONDS = 1

let capacity = 0
let hitsPerRock = 0
let muleOre = 0
let muleCapacity = 0
let walletReceived = false
let sinceLastHello = HELLO_RETRY_SECONDS

/** The town's rate as the server last published it, in ore per coin. */
export function getSyncedRate(): number {
  return price
}

/** How much ore the bag holds, as the server computed it from what the player owns. */
export function getCarryCapacity(): number {
  return capacity
}

/** Hits a rock takes with the player's best pick. Zero means they own none. */
export function getHitsPerRock(): number {
  return hitsPerRock
}

/** Ore waiting in the player's rig. */
export function getMuleOre(): number {
  return muleOre
}

/** What the rig holds when full. Zero means the player owns none. */
export function getMuleCapacity(): number {
  return muleCapacity
}

/** What selling `amount` would pay at the synced price — for display only. */
export function quoteSaleForDisplay(amount: number): number {
  return quoteSaleAt(price, amount)
}

export function sendRockDone(): void {
  if (!isStateSyncronized()) return
  room.send('rockDone', { ready: true })
}

export function sendSell(amount: number): void {
  if (!isStateSyncronized()) return
  room.send('sell', { amount })
}

export function sendBuy(itemId: string): void {
  if (!isStateSyncronized()) return
  room.send('buy', { itemId })
}

export function sendCollect(): void {
  if (!isStateSyncronized()) return
  room.send('collect', { ready: true })
}

/**
 * Asks the server for this player's purse, and keeps asking until one arrives.
 *
 * Retrying is what makes this reliable rather than another guess: the first ask can be too
 * early, the answer can be lost, or the server can have restarted underneath a client that
 * never disconnected. All three look the same from here — no wallet yet — and all three are
 * fixed by asking again a second later. It stops the moment a wallet lands.
 */
function announce(dt: number) {
  if (walletReceived || !isStateSyncronized()) return

  sinceLastHello += dt
  if (sinceLastHello < HELLO_RETRY_SECONDS) return
  sinceLastHello = 0
  room.send('hello', { ready: true })
}

function readPrice() {
  for (const [, market] of engine.getEntitiesWith(OreMarket)) {
    price = market.price
    return
  }
}

export function setupEconomyLink(): void {
  room.onMessage('wallet', (data) => {
    walletReceived = true
    capacity = data.capacity
    hitsPerRock = data.hitsPerRock
    muleOre = data.muleOre
    muleCapacity = data.muleCapacity
    applyServerWallet(data.ore, data.coins)
    applyServerOwned(data.owned)

    // Gear follows what is OWNED, not the moment of purchase. After a reload the purchase is
    // history but the pick is still theirs, so it has to be put back in their hand here —
    // this is the only message that runs on arrival. equipPick() is idempotent.
    if (hitsPerRock > 0) equipPick()

    console.log(
      `[economy] wallet from server: ${data.ore}/${data.capacity} ore, ${data.coins} coins, ` +
        `${data.hitsPerRock} hits per rock, owned "${data.owned}"`
    )
  })

  // The feedback for an action fires here rather than at the button, because only now is it
  // known whether it actually happened. A refused purchase makes no sound.
  room.onMessage('actionResult', (data) => {
    if (!data.ok) {
      console.log(`[economy] ${data.action} refused: ${data.detail}`)
      return
    }

    if (data.action === 'sell') playSfx(BANK_SOUND_CLIP, SOUND_VOLUME)
    if (data.action === 'buy') playSfx(BUY_SOUND_CLIP, SOUND_VOLUME)
    if (data.action === 'collect') playSfx(BANK_SOUND_CLIP, SOUND_VOLUME)
    console.log(`[economy] ${data.action}: ${data.detail}`)
  })

  engine.addSystem(readPrice, undefined, 'client:market-price')
  engine.addSystem(announce, undefined, 'client:announce')
}
