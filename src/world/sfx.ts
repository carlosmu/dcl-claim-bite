import { AudioSource, Entity, engine, Transform } from '@dcl/sdk/ecs'
import { sfxVolume } from './volume'

// One-shot sounds that aren't tied to any object in the world.
//
// One entity per clip, created on first use and reused after that. Playback goes through
// AudioSource.playSound, which replaces the component with currentTime 0 and so always emits
// a CRDT PUT — the same reason the mining tap uses it: toggling `playing` false->true inside
// a single tick ships only the final state, and the renderer never sees a change.
//
// playSound spreads the existing component, so the volume set just before it survives; it is
// set on every play so the SFX slider applies to the next sound.

const entitiesByClip = new Map<string, Entity>()

export function playSfx(clip: string, volume: number = 1): void {
  let entity = entitiesByClip.get(clip)

  if (entity === undefined) {
    entity = engine.addEntity()
    Transform.create(entity, {})
    AudioSource.create(entity, {
      audioClipUrl: clip,
      playing: false,
      loop: false,
      global: true
    })
    entitiesByClip.set(clip, entity)
  }

  AudioSource.getMutable(entity).volume = volume * sfxVolume()
  AudioSource.playSound(entity, clip, true)
}
