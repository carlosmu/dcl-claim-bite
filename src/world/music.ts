import { AudioSource, Entity, engine, Transform } from '@dcl/sdk/ecs'

// Background music: one looping, non-positional track for the whole town.
//
// `global: true` keeps it at a constant volume everywhere instead of fading with distance —
// it is the town's music, not a sound coming from an object.
//
// Kept well under the one-shots (the bank at 0.8, the mining tap at 0.8/0.6) so the sounds
// that report on an action still cut through it.

const MUSIC_CLIP = 'assets/sounds/western_loop.mp3'
const MUSIC_VOLUME = 2

// The title screen loops its own track; the town music replaces it once Start Game is tapped.
const INTRO_CLIP = 'assets/sounds/intro.mp3'
const INTRO_VOLUME = 1

let introEntity: Entity | undefined
let musicEntity: Entity | undefined

export function setupMusic(): void {
  introEntity = engine.addEntity()
  Transform.create(introEntity, {})
  AudioSource.create(introEntity, {
    audioClipUrl: INTRO_CLIP,
    playing: true,
    loop: true,
    volume: INTRO_VOLUME,
    global: true
  })

  const entity = engine.addEntity()
  musicEntity = entity
  Transform.create(entity, {})
  AudioSource.create(entity, {
    audioClipUrl: MUSIC_CLIP,
    playing: false,
    loop: true,
    volume: MUSIC_VOLUME,
    global: true
  })
}

// Called by the title screen's Start Game button. The town loop waits: over the welcome it
// would talk across the mayor, so it starts once he is done (startTownMusic).
export function stopIntroMusic(): void {
  if (introEntity === undefined) return
  AudioSource.getMutable(introEntity).playing = false
  engine.removeEntity(introEntity)
  introEntity = undefined
}

export function startTownMusic(): void {
  if (musicEntity !== undefined) AudioSource.getMutable(musicEntity).playing = true
}
