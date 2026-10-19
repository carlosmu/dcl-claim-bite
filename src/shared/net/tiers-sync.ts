// Every present player's tier, as the one copy everybody sees, so each client can tag the
// avatars around it. The tier is the best property owned — not ore, coins or rigs.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

import { itemsOf, ownedTier, ShopItemId } from '../economy/catalogue'

/** Pairs the server's tiers entity with its client-side counterpart. */
export const PLAYER_TIERS_ENTITY_ENUM_ID = 8

/**
 * 1 for the wagon everyone starts with (or nothing at all), then one per housing step:
 * cabin 2, house 3, ranch 4.
 */
export function housingTier(ownedCount: (id: ShopItemId) => number): number {
  const top = ownedTier('housing', ownedCount)
  return top === null ? 1 : itemsOf('housing').indexOf(top) + 1
}

export const PlayerTiers = engine.defineComponent('claimbite:PlayerTiers', {
  players: Schemas.Array(
    Schemas.Map({
      address: Schemas.String,
      tier: Schemas.Int
    })
  )
})

// Only the server sets tiers. Otherwise a client could crown itself.
PlayerTiers.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
