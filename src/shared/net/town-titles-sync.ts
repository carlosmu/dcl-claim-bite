// The town board: who holds each title and who bought a property lately, as the one copy
// everybody sees. The server decides all of it (server/titles.ts); clients only draw it.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** Pairs the server's board entity with its client-side counterpart. */
export const TOWN_TITLES_ENTITY_ENUM_ID = 9

export const TownTitles = engine.defineComponent('claimbite:TownTitles', {
  titles: Schemas.Array(
    Schemas.Map({
      id: Schemas.String,
      address: Schemas.String,
      name: Schemas.String,
      value: Schemas.Float,
      /** Nobody earned it in the last seven days, so this is last week's holder. */
      previous: Schemas.Boolean
    })
  ),
  owners: Schemas.Array(
    Schemas.Map({
      kind: Schemas.String,
      address: Schemas.String,
      name: Schemas.String
    })
  ),
  /** The town's economy over the last seven days, or the seven before (weekPrevious); shared/titles.ts, DayStats. For the board in the plaza. */
  week: Schemas.Map({
    hand: Schemas.Float,
    rig: Schemas.Float,
    oreSold: Schemas.Float,
    bankPaid: Schemas.Float,
    coinsIn: Schemas.Float,
    coinsOut: Schemas.Float,
    purchases: Schemas.Float
  }),
  /** The last seven days had nothing, so `week` is the seven before. */
  weekPrevious: Schemas.Boolean,
  /** Every player's coins right now, added up (server/coin-ledger.ts); -1 until the server knows. Not a weekly figure. */
  circulation: Schemas.Float
})

// Only the server hands out titles. Otherwise a client could crown itself.
TownTitles.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** The board as the server last said; null before it has. */
export function getTownTitles() {
  for (const [, board] of engine.getEntitiesWith(TownTitles)) return board
  return null
}
