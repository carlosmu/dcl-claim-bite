import { engine, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

// Where the mining bar is allowed to appear.
//
// The entity is authored in the Creator Hub (see design/decisions.md, 2026-09-02) and found
// here by name, so moving or renaming it in the inspector is all it takes to move the dig.
export const MINE_ENTITY_NAME = 'Goldmine'
export const MINE_RADIUS_METERS = 5

// Distance is measured every frame instead of through pointerEventsSystem.onProximityEnter:
// proximity events are new in SDK 7.27 and an older Explorer never emits them, so the
// callback would silently never fire. A plain distance check works on every client.
const LOG_DISTANCE_EVERY_SECONDS = 2 // diagnostic; set to 0 to silence

let mineEntity: ReturnType<typeof engine.getEntityOrNullByName> = null
let playerAtMine = false
let sinceLastLog = 0

/** True while the player stands close enough to the dig to swing at it. */
export function isPlayerAtMine(): boolean {
  return playerAtMine
}

export function setupMineProximity(): void {
  mineEntity = engine.getEntityOrNullByName(MINE_ENTITY_NAME)

  if (mineEntity === null) {
    console.error(`[mine] no entity named "${MINE_ENTITY_NAME}" in the scene — the mining bar will never show`)
    return
  }

  const transform = Transform.getOrNull(mineEntity)
  if (transform === null) {
    console.error(`[mine] "${MINE_ENTITY_NAME}" has no Transform — cannot measure distance to it`)
    return
  }

  const p = transform.position
  console.log(`[mine] "${MINE_ENTITY_NAME}" found at (${p.x}, ${p.y}, ${p.z}), radius ${MINE_RADIUS_METERS}m`)

  engine.addSystem(checkPlayerDistance)
}

function checkPlayerDistance(dt: number) {
  if (mineEntity === null) return

  const mine = Transform.getOrNull(mineEntity)
  const player = Transform.getOrNull(engine.PlayerEntity)
  if (mine === null || player === null) return

  // The Goldmine hangs off the scene root, so its local position is already world space.
  const distance = Vector3.distance(player.position, mine.position)
  const nowAtMine = distance <= MINE_RADIUS_METERS

  if (nowAtMine !== playerAtMine) {
    playerAtMine = nowAtMine
    console.log(`[mine] player ${nowAtMine ? 'entered' : 'left'} the dig (${distance.toFixed(1)}m)`)
  }

  if (LOG_DISTANCE_EVERY_SECONDS > 0) {
    sinceLastLog += dt
    if (sinceLastLog >= LOG_DISTANCE_EVERY_SECONDS) {
      sinceLastLog = 0
      console.log(
        `[mine] distance ${distance.toFixed(1)}m · player (${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)}) · mine (${mine.position.x.toFixed(1)}, ${mine.position.z.toFixed(1)})`
      )
    }
  }
}
