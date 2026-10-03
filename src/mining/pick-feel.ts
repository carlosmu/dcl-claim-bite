import {
  AudioSource,
  engine,
  Entity,
  ParticleSystem,
  PBParticleSystem_BlendMode,
  PBParticleSystem_SimulationSpace,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import { activePick } from '../shared/economy/catalogue'
import { getEquipped, getOwned } from '../shared/state/inventory'

// How each pick FEELS, on top of how fast it digs (that is the catalogue's hitsPerRock). Going
// Stranger → Miner → Master should be felt in the hands, not only read in a number: every tier
// jolts the rock harder, strikes louder and brighter, and throws more sparks.
//
// Sparks are a ParticleSystem, which only the Unity explorer draws; the jolt and the sound work
// everywhere, so no tier depends on the sparks to feel better.

const HIT_SOUND = 'assets/sounds/picking.mp3'

type Feel = {
  /** Scale the rock snaps to on a hit, settling back to 1. */
  bump: number
  volume: number
  /** Higher reads as a harder, cleaner strike. */
  pitch: number
  /** Sparks per hit, and how big and fast they fly. */
  sparks: number
  sparkSize: number
  sparkSpeed: number
  sparkColor: Color4
}

const FEELS: Record<string, Feel> = {
  pick: { bump: 1.08, volume: 0.75, pitch: 0.95, sparks: 4, sparkSize: 0.05, sparkSpeed: 1.5, sparkColor: Color4.create(1, 0.75, 0.4, 1) },
  'steel-pick': { bump: 1.12, volume: 0.9, pitch: 1.05, sparks: 9, sparkSize: 0.07, sparkSpeed: 2.2, sparkColor: Color4.create(1, 0.85, 0.45, 1) },
  'miners-pick': { bump: 1.18, volume: 1, pitch: 1.15, sparks: 16, sparkSize: 0.09, sparkSpeed: 3, sparkColor: Color4.create(0.7, 0.9, 1, 1) }
}

/** How high above the rock's base the sparks fly from. */
const SPARK_HEIGHT_METERS = 0.5

/** The feel of the pick in use; the Stranger's for no pick. */
export function currentFeel(): Feel {
  const pick = activePick((id) => getOwned(id), getEquipped())
  return FEELS[pick?.id ?? 'pick'] ?? FEELS.pick
}

let sound: Entity | null = null
let sparks: Entity | null = null

function soundEntity(): Entity {
  if (sound === null) {
    sound = engine.addEntity()
    Transform.create(sound, {})
    AudioSource.create(sound, { audioClipUrl: HIT_SOUND, playing: false, loop: false, global: true })
  }
  return sound
}

function sparksEntity(): Entity {
  if (sparks === null) {
    sparks = engine.addEntity()
    Transform.create(sparks, {})
  }
  return sparks
}

/** Strikes the rock at `spot`: the sound and the sparks of the pick in use. */
export function playHitFeedback(spot: Vector3): void {
  const feel = currentFeel()

  // playSound keeps the rest of the component, so the tier's volume and pitch go in first.
  const audio = AudioSource.getMutable(soundEntity())
  audio.volume = feel.volume
  audio.pitch = feel.pitch
  AudioSource.playSound(soundEntity(), HIT_SOUND, true)

  // A one-shot burst, replaced on every hit so it fires again from the start.
  const entity = sparksEntity()
  Transform.getMutable(entity).position = Vector3.create(spot.x, spot.y + SPARK_HEIGHT_METERS, spot.z)
  const fade = Color4.create(feel.sparkColor.r, feel.sparkColor.g * 0.5, feel.sparkColor.b * 0.3, 0)
  ParticleSystem.createOrReplace(entity, {
    loop: false,
    rate: 0,
    lifetime: 0.5,
    maxParticles: 32,
    gravity: 1,
    initialSize: { start: feel.sparkSize * 0.6, end: feel.sparkSize },
    sizeOverTime: { start: 1, end: 0 },
    initialColor: { start: feel.sparkColor, end: feel.sparkColor },
    colorOverTime: { start: feel.sparkColor, end: fade },
    initialVelocitySpeed: { start: feel.sparkSpeed * 0.6, end: feel.sparkSpeed },
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    simulationSpace: PBParticleSystem_SimulationSpace.PSS_WORLD,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.15 }),
    bursts: { values: [{ time: 0, count: feel.sparks, cycles: 1, interval: 0.01, probability: 1 }] }
  })
}
