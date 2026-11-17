import { AudioSource, Entity, engine, Transform } from '@dcl/sdk/ecs'
import { musicVolume, onMusicVolumeChange } from './volume'

// Background music: a non-positional playlist for the whole town. The tracks play one after
// another in their numbered order, skipping the ones the player unticked in the Sound panel, and
// wrap around to the first after the last.
//
// `global: true` keeps it at a constant volume everywhere instead of fading with distance —
// it is the town's music, not a sound coming from an object.
//
// Kept well under the one-shots (the bank at 0.8, the mining tap at 0.8/0.6) so the sounds
// that report on an action still cut through it.

/** The soundtrack, in play order. `title` is what the Sound panel lists. */
export const TRACKS: { clip: string; title: string }[] = [
  { clip: 'assets/sounds/01_a_pocket_full_of_gold.mp3', title: '01. A Pocket Full of Gold' },
  { clip: 'assets/sounds/02_outlaw_whispers.mp3', title: '02. Outlaw Whispers' },
  { clip: 'assets/sounds/03_the_last_nugget.mp3', title: '03. The Last Nugget' },
  { clip: 'assets/sounds/04_dusty_trails.mp3', title: '04. Dusty Trails' },
  { clip: 'assets/sounds/05_one_more_day_in_claim_bite.mp3', title: '05. One More Day in Claim Bite' }
]
const MUSIC_VOLUME = 2

const trackEnabled: boolean[] = TRACKS.map(() => true)
// Index of the track playing, or -1 while the playlist is silent (before the welcome ends, or
// with every track unticked).
let currentTrack = -1
let townMusicStarted = false
let wasPlaying = false

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
    volume: INTRO_VOLUME * musicVolume(),
    global: true
  })

  const entity = engine.addEntity()
  musicEntity = entity
  Transform.create(entity, {})
  AudioSource.create(entity, {
    audioClipUrl: TRACKS[0].clip,
    playing: false,
    loop: false,
    volume: MUSIC_VOLUME * musicVolume(),
    global: true
  })

  onMusicVolumeChange(() => {
    if (introEntity !== undefined) AudioSource.getMutable(introEntity).volume = INTRO_VOLUME * musicVolume()
    if (musicEntity !== undefined) AudioSource.getMutable(musicEntity).volume = MUSIC_VOLUME * musicVolume()
  })

  // A track that ends on its own flips `playing` back to false: move on to the next ticked one.
  engine.addSystem(() => {
    if (musicEntity === undefined || currentTrack < 0) {
      wasPlaying = false
      return
    }
    const playing = AudioSource.get(musicEntity).playing ?? false
    if (wasPlaying && !playing) {
      const next = nextEnabledTrack(currentTrack)
      if (next >= 0) playTrack(next)
      else currentTrack = -1
      return
    }
    wasPlaying = playing
  })
}

/** The first ticked track after `from`, wrapping around (so `from` itself comes last), or -1. */
function nextEnabledTrack(from: number): number {
  for (let step = 1; step <= TRACKS.length; step++) {
    const index = (from + step) % TRACKS.length
    if (trackEnabled[index]) return index
  }
  return -1
}

function playTrack(index: number): void {
  if (musicEntity === undefined) return
  currentTrack = index
  // playSound keeps the volume and `global` already on the component, and restarts from 0.
  AudioSource.playSound(musicEntity, TRACKS[index].clip)
  wasPlaying = true
}

function stopPlaylist(): void {
  currentTrack = -1
  wasPlaying = false
  if (musicEntity !== undefined) AudioSource.stopSound(musicEntity)
}

/** The ticked tracks as a bitmask (bit i: track i), the way the server keeps them. */
export function getTrackMask(): number {
  return trackEnabled.reduce((mask, enabled, index) => (enabled ? mask | (1 << index) : mask), 0)
}

export function setTrackMask(mask: number): void {
  for (let index = 0; index < TRACKS.length; index++) setTrackEnabled(index, (mask & (1 << index)) !== 0)
}

export function isTrackEnabled(index: number): boolean {
  return trackEnabled[index] ?? false
}

/** Ticks or unticks a track. Unticking the one playing skips to the next ticked one at once. */
export function setTrackEnabled(index: number, enabled: boolean): void {
  if (index < 0 || index >= TRACKS.length || trackEnabled[index] === enabled) return
  trackEnabled[index] = enabled
  if (!townMusicStarted) return
  if (!enabled && index === currentTrack) {
    const next = nextEnabledTrack(index)
    if (next >= 0) playTrack(next)
    else stopPlaylist()
  } else if (enabled && currentTrack < 0) {
    playTrack(index)
  }
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
  if (townMusicStarted) return
  townMusicStarted = true
  const first = nextEnabledTrack(TRACKS.length - 1)
  if (first >= 0) playTrack(first)
}
