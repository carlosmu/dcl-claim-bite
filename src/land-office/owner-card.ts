import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { room } from '../shared/net/protocol'
import { cleanNoteText, Note, NOTE_MAX_CHARS, parseNotes } from '../shared/notes'
import { focusPanel, registerPanel } from '../world/panel-focus'

// The card a property's owner shows when their property is clicked: who they are and what they
// have (the server's answer, never their coins), and a note to leave at their door — or, at your
// own door, the notes left there.

/** The card closes once the player wanders this far from where they clicked the property. */
const CARD_KEEP_METERS = 16

export type OwnerCard = {
  found: boolean
  name: string
  property: string
  pick: string
  storage: string
  mules: number
  online: boolean
}

let openOwner: string | null = null
/** The owner's name as the sign shows it, until the server's card comes back. */
let openName = ''
let openAt = Vector3.Zero()
let card: OwnerCard | null = null

let draft = ''
let noteStatus: { ok: boolean; text: string } | null = null
let sending = false

let myNotes: Note[] = []
/** The newest note this client has been told about, and how many new ones have come in (so a repeat is news). */
let newestSeenAt = 0
let noteNews = { count: 0, from: '', waiting: 0 }

let myAddress = ''

function me(): string {
  if (myAddress === '') myAddress = (getPlayer()?.userId ?? '').toLowerCase()
  return myAddress
}

export function isOwnerCardOpen(): boolean {
  return openOwner !== null
}

/** The owner whose card is open, or '' when none is. */
export function getOpenOwner(): string {
  return openOwner ?? ''
}

export function getOpenOwnerName(): string {
  return card?.found ? card.name : openName
}

/** The server's card for the open owner, or null while it is on its way. */
export function getOwnerCard(): OwnerCard | null {
  return card
}

/** Whether the open card is the player's own property. */
export function isOwnCard(): boolean {
  return openOwner !== null && openOwner.toLowerCase() === me()
}

export function openOwnerCard(owner: string, name: string): void {
  if (openOwner !== owner) {
    draft = ''
    noteStatus = null
  }
  openOwner = owner
  openName = name
  openAt = Vector3.clone(Transform.getOrNull(engine.PlayerEntity)?.position ?? Vector3.Zero())
  card = null
  focusPanel('owner-card')
  room.send('askOwnerCard', { owner })
}

export function closeOwnerCard(): void {
  openOwner = null
  card = null
}

export function getNoteDraft(): string {
  return draft
}

export function setNoteDraft(value: string): void {
  draft = value.slice(0, NOTE_MAX_CHARS)
  noteStatus = null
}

export function canSendNote(): boolean {
  return !sending && cleanNoteText(draft) !== ''
}

/** What became of the last note sent, or null when there is nothing to say. */
export function getNoteStatus(): { ok: boolean; text: string } | null {
  return noteStatus
}

export function sendNote(): void {
  if (openOwner === null || !canSendNote()) return
  sending = true
  room.send('leaveNote', { owner: openOwner, text: cleanNoteText(draft) })
}

/** The server's answer to a note, from the economy link's action results. */
export function onNoteResult(ok: boolean, detail: string): void {
  sending = false
  noteStatus = { ok, text: ok ? 'Note left at the door' : `Not sent: ${detail}` }
  if (ok) draft = ''
}

/** The notes at the player's own door, newest first. */
export function getMyNotes(): readonly Note[] {
  return myNotes
}

export function clearMyNotes(): void {
  room.send('clearNotes', { ready: true })
}

/** Goes up each time notes arrive that this client had not seen, with who left the newest. */
export function getNoteNews(): { count: number; from: string; waiting: number } {
  return noteNews
}

function keepCardInReach(): void {
  if (openOwner === null) return
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (player !== null && Vector3.distance(player.position, openAt) > CARD_KEEP_METERS) closeOwnerCard()
}

export function setupOwnerCard(): void {
  registerPanel('owner-card', closeOwnerCard)

  room.onMessage('ownerCard', (data) => {
    if (data.owner !== openOwner) return
    card = {
      found: data.found,
      name: data.name,
      property: data.property,
      pick: data.pick,
      storage: data.storage,
      mules: data.mules,
      online: data.online
    }
  })

  room.onMessage('notes', (data) => {
    const notes = parseNotes(data.json)
    myNotes = [...notes].sort((a, b) => b.at - a.at)
    const fresh = myNotes.filter((note) => note.at > newestSeenAt)
    if (fresh.length > 0) {
      newestSeenAt = fresh[0].at
      noteNews = { count: noteNews.count + 1, from: fresh[0].from, waiting: fresh.length }
    }
  })

  engine.addSystem(keepCardInReach, undefined, 'client:owner-card')
}
