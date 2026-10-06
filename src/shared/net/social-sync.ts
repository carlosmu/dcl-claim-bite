// How many players are mining right now, as the one copy everybody sees.
//
// The server counts them (see `activeMiners` in server/economy.ts) and every client reads the
// count to show the Social Bonus while mining. The bonus actually paid is still worked out by
// the server at the moment a rock is finished; this is only what the HUD shows.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's entity with its client-side counterpart. */
export const SOCIAL_MINING_ENTITY_ENUM_ID = 6

export const SocialMining = engine.defineComponent('claimbite:SocialMining', {
  activeMiners: Schemas.Int
})

// Only the server counts. Otherwise a client could claim a crowd and the HUD would believe it.
SocialMining.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** Active miners as the server last said; zero before it has. */
export function getActiveMiners(): number {
  for (const [, social] of engine.getEntitiesWith(SocialMining)) return social.activeMiners
  return 0
}
