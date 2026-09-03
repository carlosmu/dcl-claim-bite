import { createProximityZone, ProximityZone } from '../world/proximity-zone'

export const MINE_ENTITY_NAME = 'Goldmine'
export const MINE_RADIUS_METERS = 3

let zone: ProximityZone | null = null

/** True while the player stands close enough to the dig to swing at it. */
export function isPlayerAtMine(): boolean {
  return zone !== null && zone.isPlayerInside()
}

export function setupMineProximity(): void {
  zone = createProximityZone({ entityName: MINE_ENTITY_NAME, radiusMeters: MINE_RADIUS_METERS })
}
