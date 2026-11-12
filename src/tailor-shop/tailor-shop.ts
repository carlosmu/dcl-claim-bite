import { ColliderLayer, engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'

import { focusPanel, registerPanel } from '../world/panel-focus'
import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { rewardCampaignsAt } from '../shared/rewards'
import { canClaimReward, claimReward, getRewardStatus } from '../claim-office/claim-office'
import { getCoins } from '../shared/state/wallet'

// The Tailor Shop: wearables and emotes sold for coins. Each item is a Rewards campaign
// (shared/rewards.ts, venue 'tailor') with a price and no quest, bought through the same claim as
// the Claim Office's gifts: the server takes the coins and asks the Rewards service, and gives
// the coins back if it says no. Opens like the Claim Office: walking up to the clerk, or clicking.

/** The clerk behind the counter. Taken from the Creator Hub scene when there is one by this name. */
const TAILOR_ENTITY_NAME = 'tailor_officer'
/** The building, for a clerk placed in code while the scene has none. */
const TAILOR_SHOP_ENTITY_NAME = 'Tailor Shop'
/** Where that clerk stands in the building: the Claim Office's spot, the buildings being alike. */
const TAILOR_CLERK_LOCAL_POSITION = { x: -8, y: 0.75, z: -2.75 }
const TAILOR_CLERK_MODEL = 'assets/models/bank_officer.glb'
export const TAILOR_SHOP_RADIUS_METERS = 4

let zone: ProximityZone | null = null
let closed = false
let selectedId = rewardCampaignsAt('tailor')[0]?.id ?? ''

export function isTailorShopPanelOpen(): boolean {
  return zone !== null && zone.isPlayerInside() && !closed
}

export function closeTailorShopPanel(): void {
  closed = true
  zone?.release()
}

export function getSelectedTailorItem(): string {
  return selectedId
}

export function selectTailorItem(id: string): void {
  selectedId = id
}

/** On sale, not owned, not being bought, quest met (none, for now) and the coins in the purse. */
export function canBuyTailorItem(id: string): boolean {
  const item = rewardCampaignsAt('tailor').find((campaign) => campaign.id === id)
  if (item === undefined || item.comingSoon) return false
  return canClaimReward(id) && getCoins() >= item.price
}

export function buyTailorItem(id: string): void {
  if (!canBuyTailorItem(id)) return
  claimReward(id)
}

export function isTailorItemOwned(id: string): boolean {
  return getRewardStatus(id).claimed
}

/** The clerk from the scene, or one stood behind the Tailor Shop's counter while the scene has none. */
function findOrPlaceClerk(): Entity | null {
  const authored = engine.getEntityOrNullByName(TAILOR_ENTITY_NAME)
  if (authored !== null) return authored
  const shop = engine.getEntityOrNullByName(TAILOR_SHOP_ENTITY_NAME)
  if (shop === null) return null
  const clerk = engine.addEntity()
  Transform.create(clerk, { position: TAILOR_CLERK_LOCAL_POSITION, parent: shop })
  GltfContainer.create(clerk, { src: TAILOR_CLERK_MODEL })
  return clerk
}

export function setupTailorShop(): void {
  const clerk = findOrPlaceClerk()
  // Their visible meshes take the pointer too: the model may have no invisible collider to click.
  const model = clerk === null ? null : GltfContainer.getMutableOrNull(clerk)
  if (model !== null) model.visibleMeshesCollisionMask = (model.visibleMeshesCollisionMask ?? 0) | ColliderLayer.CL_POINTER

  const open = () => {
    closed = false
    focusPanel('tailor-shop')
  }
  zone = createProximityZone({
    entityName: TAILOR_ENTITY_NAME,
    entity: clerk ?? undefined,
    radiusMeters: TAILOR_SHOP_RADIUS_METERS,
    click: clerk !== null ? { entity: clerk, hoverText: 'Open Tailor Shop' } : undefined,
    onEnter: open,
    onClick: () => {
      if (closed) open()
    }
  })
  registerPanel('tailor-shop', closeTailorShopPanel)
}
