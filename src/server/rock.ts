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

/** Rocks in the scene, as last reported by a client. Kept for moves the server starts itself. */
let knownCount = 1

/**
 * Who has already finished the rock showing now. Each player mines each rock once: with
 * company the rock waits for everyone on it, but nobody gets a second bar out of it.
 */
const finishers = new Set<string>()

export function setupRock(): void {
  rockEntity = engine.addEntity()
  ActiveRock.create(rockEntity, { index: 0, seq: 0 })
  syncEntity(rockEntity, [ActiveRock.componentId], ROCK_ENTITY_ENUM_ID)
}

/** The seq of the rock showing now; a swing reported with another seq was at an old rock. */
export function getRockSeq(): number {
  return ActiveRock.get(rockEntity).seq
}

export function hasFinishedRock(address: string): boolean {
  return finishers.has(address)
}

/** Records a finished bar, and the rock count the finisher's scene reported. */
export function markFinished(address: string, reportedCount: number): void {
  finishers.add(address)
  knownCount = Math.max(1, Math.min(MAX_ROCKS, Math.floor(reportedCount) || 1))
}

/** How many players have finished the rock showing now, `address` left out. */
export function otherFinishers(address: string): number {
  return finishers.size - (finishers.has(address) ? 1 : 0)
}

/** Whether anyone has finished the rock showing now — the rock is spent once they all have. */
export function isRockStarted(): boolean {
  return finishers.size > 0
}

/** Moves the rock to another one, never the same one twice in a row. */
export function advanceRock(): void {
  finishers.clear()
  const count = knownCount
  const rock = ActiveRock.getMutable(rockEntity)

  const current = rock.index % count
  let next = Math.floor(Math.random() * count)
  if (count > 1 && next === current) next = (next + 1) % count

  rock.index = next
  rock.seq += 1
}
