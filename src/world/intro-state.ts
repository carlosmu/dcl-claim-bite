// Where the player is in the opening: still on the title card, or past it — and how.
//
// Its own module so the mayor can ask without importing the title card or the welcome shot,
// both of which already import the mayor.

export type IntroChoice = 'pending' | 'start' | 'skip'

let choice: IntroChoice = 'pending'
let welcomePlaying = false

/** How the title card was left: 'pending' while it is still up. */
export function getIntroChoice(): IntroChoice {
  return choice
}

export function setIntroChoice(next: IntroChoice): void {
  choice = next
}

/** Whether the welcome shot (camera, bars, greeting) is running right now. */
export function isWelcomePlaying(): boolean {
  return welcomePlaying
}

export function setWelcomePlaying(playing: boolean): void {
  welcomePlaying = playing
}
