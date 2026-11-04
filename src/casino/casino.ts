import { engine, Entity, Name } from '@dcl/sdk/ecs'

import { holdBackCoins, releaseHeldCoins, sendSlotSpin } from '../net/economy-link'
import { SLOT_BETS, SLOT_REEL_STOP_SECONDS, SLOT_SYMBOLS } from '../shared/economy/slots'
import { getCoins } from '../shared/state/wallet'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { playSfx } from '../world/sfx'

// The casino: slot machines in the building across from the bank, placed in the Creator Hub, all
// playing the one machine in this file. A spin is a request like any other. The reels start at
// once for the feel of the lever, and stop on what the server answered; the panel never decides
// anything.

/** Every entity whose Creator Hub name starts like this is a machine, however many get placed. */
const MACHINE_NAME_PREFIX = 'slot_machine'

export const CASINO_RADIUS_METERS = 4

/** How fast a spinning reel changes symbol. */
const REEL_CHANGE_SECONDS = 0.08
/** How long a spin waits for the server before giving up. */
const ANSWER_TIMEOUT_SECONDS = 6

const LEVER_SOUND_CLIP = 'assets/sounds/buy.mp3'
const REEL_STOP_SOUND_CLIP = 'assets/sounds/picking.mp3'
const WIN_SOUND_CLIP = 'assets/sounds/bank.mp3'
const JACKPOT_SOUND_CLIP = 'assets/sounds/match.mp3'
const SOUND_VOLUME = 0.8

type SlotResult = { reels: number[]; bet: number; win: number; jackpot: boolean }

let zone: ProximityZone | null = null
let panelClosed = false
/** Whether the panel's jackpot and pay boxes are unfolded. Folded again each time the panel opens. */
let infoOpen = false

let bet = SLOT_BETS[0]
let spinning = false
let elapsed = 0
let sinceReelChange = 0
let reelsStopped = 0
let result: SlotResult | null = null
let message = 'Pull the lever'
const reels = [0, 1, 2]

export function isCasinoPanelOpen(): boolean {
  return zone !== null && zone.isPlayerInside() && !panelClosed
}

export function closeCasinoPanel(): void {
  panelClosed = true
  zone?.release()
}

export function isSlotInfoOpen(): boolean {
  return infoOpen
}

export function toggleSlotInfo(): void {
  infoOpen = !infoOpen
}

export function getSlotBet(): number {
  return bet
}

export function setSlotBet(next: number): void {
  if (!spinning) bet = next
}

export function isSlotSpinning(): boolean {
  return spinning
}

export function canSpinSlot(): boolean {
  return !spinning && getCoins() >= bet
}

/** What the three reels show right now, as indexes into SLOT_SYMBOLS. */
export function getSlotReels(): readonly number[] {
  return reels
}

export function getSlotMessage(): string {
  return spinning ? 'Spinning...' : message
}

/** Pulls the lever. The bet is taken, and the win paid, when the server says so. */
export function spinSlot(): void {
  if (!canSpinSlot()) return
  spinning = true
  elapsed = 0
  sinceReelChange = 0
  reelsStopped = 0
  result = null
  sendSlotSpin(bet)
  playSfx(LEVER_SOUND_CLIP, SOUND_VOLUME)
}

/** The server spun. Called before the wallet that pays it arrives, so the HUD can wait for the reels. */
export function onSlotResult(data: SlotResult): void {
  // The wait gave up on this spin: the balance can simply show the truth.
  if (!spinning) return
  result = data
  holdBackCoins(data.win)
}

/** The server refused the spin, so nothing was charged. */
export function onSlotRefused(detail: string): void {
  spinning = false
  message = detail
}

function finishSpin(answer: SlotResult): void {
  spinning = false
  releaseHeldCoins()
  if (answer.jackpot) {
    message = `JACKPOT! ${answer.win} COINS`
    playSfx(JACKPOT_SOUND_CLIP, SOUND_VOLUME)
  } else if (answer.win > answer.bet) {
    message = `YOU WIN ${answer.win} COINS`
    playSfx(WIN_SOUND_CLIP, SOUND_VOLUME)
  } else if (answer.win === answer.bet) {
    message = 'BET RETURNED'
    playSfx(WIN_SOUND_CLIP, SOUND_VOLUME)
  } else {
    message = 'No luck. Spin again'
  }
}

function runReels(dt: number): void {
  if (!spinning) return
  elapsed += dt

  if (result === null && elapsed >= ANSWER_TIMEOUT_SECONDS) {
    spinning = false
    message = 'The machine did not answer'
    return
  }

  while (result !== null && reelsStopped < reels.length && elapsed >= SLOT_REEL_STOP_SECONDS[reelsStopped]) {
    reels[reelsStopped] = result.reels[reelsStopped]
    reelsStopped += 1
    playSfx(REEL_STOP_SOUND_CLIP, SOUND_VOLUME)
  }
  if (result !== null && reelsStopped === reels.length) {
    finishSpin(result)
    return
  }

  sinceReelChange += dt
  if (sinceReelChange < REEL_CHANGE_SECONDS) return
  sinceReelChange = 0
  for (let index = reelsStopped; index < reels.length; index++) {
    reels[index] = (reels[index] + 1) % SLOT_SYMBOLS.length
  }
}

export function setupCasino(): void {
  const machines: Entity[] = []
  for (const [entity, name] of engine.getEntitiesWith(Name)) {
    if (name.value.startsWith(MACHINE_NAME_PREFIX)) machines.push(entity)
  }
  if (machines.length === 0) {
    console.error(`[casino] no entity named "${MACHINE_NAME_PREFIX}..." in the scene: the casino stays shut`)
    return
  }

  zone = createProximityZone({
    entityName: 'casino-machine',
    entity: machines,
    radiusMeters: CASINO_RADIUS_METERS,
    click: { entity: machines, hoverText: 'Play Slots' },
    onEnter: () => {
      panelClosed = false
      infoOpen = false
      focusPanel('casino')
    },
    onClick: () => {
      if (!panelClosed) return
      panelClosed = false
      infoOpen = false
      focusPanel('casino')
    }
  })
  registerPanel('casino', closeCasinoPanel)

  // Outside the panel: a spin keeps running if the player closes it or walks off.
  engine.addSystem(runReels, undefined, 'client:casino-reels')
}
