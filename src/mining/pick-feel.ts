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

// Every burst gets an entity of its own, removed once its particles are gone. Replacing the
// ParticleSystem on one reused entity with the same values does not fire it again: only the
// first hit ever threw sparks.
const BURST_CLEANUP_MARGIN_SECONDS = 0.5
const burstsToRemove: { entity: Entity; seconds: number }[] = []
let burstCleanupAdded = false

function burstEntity(spot: Vector3, lifetime: number): Entity {
  if (!burstCleanupAdded) {
    burstCleanupAdded = true
    engine.addSystem((dt) => {
      for (let i = burstsToRemove.length - 1; i >= 0; i--) {
        burstsToRemove[i].seconds -= dt
        if (burstsToRemove[i].seconds > 0) continue
        engine.removeEntity(burstsToRemove[i].entity)
        burstsToRemove.splice(i, 1)
      }
    })
  }
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.create(spot.x, spot.y + SPARK_HEIGHT_METERS, spot.z) })
  burstsToRemove.push({ entity, seconds: lifetime + BURST_CLEANUP_MARGIN_SECONDS })
  return entity
}

function soundEntity(): Entity {
  if (sound === null) {
    sound = engine.addEntity()
    Transform.create(sound, {})
    AudioSource.create(sound, { audioClipUrl: HIT_SOUND, playing: false, loop: false, global: true })
  }
  return sound
}

/** Strikes the rock at `spot`: the sound and the sparks of the pick in use. */
export function playHitFeedback(spot: Vector3): void {
  const feel = currentFeel()

  // playSound keeps the rest of the component, so the tier's volume and pitch go in first.
  const audio = AudioSource.getMutable(soundEntity())
  audio.volume = feel.volume
  audio.pitch = feel.pitch
  AudioSource.playSound(soundEntity(), HIT_SOUND, true)

  // A one-shot burst on an entity of its own, so every hit fires it.
  const entity = burstEntity(spot, 0.5)
  const fade = Color4.create(feel.sparkColor.r, feel.sparkColor.g * 0.5, feel.sparkColor.b * 0.3, 0)
  ParticleSystem.create(entity, {
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

  fireBurst(spot, HIT_BURST)
}

/** The rock-break burst, the same one Monster Recon throws when a monster is caught. */
const BREAK_BURST: Burst = { count: 60, lifetime: 2.5, speed: 1 }
/** On every hit, a small version of it: a fifth of the particles, faster, for half as long. */
const HIT_BURST: Burst = { count: 12, lifetime: 1.25, speed: 1.5 }

type Burst = { count: number; lifetime: number; speed: number }

/** Pull on the burst particles, as a share of real gravity: enough that they fall back down. */
const BURST_GRAVITY = 1

/** Fires `burst` at `spot`. */
function fireBurst(spot: Vector3, burst: Burst): void {
  ParticleSystem.create(burstEntity(spot, burst.lifetime), {
    loop: false,
    rate: 0,
    lifetime: burst.lifetime,
    maxParticles: 150,
    gravity: BURST_GRAVITY,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    simulationSpace: PBParticleSystem_SimulationSpace.PSS_WORLD,
    shape: ParticleSystem.Shape.Sphere({ radius: 0.3 }),
    initialVelocitySpeed: { start: 3 * burst.speed, end: 5 * burst.speed },
    initialSize: { start: 0.08, end: 0.18 },
    sizeOverTime: { start: 1, end: 0 },
    initialColor: { start: Color4.create(1, 0.9, 0.4, 1), end: Color4.create(1, 0.4, 0.1, 1) },
    colorOverTime: { start: Color4.create(1, 0.8, 0.5, 1), end: Color4.create(0.8, 0.2, 0, 0) },
    bursts: { values: [{ time: 0, count: burst.count, cycles: 1, interval: 0.01, probability: 1 }] }
  })
}

/** The burst when a rock breaks. */
export function playRockBreak(spot: Vector3): void {
  fireBurst(spot, BREAK_BURST)
}
