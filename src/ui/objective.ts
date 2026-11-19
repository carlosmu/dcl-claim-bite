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

import { isCasinoPanelOpen } from '../casino/casino'
import { canBuy, currentPrice } from '../shop/shop'
import {
  getCarryCapacity,
  getHitsPerRock,
  getMuleCount,
  getMuleFuelHours,
  getSyncedRate,
  getBrokenPick,
  getMuleAway,
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
import { itemName, t } from '../i18n'
import { isPlaying } from '../world/game-phase'
import { getCampaignStatus } from '../net/campaign-link'
import { DEBUG_SHOW_ALL_NOTIFICATIONS } from '../shared/debug-flags'

/** The Social Bonus note's id: the tracker paints its title in the bonus's own green. */
export const SOCIAL_BONUS_ID = 'social'

/** The news of what the rigs dug while the player was away: the tracker paints it light blue. */
export const MULE_AWAY_ID = 'mule-away'

/** The Marketplace Credits campaign's entry. */
export const CREDITS_ID = 'credits'

/** "5h 20m", or "12m" under an hour: how long until the campaign's day 2 opens. */
function formatCountdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

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

/** How long the news of what the rigs dug while the player was away stays up. */
const MULE_AWAY_SECONDS = 60

/** How long the news of a note left at the player's door stays up. */
const NOTE_ALERT_SECONDS = 8

/**
 * How long the Social Bonus note stays up once two or more are mining, or their number changes.
 * Not for as long as the crowd lasts: it would sit on top of the upgrade alerts the whole time.
 */
const SOCIAL_ALERT_SECONDS = 24

/** Reaching each new multiple of this many coins suggests the casino. */
const CASINO_HINT_COINS = 100

/** How long the suggestion stays up. */
const CASINO_HINT_SECONDS = 10

let clock = 0
/** The highest multiple of CASINO_HINT_COINS reached this session, so that winning a hundred back
 *  after losing it says nothing new. Below zero until the purse arrives. */
let casinoHintReached = -1
let casinoHintUntil = 0
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
let lastMuleAway = 0
let muleAwayUntil = 0
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
  if (DEBUG_SHOW_ALL_NOTIFICATIONS) return debugSamples()
  return shown
}

/** One card of every kind, for DEBUG_SHOW_ALL_NOTIFICATIONS. */
function debugSamples(): Objective[] {
  return [
    goal('debug-goal', t('obj.mineFirstOre', { goal: FIRST_ORE_GOAL }), `4/${FIRST_ORE_GOAL}`, 4 / FIRST_ORE_GOAL),
    { id: MULE_AWAY_ID, title: t('obj.whileAway'), message: t('obj.muleDugOne', { ore: 120 }), detail: t('obj.addedToStorage'), progress: null, alert: false },
    alert('debug-alert', t('hud.storageFull'), t('obj.sellAtBank'), t('obj.oreReady', { ore: 50 })),
    alert(SOCIAL_BONUS_ID, t('obj.socialBonus'), t('obj.minersBonus', { miners: 3, bonus: socialBonus(3) }), t('obj.moreMiners')),
    { id: CREDITS_ID, title: t('obj.credits'), message: t('obj.creditsDay1', { goal: 50, credits: 10 }), detail: t('obj.creditsRocks', { rocks: 20, goal: 50 }), progress: 0.4, alert: false }
  ]
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

/** Entries that keep only their latest message in the history: they come back often (the price,
 * the Social Bonus, a storage that fills after every sale, an upgrade that comes and goes with the
 * coins) or their latest line already sums up the rest (the notes), and a run of them would push
 * the important ones off the list. */
const LATEST_ONLY_IN_HISTORY = new Set(['price', 'social', 'storage-full', 'upgrade-pick', 'upgrade-mule', 'note'])

// Logged when an entry comes on screen or its line changes. The detail does not count: it
// carries running numbers (ore so far, hours left) that would log the same message every tick.
function record(objective: Objective): void {
  const kept = LATEST_ONLY_IN_HISTORY.has(objective.id) ? history.filter((past) => past.id !== objective.id) : history
  history = [{ ...objective, at: clock }, ...kept].slice(0, HISTORY_LENGTH)
}

function alert(id: string, title: string, message: string, detail: string = ''): Objective {
  return { id, title, message, detail, progress: null, alert: true }
}

function goal(id: string, message: string, detail: string = '', progress: number | null = null): Objective {
  return { id, title: t('obj.objective'), message, detail, progress, alert: false }
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
    const next = getHitsPerRock() > 0 ? t('obj.nextBestPick') : t('obj.mayorHasOne')
    list.push(alert('pick-broken', t('obj.pickBroken'), t('obj.wornOut', { pick: itemName(broken, t('obj.yourPick')) }), next))
  }

  // What the rigs dug while the player was away: the moment it sinks in that their ore lands in
  // storage by itself, with nothing to collect. Good news, so the gold of an objective.
  if (clock < muleAwayUntil) {
    const away = getMuleAway()
    const message = mules === 1 ? t('obj.muleDugOne', { ore: away.ore }) : t('obj.muleDugMany', { ore: away.ore })
    list.push({ id: MULE_AWAY_ID, title: t('obj.whileAway'), message, detail: t('obj.addedToStorage'), progress: null, alert: false })
  }

  // Somebody left a note at the door, while the player was here or away.
  if (clock < noteAlertUntil) {
    const news = getNoteNews()
    const message = news.waiting === 1 ? t('obj.leftNote', { from: news.from }) : t('obj.notesAtDoor', { count: news.waiting })
    list.push(alert('note', t('obj.newNote'), message, t('obj.clickProperty')))
  }

  // Nothing to mine with: the mayor is the whole first step.
  const hasPick = getHitsPerRock() > 0
  if (!hasPick) list.push(goal('talk-mayor', t('obj.talkMayor'), t('obj.freePick')))

  const full = capacity > 0 && ore >= capacity
  if (full) list.push(alert('storage-full', t('hud.storageFull'), t('obj.sellAtBank'), t('obj.oreReady', { ore })))

  if (mules > 0 && getMuleFuelHours() <= 0) list.push(alert('mule-stopped', t('obj.muleStopped'), t('obj.outOfFuel'), t('obj.buyFuel')))

  const tank = fuelTankGallons(mules)
  const gallons = fuelGallons()
  if (mules > 0 && tank > 0 && gallons > 0 && gallons / tank < FUEL_LOW_SHARE) {
    list.push(alert('fuel-low', t('obj.fuelLow'), t('obj.refuel'), t('obj.hoursLeft', { n: Math.ceil(getMuleFuelHours()) })))
  }

  // The Marketplace Credits campaign, while it is open (net/campaign-link.ts). Not shown on its last
  // day to someone who has not reserved: day 2 would never come.
  const campaign = getCampaignStatus()
  if (campaign !== null && campaign.phase !== 'late' && campaign.phase !== 'off' && campaign.phase !== 'soon') {
    const { goal: rocksGoal, credits } = campaign
    const title = t('obj.credits')
    if (campaign.phase === 'day1' || campaign.phase === 'day2') {
      const message = campaign.phase === 'day1' ? t('obj.creditsDay1', { goal: rocksGoal, credits }) : t('obj.creditsDay2', { goal: rocksGoal, credits })
      list.push({ id: CREDITS_ID, title, message, detail: t('obj.creditsRocks', { rocks: campaign.rocks, goal: rocksGoal }), progress: campaign.rocks / rocksGoal, alert: false })
    } else if (campaign.phase === 'reserved') {
      const time = formatCountdown(campaign.nextDayAt - Date.now())
      list.push({ id: CREDITS_ID, title, message: t('obj.creditsReserved'), detail: t('obj.creditsNextDay', { time }), progress: null, alert: false })
    } else {
      list.push({ id: CREDITS_ID, title, message: t('obj.creditsClaimed', { credits }), detail: t('obj.creditsDelivery'), progress: null, alert: false })
    }
  }

  // How the bonus works, while it is news: the crowd's bonus when two or more are mining, or
  // what it is on the first rock of someone mining alone.
  const miners = getActiveMiners()
  if (clock < socialAlertUntil) {
    if (miners >= 2) list.push(alert(SOCIAL_BONUS_ID, t('obj.socialBonus'), t('obj.minersBonus', { miners, bonus: socialBonus(miners) }), t('obj.moreMiners')))
    else list.push(alert(SOCIAL_BONUS_ID, t('obj.socialBonus'), t('obj.mineTogether'), t('obj.bonusTable', { b2: socialBonus(2), b3: socialBonus(3), b4: socialBonus(4) })))
  }

  // Only news to someone with enough ore to make a sale.
  if (clock < priceAlertUntil && ore >= rate) {
    const good = Math.round(rate * 10) <= PRICE_GOOD_MAX_TENTHS
    list.push(alert('price', t('obj.priceChanged'), t('obj.priceNow', { rate: rate.toFixed(1) }), good ? t('obj.goodTimeToSell') : ''))
  }

  const nextPick = nextTier('pick', (id) => getOwned(id))
  if (nextPick !== null && canBuy(nextPick)) {
    list.push(alert('upgrade-pick', t('obj.upgradeAvailable'), t('obj.atStore', { item: itemName(nextPick) }), t('obj.coins', { coins: currentPrice(nextPick) ?? 0 })))
  }
  const mule = findItem('mule')
  if (mules <= 0 && mule !== null && canBuy(mule)) {
    list.push(alert('upgrade-mule', t('obj.upgradeAvailable'), t('obj.atStore', { item: itemName(mule) }), t('obj.coins', { coins: currentPrice(mule) ?? 0 })))
  }

  // Onboarding: a first-pick miner who has not sold yet. Not before the pick, and the sale not
  // twice when STORAGE FULL already says it.
  const beginner = hasPick && getCoins() === 0 && getOwned('steel-pick') <= 0 && mules <= 0
  if (beginner && ore < FIRST_ORE_GOAL) {
    list.push(goal('first-ore', t('obj.mineFirstOre', { goal: FIRST_ORE_GOAL }), `${ore}/${FIRST_ORE_GOAL}`, ore / FIRST_ORE_GOAL))
  }
  if (beginner && !full && ore >= rate) list.push(goal('first-sell', t('obj.sellYourOre'), t('obj.oreReady', { ore })))

  // Not to someone already at the machine.
  if (clock < casinoHintUntil && !isCasinoPanelOpen()) {
    list.push(goal('casino', t('obj.tryLuck'), t('obj.coins', { coins: getCoins() })))
  }

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
  // Nothing over the title card or the intro (world/game-phase.ts). The clock waits too, so news
  // that came in meanwhile (notes, what the rigs dug) is noticed, and shown in full, once play starts.
  if (!isPlaying()) {
    shown = []
    return
  }
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

  const muleAway = getMuleAway().count
  if (muleAway !== lastMuleAway) muleAwayUntil = clock + MULE_AWAY_SECONDS
  lastMuleAway = muleAway

  const miners = getActiveMiners()
  if (miners >= 2 && miners !== lastMiners) socialAlertUntil = clock + SOCIAL_ALERT_SECONDS
  lastMiners = miners

  const mining = getMiningStatus()
  if (!socialIntroShown && mining !== null && !mining.practice && mining.blocked === '') {
    socialIntroShown = true
    socialAlertUntil = clock + SOCIAL_ALERT_SECONDS
  }

  // The coins the player arrived with are not news: only a multiple reached from here on is.
  const hundreds = Math.floor(getCoins() / CASINO_HINT_COINS)
  if (casinoHintReached >= 0 && hundreds > casinoHintReached) casinoHintUntil = clock + CASINO_HINT_SECONDS
  casinoHintReached = Math.max(casinoHintReached, hundreds)

  restack()
}

export function setupObjective(): void {
  engine.addSystem(update, undefined, 'client:objective')
}
