// Who parks a M.U.L.E. in the yard, and where, as the one copy everybody sees.
//
// Every rig owner gets a spot in the grid laid over `Mule_Area`. The server hands the spots out
// (it has no scene, so it only deals in slot numbers); each client maps a slot onto the area.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's yard entity with its client-side counterpart. */
export const MULE_YARD_ENTITY_ENUM_ID = 4

/** Spots across the area (X) and along it (Z); the spacing stretches to fill `Mule_Area`. */
export const MULE_YARD_COLUMNS = 8
export const MULE_YARD_ROWS = 8

/** How many slots the server may hand out: one per spot of the grid. */
export const MULE_YARD_MAX_SLOTS = MULE_YARD_COLUMNS * MULE_YARD_ROWS

// One entry per parked rig. `slot` counts across the grid row by row; `name` is the owner's
// display name as the server saw it; `level` drives the "xN" sign.
export const MuleYard = engine.defineComponent('claimbite:MuleYard', {
  mules: Schemas.Array(
    Schemas.Map({
      slot: Schemas.Int,
      address: Schemas.String,
      name: Schemas.String,
      level: Schemas.Int
    })
  )
})

// Only the server parks rigs. Otherwise a client could take someone else's spot.
MuleYard.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
