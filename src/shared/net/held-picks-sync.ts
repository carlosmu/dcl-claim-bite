// Which pick each player here has in hand, as the one copy everybody sees.
//
// The pick in your own hand is drawn from your wallet message the moment it lands. Everyone
// else's comes from here: the server lists who holds what, and each client hangs those
// models on the matching avatars.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's held-picks entity with its client-side counterpart. */
export const HELD_PICKS_ENTITY_ENUM_ID = 5

// One entry per player in the scene with a pick in hand. `pickId` is a catalogue id.
export const HeldPicks = engine.defineComponent('claimbite:HeldPicks', {
  picks: Schemas.Array(
    Schemas.Map({
      address: Schemas.String,
      pickId: Schemas.String
    })
  )
})

// Only the server says who holds what.
HeldPicks.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
