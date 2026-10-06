import { engine, Entity, InputAction, pointerEventsSystem, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// A radius around an entity authored in the Creator Hub, found here by name.
//
// Distance is measured every frame rather than through pointerEventsSystem.onProximityEnter:
// proximity events are new in SDK 7.27 and an older Explorer never emits them, so the
// callback would silently never fire. A plain distance check works on every client.
//
// Distance is to the entity's pivot, or, given a footprint, to the nearest point of that
// rectangle: a building's pivot sits at one corner, so the pivot alone says little about how
// close the player is to its walls.
//
// A zone can also be clicked open: clicking its click entity (a cube by the door, not the
// building itself) from further off counts as being there,
// the same way the M.U.L.E. opens, until the player wanders away or the zone is released.

/** How far you can be from the click entity and still click it. */
const CLICK_REACH_METERS = 12

/** A zone entered by a click stays entered until you wander this far from the entity. */
const CLICK_KEEP_METERS = 16

/**
 * The ground rectangle an entity covers, in its own local X/Z (metres, before its scale).
 * The SDK cannot read a model's bounds at runtime, so these are measured from the .glb.
 */
export type Footprint = { minX: number; maxX: number; minZ: number; maxZ: number }

export type ProximityZoneOptions = {
  /** Name of the entity in the Creator Hub scene. */
  entityName: string
  radiusMeters: number
  /** Measure to this rectangle instead of the pivot. */
  footprint?: Footprint
  /** Something to click to count as there, with its hover text. */
  click?: { entity: Entity; hoverText: string }
  onEnter?: () => void
  onLeave?: () => void
  /** A click while the player already counts as there, walking or clicked. */
  onClick?: () => void
}

export type ProximityZone = {
  /** Within the radius, or brought here by a click and not wandered off since. */
  isPlayerInside(): boolean
  /** Forgets a click, so the zone goes back to measuring distance alone. */
  release(): void
}

export function createProximityZone(options: ProximityZoneOptions): ProximityZone {
  const entity = engine.getEntityOrNullByName(options.entityName)
  let inside = false
  let clicked = false

  if (entity === null) {
    console.error(`[zone] no entity named "${options.entityName}" in the scene — this zone will never trigger`)
    return { isPlayerInside: () => false, release: () => {} }
  }

  function setInside(nowInside: boolean, why: string) {
    if (nowInside === inside) return
    inside = nowInside
    console.log(`[zone] player ${inside ? 'entered' : 'left'} "${options.entityName}" (${why})`)
    if (inside) options.onEnter?.()
    else options.onLeave?.()
  }

  function update() {
    const target = Transform.getOrNull(entity!)
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (target === null || player === null) return

    // These entities hang off the scene root, so their local position is already world space.
    const distance = distanceTo(player.position, target, options.footprint)
    if (clicked && distance > CLICK_KEEP_METERS) clicked = false
    setInside(distance <= options.radiusMeters || clicked, `${distance.toFixed(1)}m`)
  }

  engine.addSystem(update, undefined, `proximity-zone:${options.entityName}`)

  if (options.click !== undefined) {
    pointerEventsSystem.onPointerDown(
      { entity: options.click.entity, opts: { button: InputAction.IA_POINTER, hoverText: options.click.hoverText, maxDistance: CLICK_REACH_METERS } },
      () => {
        clicked = true
        if (inside) options.onClick?.()
        else setInside(true, 'clicked')
      }
    )
  }

  return {
    isPlayerInside: () => inside,
    release: () => {
      clicked = false
    }
  }
}

/** Ground distance from a point to an entity's footprint, or straight distance to its pivot without one. */
function distanceTo(
  point: Vector3,
  target: { position: Vector3; rotation: Quaternion; scale: Vector3 },
  footprint: Footprint | undefined
): number {
  if (footprint === undefined) return Vector3.distance(point, target.position)

  // Into the entity's local space, clamp onto the rectangle, and back out to measure in metres.
  const offset = Vector3.subtract(point, target.position)
  const local = Vector3.rotate(offset, Quaternion.create(-target.rotation.x, -target.rotation.y, -target.rotation.z, target.rotation.w))
  const nearest = Vector3.create(
    Math.min(Math.max(local.x / target.scale.x, footprint.minX), footprint.maxX) * target.scale.x,
    0,
    Math.min(Math.max(local.z / target.scale.z, footprint.minZ), footprint.maxZ) * target.scale.z
  )
  const world = Vector3.rotate(nearest, target.rotation)
  return Math.hypot(offset.x - world.x, offset.z - world.z)
}
