import { ColliderLayer, engine, GltfContainer } from '@dcl/sdk/ecs'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { itemsOf } from '../shared/economy/catalogue'

// The Land & Claim Office: where housing is sold. Buying goes through the same `buy` message
// and the same server checks as the Market (`shop/shop.ts`); only the counter is different.
//
// What is bought here stands in its kind's area (`properties.ts`); the wagon has no lot.

/** The officer at the counter: clicking him opens the office, and walking up to him does too. */
const LAND_OFFICER_ENTITY_NAME = 'land_officer'
export const LAND_OFFICE_RADIUS_METERS = 4
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
  const officer = engine.getEntityOrNullByName(LAND_OFFICER_ENTITY_NAME)
  // His visible meshes take the pointer too: the model may have no invisible collider to click.
  const model = officer === null ? null : GltfContainer.getMutableOrNull(officer)
  if (model !== null) model.visibleMeshesCollisionMask = (model.visibleMeshesCollisionMask ?? 0) | ColliderLayer.CL_POINTER
  zone = createProximityZone({
    entityName: LAND_OFFICER_ENTITY_NAME,
    radiusMeters: LAND_OFFICE_RADIUS_METERS,
    click: officer !== null ? { entity: officer, hoverText: 'Open Land & Claim Office' } : undefined,
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
