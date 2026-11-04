// The casino's one piece of town-wide state, the jackpot, and the spin itself.
//
// Like the other town-wide records, the pot is only changed once it has been read (or confirmed
// absent): a failed read is never taken for an empty pot, so the machine stays shut until then.
// The player's purse is not touched here; economy.ts charges and pays what a spin comes to.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { isJackpot, JACKPOT_MIN, JACKPOT_RATE, jackpotShare, payMultiplier, spinReel } from '../shared/economy/slots'
import { CASINO_ENTITY_ENUM_ID, CasinoJackpot } from '../shared/net/casino-sync'
import { noteSpin, setupCasinoStats } from './casino-stats'
import { loadJackpot, saveJackpot } from './persistence'

/** How often a changed pot is written out. */
const SAVE_SECONDS = 5

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

let jackpotEntity = engine.RootEntity
/** Kept with its fraction: the 2% of a small bet is less than a coin. */
let pot = JACKPOT_MIN
let loaded = false
let loading = false
let retryIn = 0
let potDirty = false
let sinceLastSave = 0

export type Spin = { reels: number[]; win: number; jackpot: boolean }

/** Whether the machine can take a bet yet. */
export function isCasinoReady(): boolean {
  return loaded
}

/** Spins for this bet: feeds the pot, then works out the win, the pot's share included. */
export function spin(bet: number): Spin {
  const reels = [spinReel(Math.random), spinReel(Math.random), spinReel(Math.random)]
  const potBefore = pot
  pot += bet * JACKPOT_RATE
  let win = bet * payMultiplier(reels)
  const jackpot = isJackpot(reels)
  if (jackpot) {
    const share = jackpotShare(pot, bet)
    pot = Math.max(pot - share, JACKPOT_MIN)
    win += share
  }
  potDirty = true
  publish()
  noteSpin(bet, win, jackpot, pot - potBefore)
  return { reels, win, jackpot }
}

function publish(): void {
  const shown = Math.floor(pot)
  if (CasinoJackpot.get(jackpotEntity).pot !== shown) CasinoJackpot.getMutable(jackpotEntity).pot = shown
}

function load(): void {
  if (loading) return
  loading = true
  loadJackpot()
    .then((stored) => {
      loading = false
      loaded = true
      pot = Math.max(stored ?? 0, JACKPOT_MIN)
      publish()
    })
    .catch((error) => {
      loading = false
      retryIn = LOAD_RETRY_SECONDS
      console.log(`[Server] jackpot restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

function save(): void {
  if (!potDirty) return
  potDirty = false
  saveJackpot(pot)
    .then((ok) => {
      if (!ok) potDirty = true
    })
    .catch(() => (potDirty = true))
}

function tick(dt: number): void {
  if (!loaded) {
    retryIn -= dt
    if (retryIn <= 0 && !loading) load()
    return
  }
  sinceLastSave += dt
  if (sinceLastSave < SAVE_SECONDS) return
  sinceLastSave = 0
  save()
}

export function setupCasino(): void {
  jackpotEntity = engine.addEntity()
  CasinoJackpot.create(jackpotEntity, { pot: JACKPOT_MIN })
  syncEntity(jackpotEntity, [CasinoJackpot.componentId], CASINO_ENTITY_ENUM_ID)

  engine.addSystem(tick, undefined, 'server:casino')
  load()
  setupCasinoStats()
}
