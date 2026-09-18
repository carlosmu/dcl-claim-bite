import { engine } from '@dcl/sdk/ecs'

import { ORE_PER_ROCK } from '../shared/economy/constants'

// The "+5 Ore" that jumps out of a finished rock: big, centred, drifting up and fading out.
//
// State only — the drawing is in ui.tsx. One popup at a time: a second rock restarts it rather
// than stacking, since the payout is the same every time and two overlapping numbers read as
// a glitch.

/** How long it takes to rise and fade. */
const DURATION_SECONDS = 1

/** How far up it travels, as a share of screen height (the "10vh" of the design). */
export const RISE_SHARE = 0.1

let amount = 0
let bonus = 0
let elapsed = DURATION_SECONDS

export type OrePopup = {
  amount: number
  /** The boom-town part, once the server has said. Zero draws no second line. */
  bonus: number
  /** 0 at the rock, 1 fully risen and gone. */
  progress: number
}

/** The popup to draw, or null when there is none. */
export function getOrePopup(): OrePopup | null {
  if (elapsed >= DURATION_SECONDS) return null
  return { amount, bonus, progress: elapsed / DURATION_SECONDS }
}

/** Starts the popup over, with a new number. */
export function showOrePopup(ore: number): void {
  amount = ore
  bonus = 0
  elapsed = 0
}

/**
 * Adds the social bonus under the popup. It arrives a round trip after the "+5 Ore", so it
 * joins the popup still on screen; if that one is already gone, it starts a fresh one.
 */
export function showSocialBonus(ore: number): void {
  if (elapsed >= DURATION_SECONDS) {
    amount = ORE_PER_ROCK
    elapsed = 0
  }
  bonus = ore
}

function update(dt: number): void {
  if (elapsed < DURATION_SECONDS) elapsed += dt
}

export function setupOrePopup(): void {
  engine.addSystem(update, undefined, 'client:ore-popup')
}
