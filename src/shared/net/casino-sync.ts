// The town's jackpot, as the one copy everybody sees. The server keeps it (server/casino.ts).

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

import { JACKPOT_MIN } from '../economy/slots'

/** Pairs the server's jackpot entity with its client-side counterpart. */
export const CASINO_ENTITY_ENUM_ID = 10

export const CasinoJackpot = engine.defineComponent('claimbite:CasinoJackpot', {
  /** Whole coins in the pot. */
  pot: Schemas.Number
})

// Only the server moves the pot.
CasinoJackpot.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)

/** The pot as the server last said; its minimum before it has. */
export function getJackpot(): number {
  for (const [, jackpot] of engine.getEntitiesWith(CasinoJackpot)) return jackpot.pot
  return JACKPOT_MIN
}
