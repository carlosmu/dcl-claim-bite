// The shared rock: which one is showing, and moving it on when it pays.
//
// The server has no scene to count the rocks in, so it takes the count from the clients that
// finish them. Every client loads the same composite, so they all report the same number; it is
// clamped anyway, since it arrives in a message.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { ActiveRock, ROCK_ENTITY_ENUM_ID } from '../shared/net/rock-sync'

const MAX_ROCKS = 64

let rockEntity = engine.RootEntity

export function setupRock(): void {
  rockEntity = engine.addEntity()
  ActiveRock.create(rockEntity, { index: 0, seq: 0 })
  syncEntity(rockEntity, [ActiveRock.componentId], ROCK_ENTITY_ENUM_ID)
}

/** Moves the rock to another one, never the same one twice in a row. */
export function advanceRock(reportedCount: number): void {
  const count = Math.max(1, Math.min(MAX_ROCKS, Math.floor(reportedCount) || 1))
  const rock = ActiveRock.getMutable(rockEntity)

  const current = rock.index % count
  let next = Math.floor(Math.random() * count)
  if (count > 1 && next === current) next = (next + 1) % count

  rock.index = next
  rock.seq += 1
}
