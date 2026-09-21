// The shared rock: where it is, and moving it on when it pays.
//
// The server has no scene, so it picks the spot as a fraction of `Mining_Area` (0..1 on each
// side) and every client maps it onto the area's mesh.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { ActiveRock, ROCK_ENTITY_ENUM_ID } from '../shared/net/rock-sync'

/**
 * How far the next spot must be from the last one, as a fraction of the area. Keeps a move
 * from landing on top of the rock just mined. Tries a few times, then takes what it got.
 */
const MIN_MOVE = 0.3
const MOVE_TRIES = 8

let rockEntity = engine.RootEntity

/**
 * Who has already finished the rock showing now. Each player mines each rock once: with
 * company the rock waits for everyone on it, but nobody gets a second bar out of it.
 */
const finishers = new Set<string>()

export function setupRock(): void {
  rockEntity = engine.addEntity()
  ActiveRock.create(rockEntity, { u: Math.random(), v: Math.random(), yaw: Math.random() * 360, seq: 0 })
  syncEntity(rockEntity, [ActiveRock.componentId], ROCK_ENTITY_ENUM_ID)
}

/** The seq of the rock showing now; a swing reported with another seq was at an old rock. */
export function getRockSeq(): number {
  return ActiveRock.get(rockEntity).seq
}

export function hasFinishedRock(address: string): boolean {
  return finishers.has(address)
}

/** Records a finished bar. */
export function markFinished(address: string): void {
  finishers.add(address)
}

/** How many players have finished the rock showing now, `address` left out. */
export function otherFinishers(address: string): number {
  return finishers.size - (finishers.has(address) ? 1 : 0)
}

/** Whether anyone has finished the rock showing now — the rock is spent once they all have. */
export function isRockStarted(): boolean {
  return finishers.size > 0
}

/** Moves the rock to a new random spot in the area, away from the one it leaves. */
export function advanceRock(): void {
  finishers.clear()
  const rock = ActiveRock.getMutable(rockEntity)

  let u = Math.random()
  let v = Math.random()
  for (let i = 1; i < MOVE_TRIES && Math.hypot(u - rock.u, v - rock.v) < MIN_MOVE; i++) {
    u = Math.random()
    v = Math.random()
  }

  rock.u = u
  rock.v = v
  rock.yaw = Math.random() * 360
  rock.seq += 1
}
