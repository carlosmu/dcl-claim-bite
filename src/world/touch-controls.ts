import { InputAction, TouchScreenControls } from '@dcl/sdk/ecs'

// The mobile client's on-screen buttons the game never asks for: E, F and the "+" that opens
// 1–4. The hand (interact) stays. A no-op on desktop, and the client restores its own defaults
// when the player leaves the scene.
const HIDDEN_BUTTONS = [
    InputAction.IA_PRIMARY,
    InputAction.IA_SECONDARY,
    // With all four number buttons hidden there is nothing left to overflow, so the "+" goes too.
    InputAction.IA_ACTION_3,
    InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_5,
    InputAction.IA_ACTION_6
]

export function setupTouchControls() {
    TouchScreenControls.hide(HIDDEN_BUTTONS)
}
