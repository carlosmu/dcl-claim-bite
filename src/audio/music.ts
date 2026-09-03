import { engine, AudioSource, Transform } from '@dcl/sdk/ecs'

// Background music for the whole scene. `global: true` keeps it at a constant volume
// regardless of where the player stands, so it reads as a soundtrack rather than as
// something emitted by an object in the world.

const MUSIC_CLIP = 'assets/sounds/western_loop.mp3'
const MUSIC_VOLUME = 0.4

export function setupMusic() {
    const musicEntity = engine.addEntity()
    Transform.create(musicEntity, {})
    AudioSource.create(musicEntity, {
        audioClipUrl: MUSIC_CLIP,
        playing: true,
        loop: true,
        volume: MUSIC_VOLUME,
        global: true
    })
}
