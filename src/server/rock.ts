// The shared rocks: where they are, and moving each one on when it pays.
//
// The server has no scene, so it picks each spot as a fraction of `Mining_Area` (0..1 on each
// side) and every client maps it onto the area's mesh.

import { engine } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'

import { ActiveRock, pickRockSpot, ROCK_ENTITY_ENUM_ID, ROCKS_AT_ONCE } from '../shared/net/rock-sync'

let rockEntity = engine.RootEntity

/** The next seq to hand out. Never reused, so a seq names one rock for good. */
let nextSeq = 0

/**
 * Who has already finished each rock, by seq. Each player mines each rock once: with company
 * a rock waits for everyone on it, but nobody gets a second bar out of it.
 */
const finishers = new Map<number, Set<string>>()

function newRock(taken: { u: number; v: number }[]): { u: number; v: number; yaw: number; seq: number } {
  const seq = nextSeq++
  finishers.set(seq, new Set())
  return { ...pickRockSpot(taken), yaw: Math.random() * 360, seq }
}

export function setupRock(): void {
  rockEntity = engine.addEntity()
  const rocks: { u: number; v: number; yaw: number; seq: number }[] = []
  for (let i = 0; i < ROCKS_AT_ONCE; i++) rocks.push(newRock(rocks))
  ActiveRock.create(rockEntity, { rocks })
  syncEntity(rockEntity, [ActiveRock.componentId], ROCK_ENTITY_ENUM_ID)
}

/** The seqs of the rocks standing now. */
export function getRockSeqs(): number[] {
  return ActiveRock.get(rockEntity).rocks.map((rock) => rock.seq)
}

/** Whether `seq` is a rock standing now; anything else is an old rock, or made up. */
export function isRock(seq: number): boolean {
  return finishers.has(seq)
}

export function hasFinishedRock(address: string, seq: number): boolean {
  return finishers.get(seq)?.has(address) ?? false
}

/** Records a finished bar. */
export function markFinished(address: string, seq: number): void {
  finishers.get(seq)?.add(address)
}

/** How many players have finished the rock `seq`, `address` left out. */
export function otherFinishers(address: string, seq: number): number {
  const done = finishers.get(seq)
  if (done === undefined) return 0
  return done.size - (done.has(address) ? 1 : 0)
}

/** Whether anyone has finished the rock `seq` — it is spent once they all have. */
export function isRockStarted(seq: number): boolean {
  return (finishers.get(seq)?.size ?? 0) > 0
}

/** Replaces the rock `seq` with a new one at a random spot, clear of all the others. */
export function advanceRock(seq: number): void {
  const rocks = ActiveRock.getMutable(rockEntity).rocks
  const index = rocks.findIndex((rock) => rock.seq === seq)
  if (index < 0) return
  finishers.delete(seq)
  rocks[index] = newRock(rocks)
}
