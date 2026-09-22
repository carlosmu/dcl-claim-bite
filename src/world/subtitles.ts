import { engine } from '@dcl/sdk/ecs'

// Subtitles for a line of dialogue played outside a cinematic. Drawn by the same overlay as the
// welcome shot's, in the same place and the same gold, just without the black bars.

/** Times are from the start of the line, in seconds. Each holds until the next; `\n` breaks it
 * onto two rows. */
export type Subtitle = { at: number; text: string }

let track: Subtitle[] = []
let elapsed = -1
let length = 0

function subtitlesSystem(dt: number): void {
  elapsed += dt
  if (elapsed < length) return
  elapsed = -1
  track = []
  engine.removeSystem(subtitlesSystem)
}

/**
 * Shows `lines` against a clock started now, cleared `seconds` after starting. Replaces any
 * track already running.
 */
export function playSubtitles(lines: Subtitle[], seconds: number): void {
  if (elapsed < 0) engine.addSystem(subtitlesSystem, undefined, 'client:subtitles')
  track = lines
  length = seconds
  elapsed = 0
}

/** The subtitle to show now, or '' for none. */
export function getSubtitle(): string {
  if (elapsed < 0) return ''
  let line = ''
  for (const subtitle of track) if (elapsed >= subtitle.at) line = subtitle.text
  return line
}
