import { engine } from '@dcl/sdk/ecs'

import { getHitsPerRock } from '../net/economy-link'
import { getPracticeRocksMined } from '../mining/rocks'
import { getIntroChoice, isWelcomePlaying } from './intro-state'

// The moments of a visit, one after the other, so everything that can come up on screen asks
// one place whether now is its time:
//
//   title   the title card: loading, Start Game. Only what a stuck player must see (the update
//           and RECONNECT screens) comes up over it.
//   intro   the opening: the mayor's welcome and, for a new player, the pick and their first
//           practice rock. Nothing interrupts it: no objective cards, no letters (coins owed),
//           no update screens. They wait for play.
//   play    the game proper. Everything may come up.
//
// It only moves forward. A new phase goes here, in order, with what it lets through.

export type GamePhase = 'title' | 'intro' | 'play'

/** A new player's intro ends once they have mined this many of the mayor's practice rocks. */
const INTRO_PRACTICE_ROCKS = 1

/**
 * The intro never lasts longer than this, in seconds. A new player who wanders off without
 * mining still gets their notices, the update screen above all: without it they would play on an
 * old version where nothing is saved.
 */
const INTRO_MAX_SECONDS = 180

let phase: GamePhase = 'title'
/** Whether this visit started with no pick: their intro waits for the practice rock. */
let newPlayer = false
let introSeconds = 0

export function getGamePhase(): GamePhase {
  return phase
}

/** The game proper: notices, letters and alerts may come up. */
export function isPlaying(): boolean {
  return phase === 'play'
}

/** Whether a screen that stops the player (update, rejoin) may come up now: not over the intro. */
export function canShowBlockingScreen(): boolean {
  return phase !== 'intro'
}

function enter(next: GamePhase, why: string): void {
  phase = next
  console.log(`[phase] ${next} (${why})`)
}

function gamePhaseSystem(dt: number): void {
  if (phase === 'title') {
    if (getIntroChoice() === 'pending') return
    // Skip intro is only offered to a player who has a pick, so a skip is never a new player.
    newPlayer = getIntroChoice() === 'start' && getHitsPerRock() <= 0
    introSeconds = 0
    enter('intro', newPlayer ? 'new player' : 'returning player')
  }

  if (phase === 'intro') {
    introSeconds += dt
    const practised = !newPlayer || getPracticeRocksMined() >= INTRO_PRACTICE_ROCKS
    if (!isWelcomePlaying() && practised) enter('play', 'intro done')
    else if (introSeconds >= INTRO_MAX_SECONDS) enter('play', 'intro timed out')
  }

  if (phase === 'play') engine.removeSystem(gamePhaseSystem)
}

export function setupGamePhase(): void {
  engine.addSystem(gamePhaseSystem, undefined, 'client:game-phase')
}
