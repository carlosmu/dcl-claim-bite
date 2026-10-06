import { Entity, engine, GltfContainer, Name, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// Tumbleweeds. Every entity whose name starts with `Weed-Emiter` is an emitter: it sends one
// Street Straw rolling along the emitter's own +Z, spinning on the emitter's X — turn the
// emitter in the Creator Hub to aim it — and when it has gone TRAVEL_METERS the
// weed is removed and the emitter sends a fresh one from its own spot.
//
// Purely cosmetic and local to each player — nothing here is synced or collides.

const EMITTER_PREFIX = 'Weed-Emiter'

const WEED_MODEL = 'assets/models/tumbleweed.glb'

const TRAVEL_METERS = 20
const SPEED_METERS_PER_SECOND = 3
/** Degrees turned on X per second. Positive rolls it forward along +Z. */
const SPIN_DEGREES_PER_SECOND = 360
/** Seconds an emitter waits before each weed, picked at random so emitters fall out of step. */
const MIN_WAIT_SECONDS = 0
const MAX_WAIT_SECONDS = 4

type Weed = {
  origin: Vector3
  /** The emitter's world rotation: its +Z is where the weed rolls, its X what it spins on. */
  facing: Quaternion
  direction: Vector3
  /** Null while the emitter is waiting to send the next one. */
  entity: Entity | null
  /** Seconds left before the next weed is sent. */
  wait: number
  travelled: number
  angle: number
}

const weeds: Weed[] = []

/** An entity's world position and rotation, through however many parents it has. */
function worldPose(entity: Entity): { position: Vector3; rotation: Quaternion } {
  const t = Transform.get(entity)
  let position = Vector3.clone(t.position)
  let rotation = Quaternion.create(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
  let parent = t.parent
  while (parent !== undefined && parent !== engine.RootEntity) {
    const p = Transform.getOrNull(parent)
    if (p === null) break
    position = Vector3.add(p.position, Vector3.rotate(Vector3.multiply(position, p.scale), p.rotation))
    rotation = Quaternion.multiply(p.rotation, rotation)
    parent = p.parent
  }
  return { position, rotation }
}

function spawnWeed(origin: Vector3, facing: Quaternion): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { position: Vector3.clone(origin), rotation: facing })
  GltfContainer.create(entity, { src: WEED_MODEL, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  return entity
}

function randomWait(): number {
  return MIN_WAIT_SECONDS + Math.random() * (MAX_WAIT_SECONDS - MIN_WAIT_SECONDS)
}

function tumbleweedSystem(dt: number): void {
  for (const weed of weeds) {
    if (weed.entity === null) {
      weed.wait -= dt
      if (weed.wait > 0) continue
      weed.entity = spawnWeed(weed.origin, weed.facing)
      weed.travelled = 0
      weed.angle = 0
      continue
    }

    weed.travelled += SPEED_METERS_PER_SECOND * dt
    if (weed.travelled >= TRAVEL_METERS) {
      engine.removeEntity(weed.entity)
      weed.entity = null
      weed.wait = randomWait()
      continue
    }

    weed.angle = (weed.angle + SPIN_DEGREES_PER_SECOND * dt) % 360
    const t = Transform.getMutable(weed.entity)
    t.position = Vector3.add(weed.origin, Vector3.scale(weed.direction, weed.travelled))
    t.rotation = Quaternion.multiply(weed.facing, Quaternion.fromEulerDegrees(weed.angle, 0, 0))
  }
}

export function setupTumbleweeds(): void {
  for (const [entity, name] of engine.getEntitiesWith(Name, Transform)) {
    if (!name.value.startsWith(EMITTER_PREFIX)) continue
    const { position: origin, rotation: facing } = worldPose(entity)
    const direction = Vector3.rotate(Vector3.Forward(), facing)
    weeds.push({ origin, facing, direction, entity: null, wait: randomWait(), travelled: 0, angle: 0 })
  }

  if (weeds.length === 0) {
    console.error(`[tumbleweeds] no entity named "${EMITTER_PREFIX}*" in the scene`)
    return
  }
  engine.addSystem(tumbleweedSystem)
}
