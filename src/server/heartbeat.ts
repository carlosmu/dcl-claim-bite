// The sending half of the heartbeat. Server-only: it writes the component nobody else may.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import {
  HEARTBEAT_ENTITY_ENUM_ID,
  HEARTBEAT_PERIOD_SECONDS,
  ServerHeartbeat
} from '../shared/net/heartbeat'

let sinceLastBeat = 0
let tick = 0

export function setupHeartbeat(): void {
  const entity = engine.addEntity()
  ServerHeartbeat.create(entity, { tick: 0 })
  syncEntity(entity, [ServerHeartbeat.componentId], HEARTBEAT_ENTITY_ENUM_ID)

  engine.addSystem(
    (dt: number) => {
      sinceLastBeat += dt
      if (sinceLastBeat < HEARTBEAT_PERIOD_SECONDS) return
      sinceLastBeat = 0

      tick += 1
      // getMutable rather than createOrReplace: a replace would ship a whole new component
      // every second, where a mutation ships the one field that changed.
      ServerHeartbeat.getMutable(entity).tick = tick
    },
    undefined,
    'server:heartbeat'
  )
}
