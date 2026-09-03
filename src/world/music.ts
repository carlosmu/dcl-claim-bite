import { AudioSource, engine, Transform } from '@dcl/sdk/ecs'

// Background music: one looping, non-positional track for the whole town.
//
// `global: true` keeps it at a constant volume everywhere instead of fading with distance —
// it is the town's music, not a sound coming from an object.
//
// Kept well under the one-shots (the bank at 0.8, the mining tap at 0.8/0.6) so the sounds
// that report on an action still cut through it.

const MUSIC_CLIP = 'assets/sounds/western_loop.mp3'
const MUSIC_VOLUME = 0.25

export function setupMusic(): void {
  const entity = engine.addEntity()
  Transform.create(entity, {})
  AudioSource.create(entity, {
    audioClipUrl: MUSIC_CLIP,
    playing: true,
    loop: true,
    volume: MUSIC_VOLUME,
    global: true
  })
}
