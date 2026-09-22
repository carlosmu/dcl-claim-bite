import { AudioSource, engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getHitsPerRock, sendClaimPick } from '../net/economy-link'
import { placeTutorialRock } from '../mining/rocks'
import { TUTORIAL_ROCK_SEQS } from '../shared/net/rock-sync'
import { playSubtitles } from '../world/subtitles'

// The town mayor, standing at spawn. Walking up to him with no pick gets you one — free, and
// as often as it takes (design/balance.md §2: pick tier 0 is the anti-soft-lock fallback).
//
// The server decides: this only asks. The pick appears in the hand when the wallet comes back
// saying it is owned (economy-link equips on every wallet).
//
// TBD: no hand-over animation yet, and the server does not check the player is at the mayor.

export const MAYOR_ENTITY_NAME = 'Town Mayor'
export const MAYOR_RADIUS_METERS = 2

/** Seconds between asks while standing there pickless. Covers a purse still loading on arrival
 * and a lost message, without spamming the server every frame. */
const ASK_RETRY_SECONDS = 2

// After the pick: the mayor sets a practice rock down beside himself and tells you to mine it.
const MINING_LINE = 'assets/sounds/mayor_mining.mp3'
const MINING_LINE_SUBTITLES = [
  { at: 0, text: 'Well done, stranger!' },
  { at: 2, text: 'Now head over to that rock\nand get your first gold nuggets!' }
]
// How long the subtitles stay up. Set to the clip's length once it is final.
const MINING_LINE_SECONDS = 6
// On his right, this far out.
const PRACTICE_ROCK_OFFSET = 3
// Once the first is mined, a second one this much further out on the same side.
const SECOND_PRACTICE_ROCK_EXTRA = 5
// Seconds after the pick lands, so the fist pump plays out first.
const PRACTICE_ROCK_DELAY_SECONDS = 1.5

let zone: ProximityZone | null = null
let practiceTimer = -1
let line: Entity | null = null
let sinceLastAsk = ASK_RETRY_SECONDS

function askForPick(dt: number): void {
  sinceLastAsk += dt
  if (zone === null || !zone.isPlayerInside()) return
  if (getHitsPerRock() > 0) return
  if (sinceLastAsk < ASK_RETRY_SECONDS) return

  sinceLastAsk = 0
  sendClaimPick()
}

/** Called when the mayor's pick has been handed over. Starts the practice rock's countdown. */
export function onMayorPickGiven(): void {
  practiceTimer = PRACTICE_ROCK_DELAY_SECONDS
}

function showPracticeRock(dt: number): void {
  if (practiceTimer < 0) return
  practiceTimer -= dt
  if (practiceTimer >= 0) return

  const mayor = engine.getEntityOrNullByName(MAYOR_ENTITY_NAME)
  const at = mayor === null ? null : Transform.getOrNull(mayor)
  if (at === null) return

  // He stands at the scene root, so his transform is already world space.
  const right = Vector3.rotate(Vector3.Right(), at.rotation ?? Quaternion.Identity())
  const [firstSeq, secondSeq] = TUTORIAL_ROCK_SEQS
  const first = Vector3.add(at.position, Vector3.scale(right, PRACTICE_ROCK_OFFSET))
  const second = Vector3.add(first, Vector3.scale(right, SECOND_PRACTICE_ROCK_EXTRA))
  placeTutorialRock(first, firstSeq, () => placeTutorialRock(second, secondSeq))

  // Heard the same wherever the player stands (global), like the welcome. A new entity each
  // time, so a second pick replays the line.
  if (line !== null) engine.removeEntity(line)
  line = engine.addEntity()
  Transform.create(line, { position: Vector3.add(at.position, Vector3.create(0, 1.6, 0)) })
  AudioSource.create(line, { audioClipUrl: MINING_LINE, playing: true, loop: false, volume: 1, global: true })
  playSubtitles(MINING_LINE_SUBTITLES, MINING_LINE_SECONDS)
}

export function setupMayor(): void {
  zone = createProximityZone({ entityName: MAYOR_ENTITY_NAME, radiusMeters: MAYOR_RADIUS_METERS })
  engine.addSystem(askForPick, undefined, 'client:mayor')
  engine.addSystem(showPracticeRock, undefined, 'client:mayor-practice')
}
