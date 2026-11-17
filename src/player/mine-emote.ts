import { AvatarEmoteCommand, engine, InputModifier } from '@dcl/sdk/ecs'
import { stopEmote, triggerSceneEmote } from '~system/RestrictedActions'

// The swing animation on the avatar itself, so a bystander sees the player mining rather than
// standing still — the §5 bystander test depends on the verb being visible from outside.
//
// This is a restricted action: it needs ALLOW_TO_TRIGGER_AVATAR_EMOTE in scene.json, which the
// scene already declares.
//
// Triggered ONCE as a loop, not once per swing. Re-triggering per swing made the avatar drop
// back toward idle and blend into the clip again between hits, which is the hitch at every
// repetition: the glitch was the blend, not the animation.

const MINE_EMOTE = 'assets/animations/mine_emote.glb'

/**
 * Whether this explorer can end a looping emote. The mobile explorer has no `stopEmote` at all
 * (calling it throws "is not a function"), and neither re-triggering nor moving the avatar ends
 * the loop there. Without it the swing is played once per hit instead: each one ends on its
 * own, so the avatar stops when the mining does — at the cost of the blend between swings.
 */
const CAN_STOP_LOOP = typeof stopEmote === 'function'

let looping = false

// --- Emotes of the player's own --------------------------------------------------------------
//
// An emote the player fires (the emote wheel, a hotkey) replaces the swing, and nothing here
// would know: the loop counted as running, so it was never triggered again, and the hits went on
// landing on an idle avatar. Two answers. While the swing plays, the player's emotes are switched
// off (InputModifier). Should one get through anyway (an explorer that ignores the switch), it is
// spotted in AvatarEmoteCommand and reported to the mining, which stops and restarts the swing.

/** Whether the InputModifier on the player is this file's. The welcome cinematic sets its own, which is never touched. */
let ownModifier = false

function blockEmotes(): void {
  // Already there: this file's own, or the cinematic's, which already switches everything off.
  if (InputModifier.has(engine.PlayerEntity)) return
  InputModifier.create(engine.PlayerEntity, { mode: InputModifier.Mode.Standard({ disableEmote: true }) })
  ownModifier = true
}

function unblockEmotes(): void {
  if (!ownModifier) return
  ownModifier = false
  InputModifier.deleteFrom(engine.PlayerEntity)
}

// AvatarEmoteCommand's states: ES_STARTED is 0, ES_INTERRUPTED 2. Absent (older explorers) reads as started.
const EMOTE_STARTED = 0
const EMOTE_INTERRUPTED = 2

/** The newest AvatarEmoteCommand entry already looked at. */
let lastEmoteTimestamp = -1
/** The swing's URN, as the explorer reports it: learnt from the first start after a trigger. */
let ownUrn: string | null = null
let awaitingOwnStart = false

/**
 * Whether the swing was cut by an emote that is not the swing since the last call. Called each
 * frame by the mining. A cut also forgets the loop, so the swing is triggered again, and so that
 * stopping it does not stop the player's emote in its place.
 */
export function swingCutByEmote(): boolean {
  if (!AvatarEmoteCommand.has(engine.PlayerEntity)) return false
  let cut = false
  for (const command of AvatarEmoteCommand.get(engine.PlayerEntity)) {
    if (command.timestamp <= lastEmoteTimestamp) continue
    lastEmoteTimestamp = command.timestamp
    const state = command.state ?? EMOTE_STARTED
    if (state === EMOTE_STARTED && awaitingOwnStart) {
      awaitingOwnStart = false
      ownUrn = command.emoteUrn
      continue
    }
    if (!looping || ownUrn === null) continue
    if (state === EMOTE_STARTED && command.emoteUrn !== ownUrn) cut = true
    if (state === EMOTE_INTERRUPTED && command.emoteUrn === ownUrn) cut = true
  }
  if (cut) {
    looping = false
    unblockEmotes()
  }
  return cut
}

function trigger(loop: boolean): void {
  blockEmotes()
  if (ownUrn === null) awaitingOwnStart = true
  try {
    triggerSceneEmote({ src: MINE_EMOTE, loop }).catch((error) => {
      console.error(`[player] could not play the mining emote: ${error}`)
    })
  } catch (error) {
    console.error(`[player] could not play the mining emote: ${error}`)
  }
}

/** Starts the swing loop on the local avatar. Does nothing if it is already running. */
export function startMineEmote(): void {
  if (!CAN_STOP_LOOP) {
    trigger(false)
    return
  }
  if (looping) return
  looping = true
  trigger(true)
}

/**
 * Ends the swing loop.
 *
 * `stopEmote` is what actually ends it: re-triggering the same emote without the loop does not
 * stop a loop that is already running, which left the avatar swinging at nothing after a rock
 * was finished. Walking away cancels it on its own, so this matters for the times the player
 * stops mining while standing still — a finished rock, or a full bag.
 */
export function stopMineEmote(): void {
  unblockEmotes()
  if (!CAN_STOP_LOOP || !looping) return
  looping = false
  // Guarded against a synchronous throw as well as a rejection: the mobile explorer threw from
  // this call, and the throw escaped into the mining system every swing until the scene errored.
  try {
    stopEmote({}).catch((error) => {
      console.error(`[player] could not stop the mining emote: ${error}`)
    })
  } catch (error) {
    console.error(`[player] could not stop the mining emote: ${error}`)
  }
}
