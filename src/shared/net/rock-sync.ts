// Where the rock is, as the one copy everybody sees.
//
// The rock used to be each client's own random pick, so two players standing together were
// mining two different rocks — and a bonus for mining side by side needs them at the same one.
// The server now picks, and every client shows the rock where this component says.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's rock entity with its client-side counterpart. */
export const ROCK_ENTITY_ENUM_ID = 3

// `u` and `v` are 0..1 across `Mining_Area` (the server has no scene, so it cannot pick in
// metres; each client maps them onto the area's mesh). `yaw` is the rock's turn in degrees.
// `seq` goes up by one every time the rock moves, so a client can tell "a new rock" from "the
// same rock" even if it lands close to where it was.
export const ActiveRock = engine.defineComponent('claimbite:ActiveRock', {
  u: Schemas.Float,
  v: Schemas.Float,
  yaw: Schemas.Float,
  seq: Schemas.Int64
})

// Only the server moves the rock. Otherwise a client could park it next to itself.
ActiveRock.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
