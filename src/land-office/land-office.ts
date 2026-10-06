import { createClickCube } from '../world/click-cube'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, Footprint, ProximityZone } from '../world/proximity-zone'
import { itemsOf } from '../shared/economy/catalogue'

// The Land & Claim Office: where housing is sold. Buying goes through the same `buy` message
// and the same server checks as the Market (`shop/shop.ts`); only the counter is different.
//
// Ownership only for now: nothing bought here is placed in the world yet.

export const LAND_OFFICE_ENTITY_NAME = 'Land-Office'
// Measured from the walls, not the pivot: the Market is under 5 m away, so a wider radius
// would open both from the street between them.
export const LAND_OFFICE_RADIUS_METERS = 2
/** The building's ground plan, from House 7 M Blue.glb (glTF X is mirrored on import). */
const LAND_OFFICE_FOOTPRINT: Footprint = { minX: -7.42, maxX: 0.42, minZ: -9.27, maxZ: 0.11 }
let zone: ProximityZone | null = null

// Closing the office only hides it for this visit, and the selection only lasts the visit too:
// walking out and back in, or clicking the building, opens it again on its default property.
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
  // Otherwise a click would keep the player "at" the office and walking back in would not reopen it.
  zone?.release()
}

/** The property shown in the detail panel, or null for the office's default. */
export function getSelectedProperty(): string | null {
  return selected
}

export function selectProperty(key: string): void {
  selected = key
}

export function setupLandOffice(): void {
  // The sign above the door is a TextShape the Creator Hub names 'Text_3'.
  const cube = createClickCube(LAND_OFFICE_ENTITY_NAME, 'Text_3')
  zone = createProximityZone({
    entityName: LAND_OFFICE_ENTITY_NAME,
    radiusMeters: LAND_OFFICE_RADIUS_METERS,
    footprint: LAND_OFFICE_FOOTPRINT,
    click: cube !== null ? { entity: cube, hoverText: 'Open Land & Claim Office' } : undefined,
    onEnter: () => {
      closed = false
      selected = null
      focusPanel('land-office')
    },
    onClick: () => {
      if (!closed) return
      closed = false
      selected = null
      focusPanel('land-office')
    }
  })
  registerPanel('land-office', closeLandOfficePanel)

  console.log(`[land-office] catalogue: ${itemsOf('housing').map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
