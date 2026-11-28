import { ColliderLayer, engine, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { worldPoint } from './properties'
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

/** BUY sells homes; SELL is the bank buying the player's home back. Every visit opens on BUY. */
export type LandOfficeTab = 'buy' | 'sell'
let tab: LandOfficeTab = 'buy'

export function getLandOfficeTab(): LandOfficeTab {
  return tab
}

export function setLandOfficeTab(next: LandOfficeTab): void {
  tab = next
}

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

/** How far in front of the officer a player sent to the office is set down: inside the zone, so it opens. */
const VISIT_OFFICER_METERS = 2.5
/** What that player looks at: the officer, about head high. */
const VISIT_LOOK_HEIGHT_METERS = 1.6
/** The tab the office opens on the next time the player walks up, instead of BUY. */
let nextVisitTab: LandOfficeTab | null = null

/**
 * Sets the player down in front of the officer, facing him, and has the office open on `openOn`.
 * Assumes the officer faces his local +Z; flip the sign if players land behind the counter.
 */
export function goToLandOffice(openOn: LandOfficeTab = 'buy'): void {
  const officer = engine.getEntityOrNullByName(LAND_OFFICER_ENTITY_NAME)
  if (officer === null) return
  // Already there: walking up will not fire again, so open it now.
  if (isPlayerAtLandOffice()) {
    closed = false
    selected = null
    tab = openOn
    focusPanel('land-office')
    return
  }
  const position = worldPoint(officer, Vector3.create(0, 0, VISIT_OFFICER_METERS))
  const lookAt = worldPoint(officer, Vector3.create(0, VISIT_LOOK_HEIGHT_METERS, 0))
  nextVisitTab = openOn
  movePlayerTo({ newRelativePosition: position, cameraTarget: lookAt, avatarTarget: lookAt }).catch((error) => {
    nextVisitTab = null
    console.error('[land-office] could not take the player to the office', error)
  })
}

function openingTab(): LandOfficeTab {
  const next = nextVisitTab ?? 'buy'
  nextVisitTab = null
  return next
}

export function setupLandOffice(): void {
  const officer = engine.getEntityOrNullByName(LAND_OFFICER_ENTITY_NAME)
  // His visible meshes take the pointer too: the model may have no invisible collider to click.
  const model = officer === null ? null : GltfContainer.getMutableOrNull(officer)
  if (model !== null) model.visibleMeshesCollisionMask = (model.visibleMeshesCollisionMask ?? 0) | ColliderLayer.CL_POINTER
  zone = createProximityZone({
    entityName: LAND_OFFICER_ENTITY_NAME,
    radiusMeters: LAND_OFFICE_RADIUS_METERS,
    click: officer !== null ? { entity: officer, hoverText: 'hover.landOffice' } : undefined,
    onEnter: () => {
      closed = false
      selected = null
      tab = openingTab()
      focusPanel('land-office')
    },
    onClick: () => {
      if (!closed) return
      closed = false
      selected = null
      tab = 'buy'
      focusPanel('land-office')
    }
  })
  registerPanel('land-office', closeLandOfficePanel)

  console.log(`[land-office] catalogue: ${itemsOf('housing').map((i) => `${i.label} ${i.price}c`).join(' · ')}`)
}
