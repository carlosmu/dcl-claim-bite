// Which rock of `Mining_Place` is showing, as the one copy everybody sees.
//
// The rock used to be each client's own random pick, so two players standing together were
// mining two different rocks — and a bonus for mining side by side needs them at the same one.
// The server now picks, and every client shows the rock this component names.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's rock entity with its client-side counterpart. */
export const ROCK_ENTITY_ENUM_ID = 3

// `index` is into the children of `Mining_Place`. `seq` goes up by one every time the rock
// moves, so a client can tell "a new rock" from "the same rock" even if the index repeats.
export const ActiveRock = engine.defineComponent('claimbite:ActiveRock', {
  index: Schemas.Int,
  seq: Schemas.Int64
})

// Only the server moves the rock. Otherwise a client could park it next to itself.
ActiveRock.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
