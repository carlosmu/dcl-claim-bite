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

function trigger(loop: boolean): void {
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
