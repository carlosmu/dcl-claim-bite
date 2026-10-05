// Notifications: short notes on what happened and where to go about it.
//
// They only inform. Nothing here opens a panel or moves the player: the bank, the store and the
// rig are still walked to.
//
// Each note watches a condition and fires on its rising edge only — once when the fuel runs out,
// not every frame it stays out. It can fire again once the condition has cleared and come back
// (refuelled, then dry again).
//
// A note only lives while its condition holds: once the ore is sold, "storage is full" is no
// longer true, so it comes off the list, read or not.

import { engine } from '@dcl/sdk/ecs'

import { getCarryCapacity, getMuleCount, getMuleFuelHours, getSyncedRate, hasWallet } from '../net/economy-link'
import { fuelTankGallons } from '../shared/economy/catalogue'
import { getOre } from '../shared/state/wallet'
import { quotedRate } from '../shared/state/market'

export type Notification = { id: number; key: string; title: string; body: string; read: boolean }

/** The most notes kept; older ones drop off the bottom. */
const MAX_NOTIFICATIONS = 8

/** Under this share of the tank the fuel counts as low — the same line the M.U.L.E. panel blinks at. */
const FUEL_LOW_SHARE = 0.1

/** A rate at or under this many tenths of ore per coin is a good price — the bank's "GOOD PRICE". */
const PRICE_GOOD_MAX_TENTHS = 106

type Watch = {
  key: string
  title: string
  body: string
  isActive: () => boolean
  /** Whether the state found on arrival counts as news. A dry tank does; a normal price does not. */
  notifyOnArrival: boolean
}

function fuelGallons(): number {
  return (getMuleFuelHours() * getMuleCount()) / 24
}

const WATCHES: Watch[] = [
  {
    key: 'fuel-empty',
    title: 'Your M.U.L.E.s ran out of fuel',
    body: 'Visit the General Store to buy more fuel.',
    isActive: () => getMuleCount() > 0 && getMuleFuelHours() <= 0,
    notifyOnArrival: true
  },
  {
    key: 'fuel-low',
    title: 'Your M.U.L.E. fuel is running low',
    body: 'Visit the General Store to buy more fuel.',
    isActive: () => {
      const mules = getMuleCount()
      const tank = fuelTankGallons(mules)
      const gallons = fuelGallons()
      return mules > 0 && tank > 0 && gallons > 0 && gallons / tank < FUEL_LOW_SHARE
    },
    notifyOnArrival: true
  },
  {
    key: 'storage-full',
    title: 'Your M.U.L.E. storage is full',
    body: 'Visit the Bank to sell your Ore.',
    isActive: () => getMuleCount() > 0 && getCarryCapacity() > 0 && getOre() >= getCarryCapacity(),
    notifyOnArrival: true
  },
  {
    key: 'good-price',
    title: 'The ore price is good right now',
    body: 'Visit the Bank if you want to sell.',
    // Only news to someone with enough ore to make a sale.
    isActive: () => {
      const rate = quotedRate(getSyncedRate())
      return Math.round(rate * 10) <= PRICE_GOOD_MAX_TENTHS && getOre() >= rate
    },
    notifyOnArrival: false
  }
]

const notifications: Notification[] = []
const active = new Map<string, boolean>()
let nextId = 1
let panelOpen = false

/** Newest first. */
export function getNotifications(): readonly Notification[] {
  return notifications
}

/** What the badge shows. Zero while the panel is open: everything on it is being read. */
export function unreadCount(): number {
  if (panelOpen) return 0
  return notifications.filter((n) => !n.read).length
}

export function isNotificationsOpen(): boolean {
  return panelOpen
}

export function openNotifications(): void {
  panelOpen = true
}

/**
 * Marks everything read on the way out, not the way in, so the notes that were new keep their
 * highlight for the visit that shows them. The badge clears on opening all the same.
 */
export function closeNotifications(): void {
  panelOpen = false
  for (const n of notifications) n.read = true
}

function push(watch: Watch): void {
  // One that lands while the panel is open is on screen, so it is read on close with the rest.
  notifications.unshift({ id: nextId++, key: watch.key, title: watch.title, body: watch.body, read: false })
  if (notifications.length > MAX_NOTIFICATIONS) notifications.length = MAX_NOTIFICATIONS
}

/** Takes a watch's notes off the list, once what they reported has stopped being true. */
function retract(key: string): void {
  for (let i = notifications.length - 1; i >= 0; i--) {
    if (notifications[i].key === key) notifications.splice(i, 1)
  }
}

function update(): void {
  // Before the purse arrives every figure is a placeholder: an empty tank that is not empty.
  if (!hasWallet()) return
  for (const watch of WATCHES) {
    const now = watch.isActive()
    const before = active.get(watch.key)
    active.set(watch.key, now)
    if (!now) {
      if (before === true) retract(watch.key)
      continue
    }
    if (before === true) continue
    if (before === undefined && !watch.notifyOnArrival) continue
    push(watch)
  }
}

export function setupNotifications(): void {
  engine.addSystem(update, undefined, 'client:notifications')
}
