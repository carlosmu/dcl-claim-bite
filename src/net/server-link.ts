// The receiving half of the heartbeat: what the client knows about the server's health.
//
// "Online" is not a flag the server sets — it is an inference the client draws from the tick
// still moving. That way a server that dies without saying goodbye still reads as offline,
// which is the case the indicator exists for.

import { engine } from '@dcl/sdk/ecs'

import { HEARTBEAT_TIMEOUT_SECONDS, ServerHeartbeat } from '../shared/net/heartbeat'

let lastTick = -1
let sinceLastChange = 0
let everSeen = false

/** The last tick the server published, or -1 before the first one arrives. */
export function getServerTick(): number {
  return lastTick
}

/** False until the first heartbeat lands, and again once one stops arriving. */
export function isServerOnline(): boolean {
  return everSeen && sinceLastChange < HEARTBEAT_TIMEOUT_SECONDS
}

function watchHeartbeat(dt: number) {
  // The entity is created by the server and arrives through sync, so it is not here on the
  // first frames. Scanning by component avoids having to guess when that happens.
  for (const [, heartbeat] of engine.getEntitiesWith(ServerHeartbeat)) {
    if (heartbeat.tick === lastTick) continue
    lastTick = heartbeat.tick
    sinceLastChange = 0
    everSeen = true
    return
  }

  sinceLastChange += dt
}

export function setupServerLink(): void {
  engine.addSystem(watchHeartbeat, undefined, 'client:server-link')
}
