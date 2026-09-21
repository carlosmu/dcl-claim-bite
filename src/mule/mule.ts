import { Billboard, BillboardMode, engine, Entity, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import { getOwned } from '../shared/state/inventory'
import { muleLevel } from '../shared/economy/catalogue'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { sendBuy, sendCollect } from '../net/economy-link'

// The idle rig standing in the world. Walking up to it is how a load gets claimed — the ore
// is not posted to the bag automatically, because arriving to collect is the return hook the
// rig exists to create (GDD §4).

export const MULE_ENTITY_NAME = 'MULE'
export const MULE_RADIUS_METERS = 5

/** How high above the rig's origin the level sign floats. */
const LEVEL_SIGN_HEIGHT_METERS = 2.5

let zone: ProximityZone | null = null

export function isPlayerAtMule(): boolean {
  return zone !== null && zone.isPlayerInside()
}

/** Asks the server to empty the rig into the bag. Nothing is decided here. */
export function collectMule(): void {
  sendCollect()
}

/** Asks the server to put one tank in the rig. It checks the price and the room in the tank. */
export function refuelMule(): void {
  sendBuy('fuel')
}

// One rig that levels up rather than many rigs (balance.md §0). Until each level has its own
// model, the level shows as an "xN" sign floating over it.
function setupLevelSign(): void {
  const mule = engine.getEntityOrNullByName(MULE_ENTITY_NAME)
  if (mule === null) return

  const sign: Entity = engine.addEntity()
  Transform.create(sign, { parent: mule, position: Vector3.create(0, LEVEL_SIGN_HEIGHT_METERS, 0) })
  Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(sign, { text: '', fontSize: 4, textColor: Color4.White(), outlineWidth: 0.2, outlineColor: Color4.Black() })

  let shown = -1
  engine.addSystem(
    () => {
      const level = muleLevel((id) => getOwned(id))
      if (level === shown) return
      shown = level
      TextShape.getMutable(sign).text = level > 0 ? `x${level}` : ''
    },
    undefined,
    'client:mule-level-sign'
  )
}

export function setupMule(): void {
  zone = createProximityZone({ entityName: MULE_ENTITY_NAME, radiusMeters: MULE_RADIUS_METERS })
  setupLevelSign()
}
