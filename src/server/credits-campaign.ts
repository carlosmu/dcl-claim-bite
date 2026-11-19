// The Marketplace Credits campaign, server side (shared/credits-campaign.ts says what it is).
//
// Server-only. Counts each player's shared rocks per game day, records the reservation (day 1) and
// the claim (a later day), and keeps the scene-wide list the owner pays the winners from.
//
// LIVE CONTROL, without a deploy: decentraland.org/storage → Scene → `<CAMPAIGN_ID>-config`:
//   { "start": "2026-11-20T10:00:00Z", "end": "2026-11-23T10:00:00Z", "softCap": 60 }
// Read again every CONFIG_POLL_SECONDS. Empty start or end: off. If the key does not exist, the
// server writes that shape with empty dates, for the owner to fill in. The cap is informational
// only: nobody is turned away past it, an alert is stored (persistence.ts, `alerts`) when the
// winners reach it. `testDayMinutes` makes a day that many minutes long, in a local preview only.
// `rocksPerDay` changes the rocks each day asks for (default CAMPAIGN_ROCKS_PER_DAY); the clients are told.
//
// THE WINNERS: Scene → `<CAMPAIGN_ID>-entries`, one row per wallet that reserved; the winners are
// the rows with `claimedAt`. Admins can also copy them as CSV from the bug-report menu.

import { engine } from '@dcl/sdk/ecs'

import { room } from '../shared/net/protocol'
import { isAdmin } from '../shared/admins'
import { isLocalPreview } from '../shared/local-preview'
import { readSceneEntityId } from '../shared/scene-entity'
import { DAY_START_HOUR_UTC, dayKeyOf, dayOf } from '../shared/titles'
import { CAMPAIGN_ID, CAMPAIGN_REWARD_CREDITS, CAMPAIGN_ROCKS_PER_DAY, CampaignPhase } from '../shared/credits-campaign'
import {
  loadCampaignConfig,
  loadCampaignEntries,
  loadCampaignProgress,
  mergeCampaignEntries,
  recordAlert,
  saveCampaignConfig,
  saveCampaignProgress,
  StoredCampaignConfig,
  StoredCampaignEntry,
  StoredCampaignProgress
} from './persistence'

/** How often the owner's settings are read again. A minute: edits in the panel show up soon enough. */
const CONFIG_POLL_SECONDS = 60

/** How long to wait before asking storage again after a read failed. */
const RETRY_SECONDS = 5

/** How often changed progress is written. Milestones are written at once. */
const SAVE_PERIOD_SECONDS = 10

/** How often the open/closed state and the game day are checked for a change. */
const TICK_SECONDS = 1

/** The CSV for admins goes in parts of at most this many characters, well under the 13 KB message cap. */
const WINNERS_PART_CHARS = 8000

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/** What the server writes when there is no config yet: off, for the owner to fill in. */
const CONFIG_TEMPLATE: StoredCampaignConfig = {
  start: '',
  end: '',
  softCap: 60,
  testDayMinutes: 0,
  rocksPerDay: CAMPAIGN_ROCKS_PER_DAY,
  help: 'ISO dates in UTC, e.g. 2026-11-20T10:00:00Z. Empty start or end: off. softCap is informational. testDayMinutes works in a local preview only.'
}

let clock = 0
/**
 * A local preview, told by the scene's urn: a preview's is the project path in base64 (`b64-…`), a
 * deploy's an entity id. The realm's isPreview is not always answered on the server, so this backs it up.
 */
let previewScene = false
let config: StoredCampaignConfig | null = null
let configRetryAt = 0
let configLoading = false

/** The scene-wide list, once read. Null until then: counts are not shown as zero meanwhile. */
let entries: Record<string, StoredCampaignEntry> | null = null
let entriesRetryAt = 0
let entriesLoading = false
/** Rows changed here and not written yet, and rows to drop (debug reset). */
const entriesPending: Record<string, StoredCampaignEntry> = {}
const entriesRemoved = new Set<string>()
let entriesWriting = false
/** The winners count an alert was last stored for, so it is stored once per crossing. */
let capAlertedAt = -1

const progress = new Map<string, StoredCampaignProgress>()
const loading = new Set<string>()
const loadRetryAt = new Map<string, number>()
/** Rocks finished while the player's record was still being read: added once it arrives. */
const pendingRocks = new Map<string, number>()
const dirty = new Set<string>()
const present = new Set<string>()
const names = new Map<string, string>()

let sinceSave = 0
let sinceTick = 0
let sincePoll = CONFIG_POLL_SECONDS
let lastOpen = false
let lastDay = ''

// --- Time ---------------------------------------------------------------------------------

function parseTime(text: string | undefined): number {
  if (text === undefined || text === '') return NaN
  return Date.parse(text)
}

function campaignWindow(): { start: number; end: number } | null {
  if (config === null) return null
  const start = parseTime(config.start)
  const end = parseTime(config.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

function isOpen(now: number): boolean {
  const span = campaignWindow()
  return span !== null && now >= span.start && now < span.end
}

/** Rocks each day asks for: the live config's, else the default. */
function rocksGoal(): number {
  const rocks = config?.rocksPerDay
  return typeof rocks === 'number' && Number.isInteger(rocks) && rocks > 0 ? rocks : CAMPAIGN_ROCKS_PER_DAY
}

function testDayMs(): number {
  const minutes = config?.testDayMinutes ?? 0
  return minutes > 0 && (isLocalPreview() || previewScene) ? minutes * 60 * 1000 : 0
}

/** The campaign's day this moment falls in: the game day, or a short test day in a local preview. */
function dayKey(now: number): string {
  const test = testDayMs()
  const span = campaignWindow()
  if (test > 0 && span !== null) return `test-${Math.floor((now - span.start) / test)}`
  return dayKeyOf(now)
}

/** When the next day starts, wall-clock ms. */
function nextDayAt(now: number): number {
  const test = testDayMs()
  const span = campaignWindow()
  if (test > 0 && span !== null) return span.start + (Math.floor((now - span.start) / test) + 1) * test
  return (dayOf(now) + 1) * MILLISECONDS_PER_DAY + DAY_START_HOUR_UTC * 60 * 60 * 1000
}

// --- Where a player stands ----------------------------------------------------------------

function phaseOf(record: StoredCampaignProgress, now: number): CampaignPhase {
  const span = campaignWindow()
  if (span === null || now >= span.end) return 'off'
  if (now < span.start) return 'soon'
  if (record.claimedDay !== undefined) return 'claimed'
  if (record.reservedDay !== undefined) return record.reservedDay === dayKey(now) ? 'reserved' : 'day2'
  return nextDayAt(now) >= span.end ? 'late' : 'day1'
}

function sendStatus(address: string): void {
  const record = progress.get(address)
  if (record === undefined) return
  const now = Date.now()
  const span = campaignWindow()
  room.send(
    'campaignStatus',
    {
      phase: phaseOf(record, now),
      rocks: record.day === dayKey(now) ? Math.min(record.rocks, rocksGoal()) : 0,
      goal: rocksGoal(),
      credits: CAMPAIGN_REWARD_CREDITS,
      msToNextDay: Math.max(0, nextDayAt(now) - now),
      msToEnd: span === null ? 0 : Math.max(0, span.end - now),
      msToStart: span === null ? 0 : Math.max(0, span.start - now)
    },
    { to: [address] }
  )
}

function counts(): { reserved: number; claimed: number } {
  let reserved = 0
  let claimed = 0
  for (const entry of Object.values(entries ?? {})) {
    reserved += 1
    if (entry.claimedAt !== undefined) claimed += 1
  }
  return { reserved, claimed }
}

function sendAdmin(address: string): void {
  if (!isAdmin(address)) return
  const { reserved, claimed } = counts()
  room.send(
    'campaignAdmin',
    {
      open: isOpen(Date.now()),
      start: config?.start ?? '',
      end: config?.end ?? '',
      softCap: config?.softCap ?? 0,
      reserved: entries === null ? -1 : reserved,
      claimed: entries === null ? -1 : claimed
    },
    { to: [address] }
  )
}

function sendAdminsEverywhere(): void {
  for (const address of present) sendAdmin(address)
}

// --- Counting -----------------------------------------------------------------------------

function setEntry(address: string, entry: StoredCampaignEntry): void {
  if (entries !== null) entries[address] = entry
  entriesPending[address] = entry
  entriesRemoved.delete(address)
  writeEntries()
}

function applyRocks(address: string, record: StoredCampaignProgress, rocks: number): void {
  const now = Date.now()
  const today = dayKey(now)
  if (record.day !== today) {
    record.day = today
    record.rocks = 0
  }
  const phase = phaseOf(record, now)
  if (phase === 'off' || phase === 'soon' || phase === 'late' || phase === 'claimed') return
  record.rocks += rocks
  dirty.add(address)

  if (record.rocks < rocksGoal()) return
  const name = names.get(address) ?? ''
  const at = new Date(now).toISOString()
  if (phase === 'day1') {
    record.reservedDay = today
    setEntry(address, { name, reservedDay: today, reservedAt: at })
    console.log(`[Server] ${CAMPAIGN_ID}: ${address} (${name}) reserved on ${today}`)
    flushProgress(address)
  } else if (phase === 'day2') {
    record.claimedDay = today
    const old = entries?.[address] ?? entriesPending[address]
    setEntry(address, {
      name: name !== '' ? name : old?.name ?? '',
      reservedDay: record.reservedDay ?? old?.reservedDay ?? '',
      reservedAt: old?.reservedAt ?? '',
      claimedDay: today,
      claimedAt: at
    })
    console.log(`[Server] ${CAMPAIGN_ID}: ${address} (${name}) CLAIMED ${CAMPAIGN_REWARD_CREDITS} credits on ${today}`)
    flushProgress(address)
  }
}

/**
 * A shared rock finished by this player (never a practice rock: economy.ts only calls this for
 * shared ones). `name` is their display name, kept for the winners' list.
 */
export function noteCampaignRock(address: string, name: string): void {
  if (!isOpen(Date.now())) return
  names.set(address, name)
  const record = progress.get(address)
  if (record === undefined) {
    pendingRocks.set(address, (pendingRocks.get(address) ?? 0) + 1)
    beginLoad(address)
    return
  }
  applyRocks(address, record, 1)
  sendStatus(address)
}

// --- Loading and saving -------------------------------------------------------------------

function beginLoad(address: string): void {
  if (progress.has(address) || loading.has(address)) return
  if (clock < (loadRetryAt.get(address) ?? 0)) return
  loading.add(address)
  loadCampaignProgress(CAMPAIGN_ID, address)
    .then((stored) => {
      loading.delete(address)
      const record: StoredCampaignProgress = stored ?? { day: '', rocks: 0 }
      // The scene-wide list outlives a lost player record: a claim there is a claim.
      const entry = entries?.[address]
      if (entry !== undefined) {
        if (record.reservedDay === undefined) record.reservedDay = entry.reservedDay
        if (entry.claimedDay !== undefined && record.claimedDay === undefined) record.claimedDay = entry.claimedDay
      }
      progress.set(address, record)
      const rocks = pendingRocks.get(address) ?? 0
      pendingRocks.delete(address)
      if (rocks > 0) applyRocks(address, record, rocks)
      if (present.has(address)) {
        sendStatus(address)
        sendAdmin(address)
      } else {
        release(address)
      }
    })
    .catch((error) => {
      loading.delete(address)
      loadRetryAt.set(address, clock + RETRY_SECONDS)
      console.log(`[Server] ${CAMPAIGN_ID} progress load failed for ${address}, retrying: ${error}`)
    })
}

function flushProgress(address: string): void {
  const record = progress.get(address)
  if (record === undefined || !dirty.has(address)) return
  dirty.delete(address)
  saveCampaignProgress(CAMPAIGN_ID, address, { ...record })
    .then((ok) => {
      if (!ok) dirty.add(address)
      else release(address)
    })
    .catch(() => dirty.add(address))
}

/** Forgets a player who has left once nothing of theirs is unsaved, so the next visit reads afresh. */
function release(address: string): void {
  if (present.has(address) || dirty.has(address) || loading.has(address)) return
  progress.delete(address)
  names.delete(address)
}

/** Writes the pending rows, one write at a time, merged over what is stored (persistence.ts). */
function writeEntries(): void {
  if (entriesWriting) return
  const rows = { ...entriesPending }
  const removed = [...entriesRemoved]
  if (Object.keys(rows).length === 0 && removed.length === 0) return
  for (const address of Object.keys(rows)) delete entriesPending[address]
  entriesRemoved.clear()
  entriesWriting = true
  mergeCampaignEntries(CAMPAIGN_ID, rows, removed)
    .then((merged) => {
      entriesWriting = false
      if (merged === null) {
        // Put back unless a newer row for the same wallet came in meanwhile; tried again at the next save.
        for (const [address, entry] of Object.entries(rows)) entriesPending[address] ??= entry
        for (const address of removed) entriesRemoved.add(address)
        return
      }
      entries = { ...merged, ...entriesPending }
      for (const address of entriesRemoved) delete entries[address]
      noteCap()
      sendAdminsEverywhere()
      writeEntries()
    })
    .catch(() => {
      entriesWriting = false
    })
}

function noteCap(): void {
  const cap = config?.softCap ?? 0
  const { claimed } = counts()
  if (cap <= 0 || claimed < cap || capAlertedAt === claimed) return
  // Stored once on reaching the cap and again every 10 past it, so the owner sees how far over it ran.
  if (claimed === cap || (claimed - cap) % 10 === 0) {
    capAlertedAt = claimed
    recordAlert({ kind: 'campaign-cap', message: `${CAMPAIGN_ID}: ${claimed} winners, soft cap ${cap}` })
  }
}

function loadConfig(): void {
  if (configLoading || clock < configRetryAt) return
  configLoading = true
  loadCampaignConfig(CAMPAIGN_ID)
    .then((stored) => {
      configLoading = false
      if (stored === null) {
        config = { ...CONFIG_TEMPLATE }
        void saveCampaignConfig(CAMPAIGN_ID, CONFIG_TEMPLATE)
        console.log(`[Server] ${CAMPAIGN_ID}: no config, wrote an empty one (off) for the owner to fill in`)
      } else {
        const changed = JSON.stringify(stored) !== JSON.stringify(config)
        config = stored
        if (changed) console.log(`[Server] ${CAMPAIGN_ID} config: ${JSON.stringify(stored)}`)
      }
      // Whatever changed (dates, cap, test days) shows at once.
      for (const address of present) sendStatus(address)
      sendAdminsEverywhere()
    })
    .catch((error) => {
      configLoading = false
      configRetryAt = clock + RETRY_SECONDS
      console.log(`[Server] ${CAMPAIGN_ID} config load failed, retrying: ${error}`)
    })
}

function loadEntries(): void {
  if (entries !== null || entriesLoading || clock < entriesRetryAt) return
  entriesLoading = true
  loadCampaignEntries(CAMPAIGN_ID)
    .then((stored) => {
      entriesLoading = false
      entries = { ...(stored ?? {}), ...entriesPending }
      for (const address of entriesRemoved) delete entries[address]
      // A claim recorded on the list but missing from a loaded record (another server wrote it).
      for (const [address, record] of progress) {
        const entry = entries[address]
        if (entry?.claimedDay !== undefined && record.claimedDay === undefined) {
          record.claimedDay = entry.claimedDay
          record.reservedDay ??= entry.reservedDay
          sendStatus(address)
        }
      }
      sendAdminsEverywhere()
    })
    .catch((error) => {
      entriesLoading = false
      entriesRetryAt = clock + RETRY_SECONDS
      console.log(`[Server] ${CAMPAIGN_ID} entries load failed, retrying: ${error}`)
    })
}

// --- Presence (called by economy.ts, which already tracks it) ------------------------------

export function campaignArrive(address: string): void {
  present.add(address)
  if (progress.has(address)) {
    sendStatus(address)
    sendAdmin(address)
  } else {
    beginLoad(address)
  }
}

export function campaignLeave(address: string): void {
  present.delete(address)
  if (dirty.has(address)) flushProgress(address)
  else release(address)
}

/** On hello: the arrival's status may have gone out before the client listened. */
export function sendCampaignHello(address: string): void {
  sendStatus(address)
  sendAdmin(address)
}

/** DEBUG reset (economy.ts, local preview only): this wallet starts the campaign over. */
export function resetCampaignProgress(address: string): void {
  progress.set(address, { day: '', rocks: 0 })
  pendingRocks.delete(address)
  dirty.add(address)
  flushProgress(address)
  if (entries !== null) delete entries[address]
  delete entriesPending[address]
  entriesRemoved.add(address)
  writeEntries()
  sendStatus(address)
  sendAdminsEverywhere()
}

// --- Admin export -------------------------------------------------------------------------

function csvField(text: string): string {
  // Quoted, and a leading formula character defused, so a name cannot run in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function sendWinners(address: string): void {
  if (!isAdmin(address)) return
  const rows = Object.entries(entries ?? {})
    .filter(([, entry]) => entry.claimedAt !== undefined)
    .sort(([, a], [, b]) => (a.claimedAt ?? '').localeCompare(b.claimedAt ?? ''))
    .map(([wallet, entry]) =>
      [wallet, entry.name, entry.reservedDay, entry.claimedDay ?? '', entry.claimedAt ?? ''].map(csvField).join(',')
    )
  const lines = ['address,name,reservedDay,claimedDay,claimedAt', ...rows]
  const parts: string[] = []
  let current = ''
  for (const line of lines) {
    if (current.length + line.length + 1 > WINNERS_PART_CHARS && current !== '') {
      parts.push(current)
      current = ''
    }
    current += `${line}\n`
  }
  parts.push(current)
  parts.forEach((csv, part) => room.send('campaignWinners', { part, parts: parts.length, csv }, { to: [address] }))
  console.log(`[Server] ${CAMPAIGN_ID}: sent ${rows.length} winners to admin ${address}`)
}

// --- Systems ------------------------------------------------------------------------------

function update(dt: number): void {
  clock += dt

  sincePoll += dt
  if (sincePoll >= CONFIG_POLL_SECONDS) {
    sincePoll = 0
    loadConfig()
  } else if (config === null) {
    loadConfig()
  }
  loadEntries()

  sinceTick += dt
  if (sinceTick >= TICK_SECONDS) {
    sinceTick = 0
    for (const address of present) if (!progress.has(address)) beginLoad(address)
    // Opening, closing and a new day all change what players are shown.
    const now = Date.now()
    const open = isOpen(now)
    const day = dayKey(now)
    if (open !== lastOpen || day !== lastDay) {
      lastOpen = open
      lastDay = day
      for (const address of present) sendStatus(address)
      sendAdminsEverywhere()
    }
  }

  sinceSave += dt
  if (sinceSave >= SAVE_PERIOD_SECONDS) {
    sinceSave = 0
    for (const address of [...dirty]) flushProgress(address)
    writeEntries()
  }
}

export function setupCreditsCampaign(): void {
  readSceneEntityId()
    .then((entity) => {
      previewScene = entity.startsWith('b64-')
    })
    .catch(() => {})
  room.onMessage('adminCampaignWinners', (_data, context) => {
    if (!context) return
    if (!isAdmin(context.from)) {
      console.log(`[Server] ${context.from} asked for the campaign winners and is not an admin`)
      return
    }
    sendWinners(context.from)
  })
  engine.addSystem(update, undefined, 'server:credits-campaign')
}
