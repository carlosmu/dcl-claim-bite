// The headless half of the scene.
//
// Runs the same bundle as the client, with no renderer: no UI, no audio, no emotes. Its job
// in this first step is only to prove the authoritative runtime boots and can see players —
// the economy still lives on the client and moves here next (design/gdd.md §9, week 2).
//
// Anything imported from here must stay free of ECS rendering components and React: the
// server has no screen to draw on. `src/shared` is the side of the tree that satisfies that.

import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'

import { setupHeartbeat } from './heartbeat'
import { setupEconomy } from './economy'
import { setupRock } from './rock'

/** How often the roll call runs. Once a second is plenty for a log line. */
const ROLL_CALL_PERIOD_SECONDS = 1

let sinceLastRollCall = 0
let lastCount = -1

// Positions are read from PlayerIdentityData + Transform rather than from anything a client
// sends, because this is the only copy the client cannot lie about. Nothing depends on it
// yet; it is here so the next step (validating a swing) already has its ground truth.
function rollCall(dt: number) {
  sinceLastRollCall += dt
  if (sinceLastRollCall < ROLL_CALL_PERIOD_SECONDS) return
  sinceLastRollCall = 0

  let count = 0
  for (const [entity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (Transform.getOrNull(entity) === null) continue
    count += 1
  }

  // Only on change: a line every second would bury everything else in the log.
  if (count === lastCount) return
  lastCount = count
  console.log(`[Server] players in scene: ${count}`)
}

export function server(): void {
  console.log('[Server] Claim Bite authoritative server up')
  setupHeartbeat()
  setupEconomy()
  setupRock()
  engine.addSystem(rollCall, undefined, 'server:roll-call')
}
