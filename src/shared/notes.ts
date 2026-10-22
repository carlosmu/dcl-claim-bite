// Notes left at a property's door, as both halves of the scene see them.

/** One note: who left it (their display name), what it says, and when (wall-clock ms). */
export type Note = { from: string; text: string; at: number }

/** The longest note the server keeps; the field stops taking letters here too. */
export const NOTE_MAX_CHARS = 140

/** How many notes fit in one mailbox; once full, no more are taken until its owner clears it. */
export const NOTE_MAX_KEPT = 10

/** A note as the server keeps it: trimmed, on one line, no longer than allowed. */
export function cleanNoteText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_CHARS)
}

/** The `notes` message's list, or none when it does not parse. */
export function parseNotes(json: string): Note[] {
  try {
    const parsed = JSON.parse(json) as Note[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
