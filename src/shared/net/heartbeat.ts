// The server's pulse, and the one thing both halves of the scene agree on.
//
// This exists to answer a question the HUD asks: is the authoritative server actually there?
// A client on its own cannot tell the difference between "the server is up and quiet" and
// "the server is gone", so the server has to say so out loud, on a clock.
//
// Imported by both runtimes, so it stays free of anything that draws.

import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/** How often the server bumps the tick. Also the client's yardstick for going stale. */
export const HEARTBEAT_PERIOD_SECONDS = 1

/**
 * Silence longer than this and the client calls the server offline. Three beats rather than
 * one: a single missed frame or a hiccup in the network should not flip the label to red.
 */
export const HEARTBEAT_TIMEOUT_SECONDS = HEARTBEAT_PERIOD_SECONDS * 3

/**
 * Fixed id so both runtimes name the same entity. syncEntity's third argument is what pairs
 * a server-created entity with its client-side counterpart; without it the client would be
 * looking for an entity the server never agreed on.
 */
export const HEARTBEAT_ENTITY_ENUM_ID = 1

// Int64, not Number: the tick is small today, but Schemas.Number is a float32 and starts
// dropping whole integers past ~16.7M — about six months of ticking at one per second.
export const ServerHeartbeat = engine.defineComponent('claimbite:ServerHeartbeat', {
  tick: Schemas.Int64
})

// Nothing but the server may write this. Without it, a modified client could publish its own
// heartbeat and the indicator would cheerfully report a server that is not running.
ServerHeartbeat.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
