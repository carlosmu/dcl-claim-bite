import { QUESTION_BANK } from './lib/bank'
import { IntroSpec, QuestionSpec } from './lib/shared/series'

// Scene-specific feedback configuration.

// "Ask <id>" button per Question, top-left. Visible only in preview and to the World's
// owner/deployers, never to players. Still, turn off before release.
export const DEBUG = true

// Local preview only: the mobile layout on desktop, to check it without a phone. Ignored once
// deployed. Size the explorer window like a phone, e.g. 1600x720.
export const PREVIEW_MOBILE = false

// true: the game's ask() shows Questions only to participants (yes to the Intro, or feedback.enroll()).
// false: to everyone except players who said no.
export const ASK_PARTICIPANTS_ONLY = true

// Opt-in shown by feedback.intro(). Give feedback: participant. Skip / ×: no Questions this
// visit (Leave feedback still works). null: no Intro.
// avatar (optional), circle above the title:
// - left out: scene owner's face (scene.json "owner", else the World's owner)
// - a wallet address: that avatar's face
// - an image path ('assets/images/creator-avatar.png') or URL
// - null: none
export const INTRO: IntroSpec | null = {
  title: "Howdy from the Claim Bite team!",
  text: "We're testing how new prospectors find their feet in town. Would you answer three quick questions after your first purchase? Your answers help us make the start of the game better."
}

// Playtest goal: onboarding. Asked together after the first purchase (see src/playtest.ts), once
// the player has got a pick, mined, sold ore at the Bank and bought something. Onboarding set
// from QUESTION_BANK.md (F01, F05), adapted to the town, with T01 as the outcome question.
// Once live, never change a Question's text under its id: new wording, new id.
export const QUESTIONS = {
  // F01 → the scene's first step: the Mayor's pick and the rocks
  startMining: {
    text: 'How easy or difficult was it to work out how to start mining?',
    scale: 'EASE',
    commentPrompt: 'What most affected your rating? (optional)'
  },

  // F05 → the Bank, where ore first turns into coins
  sellingOre: {
    text: 'How easy or difficult was it to sell your ore at the Bank?',
    scale: 'EASE',
    commentPrompt: 'What most affected your rating? (optional)'
  },

  // T01, from the bank as is: the outcome of the first steps
  playMore: QUESTION_BANK.motivation.playMore
} satisfies Record<string, QuestionSpec>
