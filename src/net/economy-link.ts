// The client's end of the economy: asks, then believes what it is told.
//
// Nothing here changes a balance on its own. A swing, a sale and a purchase are all requests
// sent to the server, and the numbers on screen move when the `wallet` message comes back.
// That round trip is the whole point — it is what makes the HUD show a balance that cannot
// be edited by the player holding it.

import { engine } from '@dcl/sdk/ecs'
import { triggerEmote } from '~system/RestrictedActions'
import { isStateSyncronized } from '@dcl/sdk/network'

import { room } from '../shared/net/protocol'
import { OreMarket } from '../shared/net/market-sync'
import { showSocialBonus } from '../ui/ore-popup'
import { applyServerWallet } from '../shared/state/wallet'
import { applyServerEquipped, applyServerOwned } from '../shared/state/inventory'
import { RATE_BASE } from '../shared/economy/constants'
import { quoteSaleAt } from '../shared/state/market'
import { playSfx } from '../world/sfx'
import { equipPick, unequipPick } from '../player/held-pick'
import { onMayorPickGiven } from '../mayor/mayor'

const BANK_SOUND_CLIP = 'assets/sounds/bank.mp3'
const BUY_SOUND_CLIP = 'assets/sounds/buy.mp3'
const SOUND_VOLUME = 0.8

// Falls back to the base price only until the first sync lands, so the panel never has to
// render an empty slot.
let price = RATE_BASE

// The rates this session has seen, oldest first, for the bank's chart. A new entry lands
// only when the rate moves by the smallest step the panel shows, so the slow recovery
// does not fill it with near-duplicates.
const RATE_HISTORY_LENGTH = 30
const RATE_HISTORY_STEP = 0.1
const rateHistory: number[] = []

/** How often the client re-announces itself while it still has no purse. */
const HELLO_RETRY_SECONDS = 1

let capacity = 0
let hitsPerRock = 0
let muleCount = 0
let muleFuelHours = 0
let walletReceived = false
let sinceLastHello = HELLO_RETRY_SECONDS

/** The town's rate as the server last published it, in ore per coin. */
export function getSyncedRate(): number {
  return price
}

/** The rates seen this session, oldest first, each rounded to the panel's 0.1 step. */
export function getRateHistory(): readonly number[] {
  return rateHistory
}

/** How much ore the bag holds, as the server computed it from what the player owns. */
export function getCarryCapacity(): number {
  return capacity
}

/** Hits a rock takes with the player's pick in use. Zero means they own none. */
export function getHitsPerRock(): number {
  return hitsPerRock
}

/** How many rigs the player owns. They dig straight into storage. */
export function getMuleCount(): number {
  return muleCount
}

/** Hours the rigs keep running on their fuel. Zero means they have stopped. */
export function getMuleFuelHours(): number {
  return muleFuelHours
}

/** Whether the server has sent this player's purse yet. Until then every figure above is a placeholder. */
export function hasWallet(): boolean {
  return walletReceived
}

/** What selling `amount` would pay at the synced price — for display only. */
export function quoteSaleForDisplay(amount: number): number {
  return quoteSaleAt(price, amount)
}

export function sendRockDone(seq: number): void {
  if (!isStateSyncronized()) return
  room.send('rockDone', { seq })
}

export function sendSwing(seq: number): void {
  if (!isStateSyncronized()) return
  room.send('swing', { seq })
}

export function sendSell(amount: number): void {
  if (!isStateSyncronized()) return
  room.send('sell', { amount })
}

export function sendBuy(itemId: string): void {
  if (!isStateSyncronized()) return
  room.send('buy', { itemId })
}

/** Asks to use a pick the player already owns. */
export function sendEquip(itemId: string): void {
  if (!isStateSyncronized()) return
  room.send('equip', { itemId })
}

/** Asks the mayor's free pick. The server only grants it to a player with none. */
export function sendClaimPick(): void {
  if (!isStateSyncronized()) return
  room.send('claimPick', { ready: true })
}

/** DEBUG: asks the server for free coins. */
export function sendDebugCoins(amount: number): void {
  if (!isStateSyncronized()) return
  room.send('debugCoins', { amount })
}

/** DEBUG: asks the server for free ore. */
export function sendDebugOre(amount: number): void {
  if (!isStateSyncronized()) return
  room.send('debugOre', { amount })
}

/** DEBUG: asks the server to wipe this player's progress. */
export function sendDebugReset(): void {
  if (!isStateSyncronized()) return
  room.send('debugReset', { ready: true })
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
    recordRate(price)
    return
  }
}

function recordRate(rate: number): void {
  const rounded = Math.round(rate / RATE_HISTORY_STEP) * RATE_HISTORY_STEP
  const last = rateHistory[rateHistory.length - 1]
  if (last !== undefined && Math.abs(rounded - last) < RATE_HISTORY_STEP / 2) return
  rateHistory.push(rounded)
  if (rateHistory.length > RATE_HISTORY_LENGTH) rateHistory.shift()
}

export function setupEconomyLink(): void {
  room.onMessage('wallet', (data) => {
    walletReceived = true
    capacity = data.capacity
    hitsPerRock = data.hitsPerRock
    muleCount = data.mules
    muleFuelHours = data.muleFuelHours
    applyServerWallet(data.ore, data.coins)
    applyServerOwned(data.owned)
    applyServerEquipped(data.equipped)

    // Gear follows what is OWNED, not the moment of purchase. After a reload the purchase is
    // history but the pick is still theirs, so it has to be put back in their hand here —
    // this is the only message that runs on arrival. equipPick() is idempotent, and swaps the
    // model when another pick is bought or chosen in the inventory.
    if (data.equipped !== '') equipPick(data.equipped)
    // No pick left at all (a debug reset): nothing in the hand either.
    else if (data.hitsPerRock <= 0) unequipPick()

    console.log(
      `[economy] wallet from server: ${data.ore}/${data.capacity} ore, ${data.coins} coins, ` +
        `${data.hitsPerRock} hits per rock, owned "${data.owned}"`
    )
  })

  // The payout's Social Bonus part, added under the "+10 Ore" that went up when the bar filled.
  room.onMessage('rockPaid', (data) => {
    if (data.bonus > 0) showSocialBonus(data.bonus)
  })

  // The feedback for an action fires here rather than at the button, because only now is it
  // known whether it actually happened. A refused purchase makes no sound.
  /** The mayor's pick in hand: a fist pump. Needs ALLOW_TO_TRIGGER_AVATAR_EMOTE, as mining does. */
  function celebratePick(): void {
    try {
      triggerEmote({ predefinedEmote: 'fistpump' }).catch((error) => {
        console.error(`[player] could not play the fist pump: ${error}`)
      })
    } catch (error) {
      console.error(`[player] could not play the fist pump: ${error}`)
    }
  }

  room.onMessage('actionResult', (data) => {
    if (!data.ok) {
      console.log(`[economy] ${data.action} refused: ${data.detail}`)
      return
    }

    if (data.action === 'sell') playSfx(BANK_SOUND_CLIP, SOUND_VOLUME)
    if (data.action === 'buy' || data.action === 'claimPick' || data.action === 'equip') playSfx(BUY_SOUND_CLIP, SOUND_VOLUME)
    if (data.action === 'claimPick') {
      celebratePick()
      onMayorPickGiven()
    }
    console.log(`[economy] ${data.action}: ${data.detail}`)
  })

  engine.addSystem(readPrice, undefined, 'client:market-price')
  engine.addSystem(announce, undefined, 'client:announce')
}
