// The objective tracker: the ONE thing the player should know or do next.
//
// Not a history. Every frame the game state is read and the most pressing entry wins; when
// nothing is worth saying, there is no entry and the panel hides. Alerts (something stopped,
// something is full) outrank objectives (what to do next), so a full storage is never hidden
// behind "buy an upgrade".
//
// It only informs. Nothing here opens a panel or moves the player: the bank, the store and the
// rig are still walked to.

import { engine } from '@dcl/sdk/ecs'

import { canBuy, currentPrice } from '../shop/shop'
import {
  getCarryCapacity,
  getHitsPerRock,
  getMuleCount,
  getMuleFuelHours,
  getSyncedRate,
  getBrokenPick,
  hasWallet
} from '../net/economy-link'
import { findItem, fuelTankGallons, nextTier, ShopItemId } from '../shared/economy/catalogue'
import { getOwned } from '../shared/state/inventory'
import { quotedRate } from '../shared/state/market'
import { getCoins, getOre } from '../shared/state/wallet'
import { getActiveMiners } from '../shared/net/social-sync'
import { socialBonus } from '../shared/economy/constants'

export type Objective = {
  /** Shown beside the bell: OBJECTIVE for a goal, the alert's own name for an alert. */
  title: string
  /** One short line: what to do. */
  message: string
  /** Optional second line: the number that matters. */
  detail: string
  /** 0–1 when the objective has a measurable goal; null otherwise. */
  progress: number | null
  alert: boolean
}

/** Under this share of the tank the fuel counts as low — the same line the M.U.L.E. panel blinks at. */
const FUEL_LOW_SHARE = 0.1

/** A rate at or under this many tenths of ore per coin is a good price — the bank's "GOOD PRICE". */
const PRICE_GOOD_MAX_TENTHS = 106

/** The first goal for a new miner: this much ore before the first trip to the bank. */
const FIRST_ORE_GOAL = 10

/** How long a price move stays on the tracker before it gives way again. */
const PRICE_ALERT_SECONDS = 6

/** How long the note that a pick broke stays up. */
const PICK_BROKEN_SECONDS = 8

/**
 * How long the Social Bonus note stays up once two or more are mining, or their number changes.
 * Not for as long as the crowd lasts: it would sit on top of the upgrade alerts the whole time.
 */
const SOCIAL_ALERT_SECONDS = 8

let clock = 0
let lastRate = -1
let priceAlertUntil = 0
let lastMiners = 0
let lastBrokenCount = 0
let pickBrokenUntil = 0
let socialAlertUntil = 0
let current: Objective | null = null

/** One message the tracker showed, and when (seconds on this client's clock). */
export type PastObjective = Objective & { at: number }

/** How many past messages the notifications screen keeps. */
const HISTORY_LENGTH = 5

/** The tracker's recent messages, newest first. */
let history: PastObjective[] = []

/** What the tracker shows right now, or null to hide it. */
export function getObjective(): Objective | null {
  return current
}

/** The tracker's last few messages, newest first. */
export function getObjectiveHistory(): readonly PastObjective[] {
  return history
}

export function clearObjectiveHistory(): void {
  history = []
}

/** Seconds on the same clock as PastObjective.at, for "how long ago". */
export function getObjectiveClock(): number {
  return clock
}

// A message counts as new when its title or its line changes. The detail does not count: it
// carries running numbers (ore so far, hours left) that would log the same message every tick.
function record(objective: Objective | null): void {
  if (objective === null) return
  const last = history[0]
  if (last !== undefined && last.title === objective.title && last.message === objective.message) return
  history = [{ ...objective, at: clock }, ...history].slice(0, HISTORY_LENGTH)
}

function alert(title: string, message: string, detail: string = ''): Objective {
  return { title, message, detail, progress: null, alert: true }
}

function goal(message: string, detail: string = '', progress: number | null = null): Objective {
  return { title: 'OBJECTIVE', message, detail, progress, alert: false }
}

function fuelGallons(): number {
  return (getMuleFuelHours() * getMuleCount()) / 24
}

function pick(): Objective | null {
  const ore = getOre()
  const capacity = getCarryCapacity()
  const mules = getMuleCount()
  const rate = quotedRate(getSyncedRate())

  // A pick just wore out. Said even when another pick took over, so the switch is not a mystery.
  if (clock < pickBrokenUntil) {
    const broken = findItem(getBrokenPick().id as ShopItemId)
    const next = getHitsPerRock() > 0 ? 'Using your next best pick' : 'The Mayor has a free one for you'
    return alert('PICK BROKEN', `${broken?.label ?? 'Your pick'} is worn out`, next)
  }

  // Nothing to mine with: the mayor is the whole first step.
  if (getHitsPerRock() <= 0) return goal('Talk to the Mayor', 'He has a free pick for you')

  if (capacity > 0 && ore >= capacity) return alert('STORAGE FULL', 'Sell ore at the Bank', `${ore} ore ready`)

  if (mules > 0 && getMuleFuelHours() <= 0) return alert('M.U.L.E. STOPPED', 'Out of fuel', 'Buy fuel at the Store')

  const tank = fuelTankGallons(mules)
  const gallons = fuelGallons()
  if (mules > 0 && tank > 0 && gallons > 0 && gallons / tank < FUEL_LOW_SHARE) {
    return alert('FUEL LOW', 'Refuel at the Store', `${Math.ceil(getMuleFuelHours())}h left`)
  }

  // Two or more mining: how the bonus works, while it is news.
  const miners = getActiveMiners()
  if (clock < socialAlertUntil && miners >= 2) {
    return alert('SOCIAL BONUS', `${miners} miners: +${socialBonus(miners)} ore per rock`, 'More miners, more ore · up to +10 at 4')
  }

  // Only news to someone with enough ore to make a sale.
  if (clock < priceAlertUntil && ore >= rate) {
    const good = Math.round(rate * 10) <= PRICE_GOOD_MAX_TENTHS
    return alert('ORE PRICE CHANGED', `Now ${rate.toFixed(1)} ore / coin`, good ? 'Good time to sell' : '')
  }

  const nextPick = nextTier('pick', (id) => getOwned(id))
  if (nextPick !== null && canBuy(nextPick)) {
    return alert('UPGRADE AVAILABLE', `${nextPick.label} at the Store`, `${currentPrice(nextPick)} coins`)
  }
  const mule = findItem('mule')
  if (mules <= 0 && mule !== null && canBuy(mule)) {
    return alert('UPGRADE AVAILABLE', 'M.U.L.E. at the Store', `${currentPrice(mule)} coins`)
  }

  // Onboarding: a first-pick miner who has not sold yet.
  const beginner = getCoins() === 0 && getOwned('steel-pick') <= 0 && mules <= 0
  if (beginner && ore < FIRST_ORE_GOAL) {
    return goal(`Mine ${FIRST_ORE_GOAL} ore at the rocks`, `${ore}/${FIRST_ORE_GOAL}`, ore / FIRST_ORE_GOAL)
  }
  if (beginner && ore >= rate) return goal('Sell your ore at the Bank', `${ore} ore ready`)

  return null
}

function update(dt: number): void {
  clock += dt
  // Before the purse arrives every figure is a placeholder: an empty tank that is not empty.
  if (!hasWallet()) {
    current = null
    return
  }

  const rate = quotedRate(getSyncedRate())
  if (lastRate >= 0 && rate !== lastRate) priceAlertUntil = clock + PRICE_ALERT_SECONDS
  lastRate = rate

  const broken = getBrokenPick().count
  if (broken !== lastBrokenCount) pickBrokenUntil = clock + PICK_BROKEN_SECONDS
  lastBrokenCount = broken

  const miners = getActiveMiners()
  if (miners >= 2 && miners !== lastMiners) socialAlertUntil = clock + SOCIAL_ALERT_SECONDS
  lastMiners = miners

  current = pick()
  record(current)
}

export function setupObjective(): void {
  engine.addSystem(update, undefined, 'client:objective')
}
