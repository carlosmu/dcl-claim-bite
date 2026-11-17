// The Sound panel's settings as the server keeps them (server/prefs.ts). Shared so the server can
// tell a saved preference from junk.

/** Steps of each volume slider: a level is a whole number from 0 (off) to this (as tuned). */
export const VOLUME_STEPS = 5

/** How many soundtrack tracks there are (world/music.ts TRACKS). The ticked ones are kept as a
 * bitmask: bit i set means track i plays. */
export const TRACK_COUNT = 5

export function isVolumeStep(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= VOLUME_STEPS
}

export function isTrackMask(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 1 << TRACK_COUNT
}
