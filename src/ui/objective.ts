// The objective tracker: the few things the player should know or do next.
//
// Not a history. Every frame the game state is read and every entry that applies is a candidate.
// Up to OBJECTIVE_SLOTS of them stack on screen, in the order they appeared (the first on top);
// an entry leaves when it no longer applies (done, or its moment passed) or the player closes it,
// and the next candidate takes the free slot. Alerts (something stopped, something is full)
// outrank objectives (what to do next) for a free slot, so a full storage is never left waiting
// behind "buy an upgrade".
//
// It only informs. Nothing here opens a panel or moves the player: the bank, the store and the
// rig are still walked to.

import { engine } from '@dcl/sdk/ecs'
import { isMobile } from '@dcl/sdk/platform'

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
import { getNoteNews } from '../land-office/owner-card'
import { getMiningStatus } from '../mining/rocks'

/** The Social Bonus note's title, which the tracker paints in the bonus's own green. */
export const SOCIAL_BONUS_TITLE = 'SOCIAL BONUS'

export type Objective = {
  /** Which entry this is, steady while its lines change: what closing and stacking go by. */
  id: string
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

/** How long the news of a note left at the player's door stays up. */
const NOTE_ALERT_SECONDS = 8

/**
 * How long the Social Bonus note stays up once two or more are mining, or their number changes.
 * Not for as long as the crowd lasts: it would sit on top of the upgrade alerts the whole time.
 */
const SOCIAL_ALERT_SECONDS = 24

let clock = 0
let lastRate = -1
let priceAlertUntil = 0
let lastMiners = 0
let lastBrokenCount = 0
let pickBrokenUntil = 0
let socialAlertUntil = 0
/** Whether the Social Bonus has been explained yet, on the player's first real rock. */
let socialIntroShown = false
let lastNoteNews = 0
let noteAlertUntil = 0
/** What is on screen, in the order it appeared: the first is the top one. */
let shown: Objective[] = []
/** Entries the player closed, by id, with the line they closed. They stay closed until they stop
 *  applying or their line changes (a new price is news again). */
const dismissed = new Map<string, string>()

/** How many entries stack on screen at once: fewer on mobile, where the screen is shorter. */
const OBJECTIVE_SLOTS = 4
const OBJECTIVE_SLOTS_MOBILE = 3

/** One message the tracker showed, and when (seconds on this client's clock). */
export type PastObjective = Objective & { at: number }

/** How many past messages the notifications screen keeps. */
const HISTORY_LENGTH = 5

/** The tracker's recent messages, newest first. */
let history: PastObjective[] = []

/** What the tracker shows right now, top first; empty to hide it. */
export function getObjectives(): readonly Objective[] {
  return shown
}

/** The player closed an entry: it goes now and stays gone while the same line still applies. */
export function dismissObjective(id: string): void {
  const entry = shown.find((objective) => objective.id === id)
  if (entry === undefined) return
  dismissed.set(id, entry.message)
  shown = shown.filter((objective) => objective.id !== id)
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

// Logged when an entry comes on screen or its line changes. The detail does not count: it
// carries running numbers (ore so far, hours left) that would log the same message every tick.
function record(objective: Objective): void {
  history = [{ ...objective, at: clock }, ...history].slice(0, HISTORY_LENGTH)
}

function alert(id: string, title: string, message: string, detail: string = ''): Objective {
  return { id, title, message, detail, progress: null, alert: true }
}

function goal(id: string, message: string, detail: string = '', progress: number | null = null): Objective {
  return { id, title: 'OBJECTIVE', message, detail, progress, alert: false }
}

function fuelGallons(): number {
  return (getMuleFuelHours() * getMuleCount()) / 24
}

/** Every entry that applies right now, most pressing first. */
function candidates(): Objective[] {
  const list: Objective[] = []
  const ore = getOre()
  const capacity = getCarryCapacity()
  const mules = getMuleCount()
  const rate = quotedRate(getSyncedRate())

  // A pick just wore out. Said even when another pick took over, so the switch is not a mystery.
  if (clock < pickBrokenUntil) {
    const broken = findItem(getBrokenPick().id as ShopItemId)
    const next = getHitsPerRock() > 0 ? 'Using your next best pick' : 'The Mayor has a free one for you'
    list.push(alert('pick-broken', 'PICK BROKEN', `${broken?.label ?? 'Your pick'} is worn out`, next))
  }

  // Somebody left a note at the door, while the player was here or away.
  if (clock < noteAlertUntil) {
    const news = getNoteNews()
    const message = news.waiting === 1 ? `${news.from} left you a note` : `${news.waiting} notes at your door`
    list.push(alert('note', 'NEW NOTE', message, 'Click your property to read them'))
  }

  // Nothing to mine with: the mayor is the whole first step.
  const hasPick = getHitsPerRock() > 0
  if (!hasPick) list.push(goal('talk-mayor', 'Talk to the Mayor', 'He has a free pick for you'))

  const full = capacity > 0 && ore >= capacity
  if (full) list.push(alert('storage-full', 'STORAGE FULL', 'Sell ore at the Bank', `${ore} ore ready`))

  if (mules > 0 && getMuleFuelHours() <= 0) list.push(alert('mule-stopped', 'M.U.L.E. STOPPED', 'Out of fuel', 'Buy fuel at the Store'))

  const tank = fuelTankGallons(mules)
  const gallons = fuelGallons()
  if (mules > 0 && tank > 0 && gallons > 0 && gallons / tank < FUEL_LOW_SHARE) {
    list.push(alert('fuel-low', 'FUEL LOW', 'Refuel at the Store', `${Math.ceil(getMuleFuelHours())}h left`))
  }

  // How the bonus works, while it is news: the crowd's bonus when two or more are mining, or
  // what it is on the first rock of someone mining alone.
  const miners = getActiveMiners()
  if (clock < socialAlertUntil) {
    if (miners >= 2) list.push(alert('social', SOCIAL_BONUS_TITLE, `${miners} miners: +${socialBonus(miners)} ore per rock`, 'More miners, more ore · up to +10 at 4'))
    else list.push(alert('social', SOCIAL_BONUS_TITLE, 'Mine at the same time as others', `+${socialBonus(2)} ore with 2 · +${socialBonus(3)} with 3 · +${socialBonus(4)} with 4`))
  }

  // Only news to someone with enough ore to make a sale.
  if (clock < priceAlertUntil && ore >= rate) {
    const good = Math.round(rate * 10) <= PRICE_GOOD_MAX_TENTHS
    list.push(alert('price', 'ORE PRICE CHANGED', `Now ${rate.toFixed(1)} ore / coin`, good ? 'Good time to sell' : ''))
  }

  const nextPick = nextTier('pick', (id) => getOwned(id))
  if (nextPick !== null && canBuy(nextPick)) {
    list.push(alert('upgrade-pick', 'UPGRADE AVAILABLE', `${nextPick.label} at the Store`, `${currentPrice(nextPick)} coins`))
  }
  const mule = findItem('mule')
  if (mules <= 0 && mule !== null && canBuy(mule)) {
    list.push(alert('upgrade-mule', 'UPGRADE AVAILABLE', 'M.U.L.E. at the Store', `${currentPrice(mule)} coins`))
  }

  // Onboarding: a first-pick miner who has not sold yet. Not before the pick, and the sale not
  // twice when STORAGE FULL already says it.
  const beginner = hasPick && getCoins() === 0 && getOwned('steel-pick') <= 0 && mules <= 0
  if (beginner && ore < FIRST_ORE_GOAL) {
    list.push(goal('first-ore', `Mine ${FIRST_ORE_GOAL} ore at the rocks`, `${ore}/${FIRST_ORE_GOAL}`, ore / FIRST_ORE_GOAL))
  }
  if (beginner && !full && ore >= rate) list.push(goal('first-sell', 'Sell your ore at the Bank', `${ore} ore ready`))

  return list
}

// The shown entries keep their places and take the fresh numbers; the ones that no longer apply
// go; free slots fill from the candidates, most pressing first.
function restack(): void {
  const live = candidates()
  const byId = new Map(live.map((objective) => [objective.id, objective]))

  // A closed entry that stopped applying, or says something new, may come back.
  for (const [id, message] of dismissed) {
    const now = byId.get(id)
    if (now === undefined || now.message !== message) dismissed.delete(id)
  }

  const next: Objective[] = []
  for (const old of shown) {
    const now = byId.get(old.id)
    if (now === undefined || dismissed.has(old.id)) continue
    if (now.title !== old.title || now.message !== old.message) record(now)
    next.push(now)
  }
  const slots = isMobile() ? OBJECTIVE_SLOTS_MOBILE : OBJECTIVE_SLOTS
  for (const objective of live) {
    if (next.length >= slots) break
    if (dismissed.has(objective.id) || next.some((entry) => entry.id === objective.id)) continue
    record(objective)
    next.push(objective)
  }
  shown = next
}

function update(dt: number): void {
  clock += dt
  // Before the purse arrives every figure is a placeholder: an empty tank that is not empty.
  if (!hasWallet()) {
    shown = []
    return
  }

  const rate = quotedRate(getSyncedRate())
  if (lastRate >= 0 && rate !== lastRate) priceAlertUntil = clock + PRICE_ALERT_SECONDS
  lastRate = rate

  const broken = getBrokenPick().count
  if (broken !== lastBrokenCount) pickBrokenUntil = clock + PICK_BROKEN_SECONDS
  lastBrokenCount = broken

  const notes = getNoteNews().count
  if (notes !== lastNoteNews) noteAlertUntil = clock + NOTE_ALERT_SECONDS
  lastNoteNews = notes

  const miners = getActiveMiners()
  if (miners >= 2 && miners !== lastMiners) socialAlertUntil = clock + SOCIAL_ALERT_SECONDS
  lastMiners = miners

  const mining = getMiningStatus()
  if (!socialIntroShown && mining !== null && !mining.practice && mining.blocked === '') {
    socialIntroShown = true
    socialAlertUntil = clock + SOCIAL_ALERT_SECONDS
  }

  restack()
}

export function setupObjective(): void {
  engine.addSystem(update, undefined, 'client:objective')
}
