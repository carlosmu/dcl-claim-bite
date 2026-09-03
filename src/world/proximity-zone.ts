import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// A radius around an entity authored in the Creator Hub, found here by name.
//
// Distance is measured every frame rather than through pointerEventsSystem.onProximityEnter:
// proximity events are new in SDK 7.27 and an older Explorer never emits them, so the
// callback would silently never fire. A plain distance check works on every client.

export type ProximityZoneOptions = {
  /** Name of the entity in the Creator Hub scene. */
  entityName: string
  radiusMeters: number
  onEnter?: () => void
  onLeave?: () => void
}

export type ProximityZone = {
  isPlayerInside(): boolean
}

export function createProximityZone(options: ProximityZoneOptions): ProximityZone {
  const entity = engine.getEntityOrNullByName(options.entityName)
  let inside = false

  if (entity === null) {
    console.error(`[zone] no entity named "${options.entityName}" in the scene — this zone will never trigger`)
    return { isPlayerInside: () => false }
  }

  function update() {
    const target = Transform.getOrNull(entity!)
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (target === null || player === null) return

    // These entities hang off the scene root, so their local position is already world space.
    const distance = Vector3.distance(player.position, target.position)
    const nowInside = distance <= options.radiusMeters
    if (nowInside === inside) return

    inside = nowInside
    console.log(`[zone] player ${inside ? 'entered' : 'left'} "${options.entityName}" (${distance.toFixed(1)}m)`)
    if (inside) options.onEnter?.()
    else options.onLeave?.()
  }

  engine.addSystem(update, undefined, `proximity-zone:${options.entityName}`)

  return { isPlayerInside: () => inside }
}
