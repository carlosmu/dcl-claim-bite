import { ColliderLayer, engine, GltfContainer } from '@dcl/sdk/ecs'

import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { findRewardCampaign, RewardStatus } from '../shared/rewards'
import { sendClaimReward } from '../net/economy-link'

// The Claim Office: where rewards are handed out, apart from anything that is sold. One card per
// campaign (shared/rewards.ts), shown in the Land Office's layout with the quest it takes to get
// it. Opens like the Land Office: walking up to the clerk, or clicking them.
//
// The quests' progress is the server's word (`rewardStatus`); this only mirrors it.

/** The clerk behind the counter in the Creator Hub scene: walking up to them or clicking them opens the office. */
const CLAIM_OFFICER_ENTITY_NAME = 'claim_officer'
export const CLAIM_OFFICE_RADIUS_METERS = 4

let zone: ProximityZone | null = null
let closed = false

/** Where the player stands with each campaign, by its id. Empty until the server says. */
let statuses = new Map<string, RewardStatus>()
/** The last refusal of a claim and the campaign it was for, shown under its button until the next try. */
let claimError = ''
let claimErrorFor = ''

export function isClaimOfficePanelOpen(): boolean {
  return zone !== null && zone.isPlayerInside() && !closed
}

export function closeClaimOfficePanel(): void {
  closed = true
  zone?.release()
}

/** Where the player stands with a campaign: nothing done until the server says otherwise. */
export function getRewardStatus(campaignId: string): RewardStatus {
  return statuses.get(campaignId) ?? { id: campaignId, done: [], claimed: false, claiming: false }
}

export function getRewardClaimError(campaignId: string): string {
  return claimErrorFor === campaignId ? claimError : ''
}

/** Every step of the campaign's quest is done and it has not been claimed yet. */
export function canClaimReward(campaignId: string): boolean {
  const campaign = findRewardCampaign(campaignId)
  if (campaign === null) return false
  const status = getRewardStatus(campaignId)
  return !status.claimed && !status.claiming && campaign.steps.every((step) => status.done.includes(step))
}

export function claimReward(campaignId: string): void {
  if (!canClaimReward(campaignId)) return
  claimError = ''
  claimErrorFor = campaignId
  sendClaimReward(campaignId)
}

/** Fed every `rewardStatus` from the economy link. */
export function applyRewardStatus(next: RewardStatus[]): void {
  statuses = new Map(next.map((status) => [status.id, status]))
}

/** Fed the `claimReward` action results: the answer to the last claim sent. */
export function onRewardClaimResult(ok: boolean, detail: string): void {
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
