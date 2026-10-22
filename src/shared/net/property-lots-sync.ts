// Who has a property standing in town, and on which lot, as the one copy everybody sees.
//
// Each kind of property has its own area, a plane in the scene split into a grid of lots. The
// server hands the lots out (it has no scene, so it only deals in lot numbers); each client
// maps a lot onto the area, the same way the M.U.L.E. yard does.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's lots entity with its client-side counterpart. */
export const PROPERTY_LOTS_ENTITY_ENUM_ID = 7

/** The housing tiers that stand in the world. The wagon has no lot. */
export type PropertyKind = 'cabin' | 'house'

type PropertyArea = {
  /** The plane in the scene the lots are laid over. */
  areaName: string
  /**
   * A lot's width (X) and depth (Z) in metres, the street in front included: the model brings
   * its own half of the street, so lots sit edge to edge.
   */
  spacingX: number
  spacingZ: number
  /**
   * How many lots the server may hand out. Matches the area at the spacing above; a client
   * drops any lot its own grid has no room for.
   */
  maxLots: number
}

export const PROPERTY_AREAS: Record<PropertyKind, PropertyArea> = {
  // 40 x 80 m at 6 x 8 m: 6 x 10.
  cabin: { areaName: 'Cabins_Area', spacingX: 6, spacingZ: 8, maxLots: 60 },
  // 40 x 80 m at 8 x 10 m: 5 x 8.
  house: { areaName: 'Houses_Area', spacingX: 8, spacingZ: 10, maxLots: 40 }
}

export const PROPERTY_KINDS = Object.keys(PROPERTY_AREAS) as PropertyKind[]

// One entry per standing property. `lot` counts across its area's grid row by row; `name` is
// the owner's display name as the server saw it.
export const PropertyLots = engine.defineComponent('claimbite:PropertyLots', {
  lots: Schemas.Array(
    Schemas.Map({
      kind: Schemas.String,
      lot: Schemas.Int,
      address: Schemas.String,
      name: Schemas.String
    })
  )
})

// Only the server hands out lots. Otherwise a client could build on someone else's.
PropertyLots.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
