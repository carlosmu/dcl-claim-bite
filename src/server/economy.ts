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
// Purses are persisted per player (./persistence). The one rule that keeps them safe across
// restarts: a purse is never created unless storage CONFIRMS the player is new. A failed read
// is retried, never mistaken for a first visit — or the next flush would save an empty purse
// over the real one.

import { AvatarBase, engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { MARKET_ENTITY_ENUM_ID, OreMarket } from '../shared/net/market-sync'
import { MULE_YARD_ENTITY_ENUM_ID, MULE_YARD_MAX_SLOTS, MuleYard } from '../shared/net/mule-yard-sync'
import { room } from '../shared/net/protocol'
import { applySale, getRate, getSettledRate, oreForCoins, quoteSale, restoreRate, tickMarket } from '../shared/state/market'
import { loadMarketPrice, loadPurse, savePurse, saveMarketPrice } from './persistence'
import {
  BOOM_TOWN_ACTIVE_SECONDS,
  BOOM_TOWN_BONUS_PER_MINER,
  ORE_PER_ROCK,
  ROCK_TIME_TOLERANCE,
  SWING_SECONDS
} from '../shared/economy/constants'
import { DEBUG_ADD_COINS, DEBUG_ADD_ORE, DEBUG_MAX_COINS, DEBUG_RESET_PROGRESS } from '../shared/debug-flags'
import {
  activePick,
  bestHitsPerRock,
  carryCapacity,
  findItem,
  fuelOrder,
  muleCount,
  priceOf,
  ShopItem,
  ShopItemId,
  unavailableReason
} from '../shared/economy/catalogue'
import { addFuelGallons, fuelGallons, fuelHoursLeft, settleMule } from './mule'
import { TUTORIAL_ROCK_SEQS } from '../shared/net/rock-sync'
import { advanceRock, getRockSeqs, hasFinishedRock, isRock, isRockStarted, markFinished, otherFinishers } from './rock'

type Purse = {
  ore: number
  coins: number
  owned: Record<string, number>
  /** Ore the rigs dug that is not in storage yet, and when they were last settled. */
  muleOre: number
  muleAt: number
  /** Fuel left in the rigs, in rig-hours (see MuleState). */
  muleFuel: number
  /** The pick chosen in the inventory; see activePick for what happens when it is not owned. */
  equipped: string
}

const purses = new Map<string, Purse>()
let marketEntity = engine.RootEntity
let lastPublishedPrice = -1

/** How often presence is diffed. Once a second: arrivals can wait a beat, and this walks
 * every player entity, so it has no business running at frame rate. */
const PRESENCE_CHECK_PERIOD_SECONDS = 1

/** How often the dropped-rock report is printed, so a spammer cannot flood the log too. */
const ABUSE_REPORT_PERIOD_SECONDS = 5

/**
 * How often idle rigs are settled for players who are here.
 *
 * The rig pays a whole ore a minute, so anything under that is wasted work — twenty seconds
 * is frequent enough that the number on the panel never looks stuck while someone watches it.
 * Players who are away are settled on arrival instead, from the stored timestamp.
 */
const MULE_SETTLE_PERIOD_SECONDS = 20

let sinceLastMuleSettle = 0

// Seconds since the server started, accumulated from the frame delta rather than read off
// the wall clock: it only ever needs to measure gaps, and a monotonic count cannot be
// disturbed by the host's clock moving.
let serverClock = 0

/** How often pending changes are written out. Saving on every swing would be a round trip
 * per 0.8s per player; batching turns that into one write per player per flush. */
const SAVE_PERIOD_SECONDS = 5

// Addresses whose purse is on its way from storage. A purse is only put in `purses` once it
// has actually been read, so "present in the map" means "safe to spend from".
const loading = new Set<string>()

/** Purses changed since the last flush. */
const dirty = new Set<string>()

let marketDirty = false
let sinceLastSave = 0

/** How long to wait before asking storage again after a read failed. */
const LOAD_RETRY_SECONDS = 5

/** When each failed purse read may be tried again, on the server clock. */
const loadRetryAt = new Map<string, number>()

// The price is only written once the stored one has been read (or confirmed absent), so a
// failed read on start can never overwrite the town's real price with the default.
let marketLoaded = false
let marketLoading = false
let marketRetryAt = 0

const lastRockAt = new Map<string, number>()

/**
 * Each player's last hit: when, and on which rock. The boom-town bonus counts the others whose
 * last hit is recent and on the same rock. TBD: like rockDone, a client could report
 * swings it never made.
 */
const lastSwing = new Map<string, { at: number; seq: number }>()

/** Other players mining the rock `seq` right now who have not finished it yet. */
function otherMinersOnRock(address: string, seq: number): number {
  let count = 0
  for (const [other, swing] of lastSwing) {
    if (other === address || hasFinishedRock(other, seq)) continue
    if (swing.seq === seq && serverClock - swing.at <= BOOM_TOWN_ACTIVE_SECONDS) count += 1
  }
  return count
}

/**
 * Moves each rock once it is spent: someone has finished it and nobody is still working on it.
 * Runs every frame as well as on each finished bar, so a companion who walks off mid-bar does
 * not leave a rock stuck for the ones already done.
 */
function moveSpentRocks(): void {
  for (const seq of getRockSeqs()) {
    if (isRockStarted(seq) && otherMinersOnRock('', seq) === 0) advanceRock(seq)
  }
}
const droppedRocks = new Map<string, number>()
let sinceLastAbuseReport = 0

/**
 * Starts reading a purse from storage, once.
 *
 * Nothing is put in `purses` until the read comes back, which is the whole safety property
 * here: an empty purse is never invented for someone who has played before, so a slow read
 * can never be mistaken for a fresh player and then saved over their real balance.
 */
function beginLoad(address: string): void {
  if (purses.has(address) || loading.has(address)) return
  if (serverClock < (loadRetryAt.get(address) ?? 0)) return
  loading.add(address)
  loadRetryAt.delete(address)

  loadPurse(address)
    .then((stored) => {
      loading.delete(address)
      const purse: Purse = {
        ore: stored?.ore ?? 0,
        coins: stored?.coins ?? 0,
        owned: stored?.owned ?? {},
        muleOre: stored?.muleOre ?? 0,
        muleAt: stored?.muleAt ?? 0,
        muleFuel: stored?.muleFuel ?? 0,
        equipped: stored?.equipped ?? ''
      }
      const owned = (id: ShopItemId) => purse.owned[id] ?? 0

      // A rig bought before fuel existed has never been filled. It gets the day every new
      // rig comes with, so the update does not greet its owner with a stalled rig.
      if (stored !== null && stored.muleFuel === undefined) addFuelGallons(purse, muleCount(owned), muleCount(owned))

      // Settled the moment it is read, so the wallet the player is about to be shown already
      // includes everything the rigs dug while they were away.
      settleMule(purse, muleCount(owned), carryCapacity(owned))
      purses.set(address, purse)
      dirty.add(address)
      sendWallet(address)
      console.log(`[Server] purse ${stored === null ? 'created for' : 'restored for'} ${address}`)
    })
    .catch((error) => {
      // Nothing is put in `purses`: the player waits, and the presence check tries again.
      loading.delete(address)
      loadRetryAt.set(address, serverClock + LOAD_RETRY_SECONDS)
      console.log(`[Server] purse load failed for ${address}, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

/** The player's purse, or null while it is still being read. */
function purseOf(address: string): Purse | null {
  const purse = purses.get(address)
  if (purse !== undefined) return purse
  beginLoad(address)
  return null
}

/** Serialises the inventory as the `id:count` pairs the wallet message carries. */
function encodeOwned(purse: Purse): string {
  return Object.keys(purse.owned)
    .map((id) => `${id}:${purse.owned[id]}`)
    .join(',')
}

/**
 * Tells one player what they now hold. Nobody else is told.
 *
 * Reads the map directly instead of going through purseOf: this must never be the thing
 * that triggers a load, or a message sent mid-load would race the read it started.
 */
function sendWallet(address: string): void {
  const purse = purses.get(address)
  if (purse === undefined) return

  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  room.send(
    'wallet',
    {
      ore: purse.ore,
      coins: purse.coins,
      owned: encodeOwned(purse),
      capacity: carryCapacity(owned),
      hitsPerRock: activePick(owned, purse.equipped)?.hitsPerRock ?? 0,
      equipped: activePick(owned, purse.equipped)?.id ?? '',
      mules: muleCount(owned),
      muleFuelHours: fuelHoursLeft(purse, muleCount(owned))
    },
    { to: [address] }
  )
}

function sendResult(address: string, action: string, ok: boolean, detail: string): void {
  room.send('actionResult', { action, ok, detail }, { to: [address] })
}

/** Which of the mayor's practice rocks each player has been paid for this visit. Cleared by a
 * debug reset. */
const tutorialPaid = new Map<string, Set<number>>()

function handleRockDone(address: string, seq: number): void {
  const purse = purseOf(address)
  // Still loading: the rock is dropped rather than paid into a purse that is about to be
  // replaced. The window is a fraction of a second, right after arriving.
  if (purse === null) return

  // How many hits a rock takes comes from the pick in use, chosen only among picks the player
  // OWNS, which is server state — so the tier cannot be claimed by a client, only earned.
  // No pick, no rock.
  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  const hits = activePick(owned, purse.equipped)?.hitsPerRock ?? 0
  if (hits <= 0) return

  // Each rock pays each player once. The client hides a rock it has finished, so this is only
  // reached by a modified client or a message racing a move — as is a rock that is not there.
  // A practice rock is nobody else's, and pays once.
  const tutorial = TUTORIAL_ROCK_SEQS.includes(seq)
  if (tutorial ? tutorialPaid.get(address)?.has(seq) : !isRock(seq) || hasFinishedRock(address, seq)) return

  // Dropped silently: an honest client cannot finish a rock faster than its swings allow, and
  // answering would hand a spammer a reply for every message they send.
  const last = lastRockAt.get(address)
  if (last !== undefined && serverClock - last < hits * SWING_SECONDS * ROCK_TIME_TOLERANCE) {
    droppedRocks.set(address, (droppedRocks.get(address) ?? 0) + 1)
    return
  }
  lastRockAt.set(address, serverClock)

  // The boom-town bonus: +1 per other player on this rock — still mining it, or already done
  // with it. Counting the ones done is what gives the last of a group the same bonus as the
  // first: three together pay 7 each, whoever finishes when.
  const others = tutorial ? 0 : otherMinersOnRock(address, seq) + otherFinishers(address, seq)
  if (tutorial) tutorialPaid.set(address, (tutorialPaid.get(address) ?? new Set<number>()).add(seq))
  else markFinished(address, seq)
  lastSwing.delete(address)

  // Once everyone on it is done, the rock moves; until then it waits for the rest.
  moveSpentRocks()

  // The bag is the ceiling. What does not fit is lost: the client stops swinging at capacity,
  // so reaching this means a rock slipped through.
  const space = Math.max(0, carryCapacity(owned) - purse.ore)
  const bonus = others * BOOM_TOWN_BONUS_PER_MINER
  const paid = Math.min(ORE_PER_ROCK + bonus, space)
  purse.ore += paid

  dirty.add(address)
  sendWallet(address)
  room.send('rockPaid', { ore: paid, bonus: Math.max(0, paid - ORE_PER_ROCK) }, { to: [address] })
}

function handleSell(address: string, requested: number): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'sell', false, 'still loading')
    return
  }

  // Never trust the amount: the client can ask to sell more than it has, or a fraction, or
  // a negative. Clamp to what the purse actually holds before anything is priced.
  const amount = Math.max(0, Math.min(Math.floor(requested), purse.ore))
  if (amount <= 0) {
    sendResult(address, 'sell', false, 'nothing to sell')
    return
  }

  const payout = quoteSale(amount) // priced before the sale moves the market

  // A sale that rounds down to nothing is refused rather than served: the payout floors, so
  // serving it would swallow the ore and hand back zero coins: less ore than the rate.
  if (payout <= 0) {
    sendResult(address, 'sell', false, 'too little ore to make a coin')
    return
  }

  // Only the ore that actually bought those coins is taken; the remainder stays in the bag
  // rather than being burned by the rounding.
  const spent = Math.min(amount, oreForCoins(getRate(), payout))
  // The rigs are settled on both sides of the sale: before, so the time they sat paused on a
  // full storage is not paid at the new room; after, so ore waiting on them fills the room now.
  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  settleMule(purse, muleCount(owned), carryCapacity(owned))
  purse.ore -= spent
  purse.coins += payout
  settleMule(purse, muleCount(owned), carryCapacity(owned))
  applySale(spent)
  dirty.add(address)
  marketDirty = true

  sendWallet(address)
  sendResult(address, 'sell', true, `${spent} ore for ${payout} coins`)
  console.log(`[Server] ${address} sold ${spent} ore for ${payout} · rate now ${getRate().toFixed(2)} ore/coin`)
}

function handleBuy(address: string, itemId: string): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'buy', false, 'still loading')
    return
  }

  const item = findItem(itemId as ShopItemId)
  if (item === null) {
    sendResult(address, 'buy', false, 'no such item')
    return
  }

  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  if (item.line === 'fuel') {
    buyFuel(address, purse, item)
    return
  }
  const price = priceOf(item, owned)
  if (price === null) {
    sendResult(address, 'buy', false, unavailableReason(item, owned) ?? 'not for sale')
    return
  }

  if (purse.coins < price) {
    sendResult(address, 'buy', false, `needs ${price - purse.coins} more coins`)
    return
  }

  // Pay out the hours worked with the current rigs, fuel and storage before any of them changes.
  const mules = muleCount(owned)
  settleMule(purse, mules, carryCapacity(owned))

  purse.coins -= price
  purse.owned[item.id] = (purse.owned[item.id] ?? 0) + 1
  // The first rig comes with a gallon, a day of running; later ones share what is in the tank.
  if (item.id === 'mule' && mules === 0) addFuelGallons(purse, 1, 1)
  // A pick just bought goes straight into the hand; the inventory can swap it back.
  if (item.hitsPerRock !== undefined) purse.equipped = item.id
  dirty.add(address)

  sendWallet(address)
  sendResult(address, 'buy', true, item.id)
  console.log(`[Server] ${address} bought ${item.label} for ${price} · balance ${purse.coins}`)
}

// Fuel goes into the rigs, not the inventory, and its price depends on what is already in the
// tank, so it is bought on its own path.
function buyFuel(address: string, purse: Purse, item: ShopItem): void {
  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  const mules = muleCount(owned)
  // Settled first, so the order is priced against what is really left in the tank.
  settleMule(purse, mules, carryCapacity(owned))

  const order = fuelOrder(item, mules, fuelGallons(purse))
  if ('reason' in order) {
    sendResult(address, 'buy', false, order.reason)
    return
  }
  if (purse.coins < order.price) {
    sendResult(address, 'buy', false, `needs ${order.price - purse.coins} more coins`)
    return
  }
  if (!addFuelGallons(purse, mules, order.gallons)) {
    sendResult(address, 'buy', false, 'Tank full')
    return
  }
  purse.coins -= order.price
  dirty.add(address)

  sendWallet(address)
  sendResult(address, 'buy', true, item.id)
  console.log(`[Server] ${address} bought ${order.gallons.toFixed(1)} gallons for ${order.price} · balance ${purse.coins}`)
}

function handleEquip(address: string, itemId: string): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'equip', false, 'still loading')
    return
  }

  const item = findItem(itemId as ShopItemId)
  if (item === null || item.hitsPerRock === undefined) {
    sendResult(address, 'equip', false, 'not a pick')
    return
  }
  if ((purse.owned[item.id] ?? 0) <= 0) {
    sendResult(address, 'equip', false, 'not owned')
    return
  }

  purse.equipped = item.id
  dirty.add(address)
  sendWallet(address)
  sendResult(address, 'equip', true, item.id)
}

// The mayor's pick: free, and only for someone who has none — so it can be asked for again after
// losing one, but never stacked. The anti-soft-lock of design/balance.md §2.
function handleClaimPick(address: string): void {
  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'claimPick', false, 'still loading')
    return
  }

  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  if (bestHitsPerRock(owned) > 0) {
    sendResult(address, 'claimPick', false, 'already has a pick')
    return
  }

  purse.owned['pick'] = 1
  dirty.add(address)
  sendWallet(address)
  sendResult(address, 'claimPick', true, 'pick')
  console.log(`[Server] the mayor handed a pick to ${address}`)
}

// DEBUG: coins out of nothing, for testing purchases without playing up to them. They skip the
// bank, so the market never hears about them — but nothing else in the economy is protected.
function handleDebugCoins(address: string, requested: number): void {
  if (!DEBUG_ADD_COINS) {
    sendResult(address, 'debugCoins', false, 'debug tools are off')
    return
  }

  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'debugCoins', false, 'still loading')
    return
  }

  const amount = Math.max(0, Math.min(Math.floor(requested), DEBUG_MAX_COINS))
  if (amount <= 0 || Number.isNaN(amount)) {
    sendResult(address, 'debugCoins', false, 'nothing to add')
    return
  }

  purse.coins += amount
  dirty.add(address)
  sendWallet(address)
  sendResult(address, 'debugCoins', true, `+${amount} coins`)
  console.log(`[Server] DEBUG granted ${amount} coins to ${address} · balance ${purse.coins}`)
}

// DEBUG: ore out of nothing, for testing the bank without mining. It lands in the bag like
// mined ore would, so the bag's capacity still holds; whatever does not fit is not granted.
function handleDebugOre(address: string, requested: number): void {
  if (!DEBUG_ADD_ORE) {
    sendResult(address, 'debugOre', false, 'debug tools are off')
    return
  }

  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'debugOre', false, 'still loading')
    return
  }

  const owned = (id: ShopItemId) => purse.owned[id] ?? 0
  const space = Math.max(0, carryCapacity(owned) - purse.ore)
  const amount = Math.max(0, Math.min(Math.floor(requested), space))
  if (amount <= 0 || Number.isNaN(amount)) {
    sendResult(address, 'debugOre', false, space <= 0 ? 'bag full' : 'nothing to add')
    return
  }

  purse.ore += amount
  dirty.add(address)
  sendWallet(address)
  sendResult(address, 'debugOre', true, `+${amount} ore`)
  console.log(`[Server] DEBUG granted ${amount} ore to ${address} · bag ${purse.ore}`)
}

// DEBUG: back to a first visit. The purse is emptied in place rather than replaced, so nothing
// holding it sees a stale copy, and it is saved like any other change.
function handleDebugReset(address: string): void {
  if (!DEBUG_RESET_PROGRESS) {
    sendResult(address, 'debugReset', false, 'debug tools are off')
    return
  }

  const purse = purseOf(address)
  if (purse === null) {
    sendResult(address, 'debugReset', false, 'still loading')
    return
  }

  purse.ore = 0
  purse.coins = 0
  purse.owned = {}
  purse.muleOre = 0
  purse.muleAt = 0
  purse.muleFuel = 0
  purse.equipped = ''
  lastRockAt.delete(address)
  lastSwing.delete(address)
  tutorialPaid.delete(address)

  dirty.add(address)
  sendWallet(address)
  sendResult(address, 'debugReset', true, 'progress wiped')
  console.log(`[Server] DEBUG wiped the progress of ${address}`)
}

// Who is in the scene right now. There is no join or leave message, so presence is read off
// the player entities and diffed against the last look.
//
// Tracking departures is not bookkeeping for its own sake: a player who leaves and comes back
// arrives with an empty client mirror, so unless their address is forgotten on the way out
// they are never greeted again and sit looking at 0 ore while the server still holds their
// purse. Arrivals alone are not enough.
const present = new Set<string>()

let sinceLastPresenceCheck = 0

function checkPresence(dt: number) {
  sinceLastPresenceCheck += dt
  if (sinceLastPresenceCheck < PRESENCE_CHECK_PERIOD_SECONDS) return
  sinceLastPresenceCheck = 0

  const here = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address !== '') here.add(identity.address)
  }

  for (const address of here) {
    // A purse whose read failed is asked for again (beginLoad waits out the retry delay).
    if (present.has(address)) {
      if (!purses.has(address)) beginLoad(address)
      continue
    }
    present.add(address)
    // The wallet message is sent by the load itself, once there is something true to send.
    beginLoad(address)
    if (purses.has(address)) sendWallet(address)
  }

  for (const address of present) {
    if (here.has(address)) continue
    present.delete(address)
    // The purse stays in `purses` — only the greeting is forgotten, so the next arrival is
    // treated as new and gets told what it holds.
    lastRockAt.delete(address)
    // Written out now rather than at the next flush: leaving is exactly when a player is
    // most likely to not come back before the server stops.
    flushPurse(address)
    console.log(`[Server] ${address} left`)
  }
}

function flushPurse(address: string): void {
  const purse = purses.get(address)
  if (purse === undefined || !dirty.has(address)) return
  dirty.delete(address)
  const saved = savePurse(address, {
    ore: purse.ore,
    coins: purse.coins,
    owned: purse.owned,
    muleOre: purse.muleOre,
    muleAt: purse.muleAt,
    muleFuel: purse.muleFuel,
    equipped: purse.equipped
  })
  // A failed write puts the purse back in the queue for the next flush rather than losing it.
  saved
    .then((ok) => {
      if (!ok) dirty.add(address)
    })
    .catch(() => dirty.add(address))
}

function flushSaves(dt: number) {
  sinceLastSave += dt
  if (sinceLastSave < SAVE_PERIOD_SECONDS) return
  sinceLastSave = 0

  for (const address of [...dirty]) flushPurse(address)

  if (!marketLoaded) loadMarket()
  else if (marketDirty) {
    marketDirty = false
    saveMarketPrice(getSettledRate())
  }
}

// Only for players actually in the scene: an absent player's rig needs no attention, because
// its output is worked out from the timestamp the moment they come back.
function settlePresentMules(dt: number) {
  sinceLastMuleSettle += dt
  if (sinceLastMuleSettle < MULE_SETTLE_PERIOD_SECONDS) return
  sinceLastMuleSettle = 0

  for (const address of present) {
    const purse = purses.get(address)
    if (purse === undefined || (purse.owned['mule'] ?? 0) <= 0) continue

    const owned = (id: ShopItemId) => purse.owned[id] ?? 0
    const mules = muleCount(owned)
    const before = purse.ore
    const hoursBefore = Math.ceil(fuelHoursLeft(purse, mules))
    settleMule(purse, mules, carryCapacity(owned))
    if (purse.ore === before && Math.ceil(fuelHoursLeft(purse, mules)) === hoursBefore) continue

    dirty.add(address)
    sendWallet(address)
  }
}

// --- Mule yard ---------------------------------------------------------------------------
//
// Every rig owner who is here gets a spot in the yard grid. A spot is kept for the address
// while the server runs, so someone who steps out and back finds their rig where they left it
// (unless the yard filled up meanwhile).

let yardEntity = engine.RootEntity
const yardSlots = new Map<string, number>()
let lastPublishedYard = ''
let sinceLastYardPublish = 0

/** The display name the player's avatar carries, or a short address while it has none. */
function displayNameOf(address: string): string {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address !== address) continue
    const name = AvatarBase.getOrNull(entity)?.name ?? ''
    if (name !== '') return name
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function slotFor(address: string): number {
  const kept = yardSlots.get(address)
  if (kept !== undefined) return kept
  const taken = new Set(yardSlots.values())
  for (let slot = 0; slot < MULE_YARD_MAX_SLOTS; slot++) {
    if (taken.has(slot)) continue
    yardSlots.set(address, slot)
    return slot
  }
  return -1
}

function publishYard(dt: number) {
  sinceLastYardPublish += dt
  if (sinceLastYardPublish < PRESENCE_CHECK_PERIOD_SECONDS) return
  sinceLastYardPublish = 0

  const mules: { slot: number; address: string; name: string; level: number }[] = []
  for (const address of present) {
    const purse = purses.get(address)
    if (purse === undefined) continue
    const level = muleCount((id) => purse.owned[id] ?? 0)
    if (level <= 0) continue
    const slot = slotFor(address)
    if (slot < 0) continue
    mules.push({ slot, address, name: displayNameOf(address), level })
  }
  mules.sort((a, b) => a.slot - b.slot)

  // Only on a real change: this runs every second and the yard rarely moves.
  const encoded = JSON.stringify(mules)
  if (encoded === lastPublishedYard) return
  lastPublishedYard = encoded
  MuleYard.getMutable(yardEntity).mules = mules
}

function advanceClock(dt: number) {
  serverClock += dt
}

// Rate limiting that nobody can see is rate limiting nobody can debug, so what was dropped
// gets said out loud — in one periodic line rather than one per drop.
function reportAbuse(dt: number) {
  sinceLastAbuseReport += dt
  if (sinceLastAbuseReport < ABUSE_REPORT_PERIOD_SECONDS) return
  sinceLastAbuseReport = 0
  if (droppedRocks.size === 0) return

  for (const [address, count] of droppedRocks) {
    console.log(`[Server] dropped ${count} too-fast rock(s) from ${address}`)
  }
  droppedRocks.clear()
}

function publishRate(dt: number) {
  tickMarket(dt)

  // Only on a real change, and only to two decimals: syncing an unchanged rate every frame
  // would be 30 writes a second of noise.
  const rate = Math.round(getRate() * 100) / 100
  if (rate === lastPublishedPrice) return
  lastPublishedPrice = rate
  marketDirty = true
  OreMarket.getMutable(marketEntity).price = rate
}

// The price is restored rather than reset so a restart does not quietly hand the town a
// fresh market. It also keeps balance playtests honest: a floored price stays floored.
function loadMarket(): void {
  if (marketLoaded || marketLoading || serverClock < marketRetryAt) return
  marketLoading = true
  loadMarketPrice()
    .then((stored) => {
      marketLoading = false
      marketLoaded = true
      if (stored === null) return
      restoreRate(stored)
      console.log(`[Server] rate restored at ${getSettledRate().toFixed(2)} ore per coin`)
    })
    .catch((error) => {
      marketLoading = false
      marketRetryAt = serverClock + LOAD_RETRY_SECONDS
      console.log(`[Server] market price restore failed, retrying in ${LOAD_RETRY_SECONDS}s: ${error}`)
    })
}

export function setupEconomy(): void {
  loadMarket()

  marketEntity = engine.addEntity()
  OreMarket.create(marketEntity, { price: getRate() })
  syncEntity(marketEntity, [OreMarket.componentId], MARKET_ENTITY_ENUM_ID)

  yardEntity = engine.addEntity()
  MuleYard.create(yardEntity, { mules: [] })
  syncEntity(yardEntity, [MuleYard.componentId], MULE_YARD_ENTITY_ENUM_ID)

  room.onMessage('hello', (_data, context) => {
    if (!context) return
    // purseOf starts the read if it has not happened yet; the load's own completion sends the
    // wallet in that case, so this only sends when there is already something true to send.
    if (purseOf(context.from) !== null) sendWallet(context.from)
  })

  room.onMessage('claimPick', (_data, context) => {
    if (!context) return
    handleClaimPick(context.from)
  })

  room.onMessage('debugCoins', (data, context) => {
    if (!context) return
    handleDebugCoins(context.from, data.amount)
  })

  room.onMessage('debugOre', (data, context) => {
    if (!context) return
    handleDebugOre(context.from, data.amount)
  })

  room.onMessage('debugReset', (_data, context) => {
    if (!context) return
    handleDebugReset(context.from)
  })

  room.onMessage('rockDone', (data, context) => {
    if (!context) return
    handleRockDone(context.from, data.seq)
  })

  room.onMessage('swing', (data, context) => {
    if (!context) return
    lastSwing.set(context.from, { at: serverClock, seq: data.seq })
  })

  room.onMessage('sell', (data, context) => {
    if (!context) return
    handleSell(context.from, data.amount)
  })

  room.onMessage('buy', (data, context) => {
    if (!context) return
    handleBuy(context.from, data.itemId)
  })

  room.onMessage('equip', (data, context) => {
    if (!context) return
    handleEquip(context.from, data.itemId)
  })

  // The clock goes first so everything scheduled after it reads the current frame's time.
  engine.addSystem(advanceClock, undefined, 'server:clock')
  engine.addSystem(publishRate, undefined, 'server:market-rate')
  engine.addSystem(reportAbuse, undefined, 'server:abuse-report')
  engine.addSystem(flushSaves, undefined, 'server:save')
  engine.addSystem(settlePresentMules, undefined, 'server:mule-settle')
  engine.addSystem(checkPresence, undefined, 'server:presence')
  engine.addSystem(publishYard, undefined, 'server:mule-yard')
  engine.addSystem(moveSpentRocks, undefined, 'server:rock-move')
}
