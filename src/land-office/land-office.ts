import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { itemsOf } from '../shared/economy/catalogue'

// The Land & Claim Office: where housing is sold. Buying goes through the same `buy` message
// and the same server checks as the Market (`shop/shop.ts`); only the counter is different.
//
// Ownership only for now: nothing bought here is placed in the world yet.

export const LAND_OFFICE_ENTITY_NAME = 'Land Office'
export const LAND_OFFICE_RADIUS_METERS = 5
let zone: ProximityZone | null = null

// Closing the office only hides it for this visit, and the selection only lasts the visit too:
// walking out and back in opens it again on its default property.
let closed = false
let selected: string | null = null

export function isPlayerAtLandOffice(): boolean {
  return zone !== null && zone.isPlayerInside()
}

export function isLandOfficePanelOpen(): boolean {
  return isPlayerAtLandOffice() && !closed
}

export function closeLandOfficePanel(): void {
  closed = true
}

/** The property shown in the detail panel, or null for the office's default. */
export function getSelectedProperty(): string | null {
  return selected
}

export function selectProperty(key: string): void {
  selected = key
}

export function setupLandOffice(): void {
  zone = createProximityZone({
    entityName: LAND_OFFICE_ENTITY_NAME,
    radiusMeters: LAND_OFFICE_RADIUS_METERS,
    onEnter: () => {
      closed = false
      selected = null
    }
  })

  console.log(`[land-office] catalogue: ${itemsOf('housing').map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
