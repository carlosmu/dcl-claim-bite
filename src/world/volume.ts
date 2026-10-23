// The player's volume sliders: one for the music, one for everything else (one-shots, the
// mining tap, the mayor's lines).
//
// Each is a multiplier from 0 to 1 over the volume the sound already plays at, so 1 is the mix
// as tuned and the sliders can only turn it down. Kept in steps of 10% so the UI's bar and the
// value it shows always agree.

export const VOLUME_STEPS = 10

let musicStep = VOLUME_STEPS
let sfxStep = VOLUME_STEPS

const musicListeners: Array<() => void> = []

export function getMusicStep(): number {
  return musicStep
}

export function getSfxStep(): number {
  return sfxStep
}

export function musicVolume(): number {
  return musicStep / VOLUME_STEPS
}

export function sfxVolume(): number {
  return sfxStep / VOLUME_STEPS
}

export function setMusicStep(step: number): void {
  const next = Math.max(0, Math.min(VOLUME_STEPS, Math.round(step)))
  if (next === musicStep) return
  musicStep = next
  for (const listener of musicListeners) listener()
}

// One-shots read the level each time they play, so nothing has to be told.
export function setSfxStep(step: number): void {
  sfxStep = Math.max(0, Math.min(VOLUME_STEPS, Math.round(step)))
}

/** Looping tracks register here to follow the music slider while they play. */
export function onMusicVolumeChange(listener: () => void): void {
  musicListeners.push(listener)
}
