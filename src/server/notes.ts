// Notes left at a property's door.
//
// Anyone in town may leave one at a property whose owner is not them; the owner reads them when
// they are here, however long they were away. Each door's notes are stored with its owner
// (./persistence), apart from the purse, and written out in batches like the purses are: a
// change only marks the door dirty, so two notes left a moment apart cannot land out of order.
//
// Like the purses, a door's notes are only changed once they have been read (or confirmed
// absent): a failed read is never taken for an empty door, or the next write would wipe it.

import { engine } from '@dcl/sdk/ecs'

import { room } from '../shared/net/protocol'
import { cleanNoteText, Note, NOTE_MAX_KEPT } from '../shared/notes'
import { loadNotes, saveNotes } from './persistence'

/** One note per sender per door this often, so a door cannot be flooded. */
const NOTE_COOLDOWN_MS = 60 * 1000

/** And one note per sender anywhere this often, so the whole street cannot be either. */
const NOTE_ANY_DOOR_COOLDOWN_MS = 10 * 1000

/** How often changed doors are written out. */
const SAVE_PERIOD_SECONDS = 5

/** Each door's notes, once read. */
const inboxes = new Map<string, Note[]>()

/** Reads on their way, so two asks for one door share a read. */
const reading = new Map<string, Promise<Note[]>>()

/** Doors changed since they were last written, and doors being written right now. */
const dirty = new Set<string>()
const saving = new Set<string>()

/** When each sender last left a note at each door (`sender>owner`), and anywhere. */
const lastNoteAt = new Map<string, number>()
const lastAnyNoteAt = new Map<string, number>()

let sinceLastSave = 0

function inboxOf(address: string): Promise<Note[]> {
  const kept = inboxes.get(address)
  if (kept !== undefined) return Promise.resolve(kept)
  const pending = reading.get(address)
  if (pending !== undefined) return pending

  const read = loadNotes(address).then(
    (stored) => {
      reading.delete(address)
      // A change may have raced the read in; it went into this same array, so keep that one.
      const notes = inboxes.get(address) ?? stored ?? []
      inboxes.set(address, notes)
      return notes
    },
    (error) => {
      // Nothing is kept: the next ask reads again.
      reading.delete(address)
      throw error
    }
  )
  reading.set(address, read)
  return read
}

/** Sends a player every note at their door. A failed read sends nothing; they get them next visit. */
export function sendNotes(address: string): void {
  inboxOf(address)
    .then((notes) => room.send('notes', { json: JSON.stringify(notes) }, { to: [address] }))
    .catch((error) => console.log(`[Server] could not read notes for ${address}: ${error}`))
}

/**
 * Leaves a note at `owner`'s door. Resolves to why it was refused, or null once it is left.
 * Whether `owner` has a door at all is the caller's to check.
 */
export async function leaveNote(from: string, fromName: string, owner: string, text: string): Promise<string | null> {
  if (from === owner) return 'that is your own door'
  const clean = cleanNoteText(text)
  if (clean === '') return 'the note is empty'

  const now = Date.now()
  const key = `${from}>${owner}`
  if (now - (lastNoteAt.get(key) ?? -Infinity) < NOTE_COOLDOWN_MS) return 'you just left them a note'
  if (now - (lastAnyNoteAt.get(from) ?? -Infinity) < NOTE_ANY_DOOR_COOLDOWN_MS) return 'too soon after your last note'
  // Taken before the read, so a burst of notes cannot all slip in while it is on its way.
  lastNoteAt.set(key, now)
  lastAnyNoteAt.set(from, now)

  let notes: Note[]
  try {
    notes = await inboxOf(owner)
  } catch (error) {
    // Not the sender's fault, so not held against them.
    lastNoteAt.delete(key)
    lastAnyNoteAt.delete(from)
    console.log(`[Server] could not read notes for ${owner}: ${error}`)
    return 'the post is down, try again'
  }
  if (notes.length >= NOTE_MAX_KEPT) {
    // Not the sender's fault either: they may try again once it is cleared.
    lastNoteAt.delete(key)
    lastAnyNoteAt.delete(from)
    return 'their mailbox is full'
  }
  notes.push({ from: fromName, text: clean, at: now })
  dirty.add(owner)
  return null
}

/** Throws away every note at a player's door. */
export function clearNotes(address: string): void {
  inboxOf(address)
    .then((notes) => {
      if (notes.length === 0) return
      notes.length = 0
      dirty.add(address)
      room.send('notes', { json: '[]' }, { to: [address] })
    })
    .catch((error) => console.log(`[Server] could not read notes for ${address}: ${error}`))
}

function flushNotes(dt: number): void {
  sinceLastSave += dt
  if (sinceLastSave < SAVE_PERIOD_SECONDS) return
  sinceLastSave = 0

  for (const address of dirty) {
    // One write per door at a time; a change made meanwhile waits for the next flush.
    if (saving.has(address)) continue
    const notes = inboxes.get(address)
    if (notes === undefined) continue
    dirty.delete(address)
    saving.add(address)
    saveNotes(address, [...notes])
      .then((ok) => {
        saving.delete(address)
        if (!ok) dirty.add(address)
      })
      .catch(() => {
        saving.delete(address)
        dirty.add(address)
      })
  }
}

export function setupNotes(): void {
  engine.addSystem(flushNotes, undefined, 'server:notes-save')
}
