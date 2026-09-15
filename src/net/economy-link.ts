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
import { applyServerOwned } from '../shared/state/inventory'
import { ORE_BASE_PRICE } from '../shared/economy/constants'
import { quoteSaleAt } from '../shared/state/market'
import { playSfx } from '../world/sfx'
import { equipPick } from '../player/held-pick'

const BANK_SOUND_CLIP = 'assets/sounds/bank.mp3'
const BUY_SOUND_CLIP = 'assets/sounds/buy.mp3'
const SOUND_VOLUME = 0.8

// Falls back to the base price only until the first sync lands, so the panel never has to
// render an empty slot.
let price = ORE_BASE_PRICE

/** The town's price as the server last published it. */
export function getSyncedOrePrice(): number {
  return price
}

/** What selling `amount` would pay at the synced price — for display only. */
export function quoteSaleForDisplay(amount: number): number {
  return quoteSaleAt(price, amount)
}

export function sendSwing(hit: boolean): void {
  if (!isStateSyncronized()) return
  room.send('swing', { hit })
}

export function sendSell(amount: number): void {
  if (!isStateSyncronized()) return
  room.send('sell', { amount })
}

export function sendBuy(itemId: string): void {
  if (!isStateSyncronized()) return
  room.send('buy', { itemId })
}

function readPrice() {
  for (const [, market] of engine.getEntitiesWith(OreMarket)) {
    price = market.price
    return
  }
}

export function setupEconomyLink(): void {
  room.onMessage('wallet', (data) => {
    applyServerWallet(data.ore, data.coins)
    applyServerOwned(data.owned)
  })

  // The feedback for an action fires here rather than at the button, because only now is it
  // known whether it actually happened. A refused purchase makes no sound.
  room.onMessage('actionResult', (data) => {
    if (!data.ok) {
      console.log(`[economy] ${data.action} refused: ${data.detail}`)
      return
    }

    if (data.action === 'sell') playSfx(BANK_SOUND_CLIP, SOUND_VOLUME)
    if (data.action === 'buy') {
      playSfx(BUY_SOUND_CLIP, SOUND_VOLUME)
      if (data.detail === 'pick') equipPick()
    }
    console.log(`[economy] ${data.action}: ${data.detail}`)
  })

  engine.addSystem(readPrice, undefined, 'client:market-price')
}
