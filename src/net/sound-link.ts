import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'

import { getMusicStep, getSfxStep, setMusicStep, setSfxStep } from '../world/volume'
import { getTrackMask, setTrackEnabled, setTrackMask } from '../world/music'
import { isTrackMask, isVolumeStep } from '../shared/sound-prefs'
import { room } from '../shared/net/protocol'

// The Sound panel's settings are kept by the server (server/prefs.ts), so the next visit opens
// with the same volumes and tracks. A change goes out once the player has stopped touching the
// panel for a moment, so stepping a slider ten times is one write, not ten.

const SEND_DELAY = 1.5

/** Whether the player changed anything this visit: then what the server kept is older. */
let touched = false
/** Seconds left before a change goes out, or -1 with nothing to send. */
let sendIn = -1

function changed(): void {
  touched = true
  sendIn = SEND_DELAY
}

export function pickMusicStep(step: number): void {
  setMusicStep(step)
  changed()
}

export function pickSfxStep(step: number): void {
  setSfxStep(step)
  changed()
}

export function pickTrackEnabled(index: number, enabled: boolean): void {
  setTrackEnabled(index, enabled)
  changed()
}

/** What the server kept from an earlier visit (-1: never set). A change made this visit wins. */
export function restoreSoundPrefs(music: number, sfx: number, tracks: number): void {
  if (touched) return
  if (isVolumeStep(music)) setMusicStep(music)
  if (isVolumeStep(sfx)) setSfxStep(sfx)
  if (isTrackMask(tracks)) setTrackMask(tracks)
}

function flush(dt: number): void {
  if (sendIn < 0) return
  sendIn = Math.max(0, sendIn - dt)
  if (sendIn > 0 || !isStateSyncronized()) return
  room.send('setSoundPrefs', { music: getMusicStep(), sfx: getSfxStep(), tracks: getTrackMask() })
  sendIn = -1
}

export function setupSoundLink(): void {
  engine.addSystem(flush, undefined, 'client:sound-link')
}
