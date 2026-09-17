import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { sendCollect } from '../net/economy-link'

// The idle rig standing in the world. Walking up to it is how a load gets claimed — the ore
// is not posted to the bag automatically, because arriving to collect is the return hook the
// rig exists to create (GDD §4).

export const MULE_ENTITY_NAME = 'MULE'
export const MULE_RADIUS_METERS = 5

let zone: ProximityZone | null = null

export function isPlayerAtMule(): boolean {
  return zone !== null && zone.isPlayerInside()
}

/** Asks the server to empty the rig into the bag. Nothing is decided here. */
export function collectMule(): void {
  sendCollect()
}

export function setupMule(): void {
  zone = createProximityZone({ entityName: MULE_ENTITY_NAME, radiusMeters: MULE_RADIUS_METERS })
}
