// The town's ore price, as the one copy everybody sees.
//
// Until now `shared/state/market.ts` kept a `price` per client, which meant the GDD's shared
// market was a fiction: every player watched their own private number drift. The price now
// lives here, written by the server and read by everyone — so a sale by one player is felt
// by the next, which is what §9 means by "the market price shifts from player behaviour".

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's market entity with its client-side counterpart. */
export const MARKET_ENTITY_ENUM_ID = 2

export const OreMarket = engine.defineComponent('claimbite:OreMarket', {
  price: Schemas.Number
})

// Only the server prices ore. Otherwise a client could set the price to anything and then
// sell into it.
OreMarket.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
