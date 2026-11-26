// The Tailor Shop's items that have run out, as the one copy everybody sees. The server counts
// what each dispenser has handed over (server/reward-stock.ts) and lists here the ones with none left.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's stock entity with its client-side counterpart. */
export const REWARD_STOCK_ENTITY_ENUM_ID = 11

export const RewardStock = engine.defineComponent('claimbite:RewardStock', {
  /** The ids (shared/rewards.ts) of the items with none left to sell. */
  soldOut: Schemas.Array(Schemas.String)
})

// Only the server says what is sold out.
RewardStock.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Whether the server has said this item has none left. */
export function isRewardOutOfStock(id: string): boolean {
  for (const [, stock] of engine.getEntitiesWith(RewardStock)) return stock.soldOut.includes(id)
  return false
}
