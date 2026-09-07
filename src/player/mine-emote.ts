import { triggerSceneEmote } from '~system/RestrictedActions'

// The swing animation on the avatar itself, so a bystander sees the player mining rather than
// standing still tapping a bar — the §5 bystander test depends on the verb being visible from
// outside.
//
// This is a restricted action: it needs ALLOW_TO_TRIGGER_AVATAR_EMOTE in scene.json, which the
// scene already declares.

const MINE_EMOTE = 'assets/animations/mine_emote.glb'

/** Plays the mining swing on the local avatar, once. */
export function playMineEmote(): void {
  // `loop: false` is what makes it a single swing: the emote plays out and the avatar returns
  // to its normal state instead of staying in the animation.
  triggerSceneEmote({ src: MINE_EMOTE, loop: false }).catch((error) => {
    console.error(`[player] could not play the mining emote: ${error}`)
  })
}
