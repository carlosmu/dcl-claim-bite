import { ColliderLayer, engine, GltfContainer } from '@dcl/sdk/ecs'

import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { GiftStatus } from '../shared/gift'
import { sendClaimGift } from '../net/economy-link'

// The Claim Office: where rewards are handed out, apart from anything that is sold. For now a
// single item, the free wearable (shared/gift.ts), shown in the Land Office's layout with what it
// takes to get it. Opens like the Land Office: walking up to the clerk, or clicking them.
//
// The requirements are the server's word (`giftStatus`); this only mirrors them.

/** The clerk behind the counter in the Creator Hub scene: walking up to them or clicking them opens the office. */
const CLAIM_OFFICER_ENTITY_NAME = 'claim_officer'
export const CLAIM_OFFICE_RADIUS_METERS = 4

let zone: ProximityZone | null = null
let closed = false

let status: GiftStatus = { sold: false, bought: false, surveyed: false, claimed: false, claiming: false }
/** The last refusal of a claim, shown under the button until the next try. */
let claimError = ''

export function isClaimOfficePanelOpen(): boolean {
  return zone !== null && zone.isPlayerInside() && !closed
}

export function closeClaimOfficePanel(): void {
  closed = true
  zone?.release()
}

export function getGiftStatus(): GiftStatus {
  return status
}

export function getGiftClaimError(): string {
  return claimError
}

export function canClaimGift(): boolean {
  return status.sold && status.bought && status.surveyed && !status.claimed && !status.claiming
}

export function claimGift(): void {
  if (!canClaimGift()) return
  claimError = ''
  sendClaimGift()
}

/** Fed every `giftStatus` from the economy link. */
export function applyGiftStatus(next: GiftStatus): void {
  status = next
}

/** Fed the `claimGift` action results. */
export function onGiftClaimResult(ok: boolean, detail: string): void {
  claimError = ok ? '' : detail
}

export function setupClaimOffice(): void {
  const officer = engine.getEntityOrNullByName(CLAIM_OFFICER_ENTITY_NAME)
  // Their visible meshes take the pointer too: the model may have no invisible collider to click.
  const model = officer === null ? null : GltfContainer.getMutableOrNull(officer)
  if (model !== null) model.visibleMeshesCollisionMask = (model.visibleMeshesCollisionMask ?? 0) | ColliderLayer.CL_POINTER

  const open = () => {
    closed = false
    claimError = ''
    focusPanel('claim-office')
  }
  zone = createProximityZone({
    entityName: CLAIM_OFFICER_ENTITY_NAME,
    radiusMeters: CLAIM_OFFICE_RADIUS_METERS,
    click: officer !== null ? { entity: officer, hoverText: 'Open Claim Office' } : undefined,
    onEnter: open,
    onClick: () => {
      if (closed) open()
    }
  })
  registerPanel('claim-office', closeClaimOfficePanel)
}
