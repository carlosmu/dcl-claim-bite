// Debug flags, all in one place. Flip to true/false to turn each tool on or off.
//
// Shared by both runtimes on purpose: a flag that guards something the server grants (like
// free coins) is checked by the server too, so hiding the button is never the only guard.
//
// Before a real deploy, everything here should be false.

/** A "+ Coins" button that asks for an amount and grants it for free. Skips the bank, so the
 * market never moves. The server refuses the grant while this is false. */
export const DEBUG_ADD_COINS = true

/** A "Reset progress" button that wipes the player's purse back to a first visit: no ore, no
 * coins, nothing owned, an empty M.U.L.E. The server refuses the wipe while this is false. */
export const DEBUG_RESET_PROGRESS = true

/** The most a single debug grant can add, so a typo cannot overflow a purse. */
export const DEBUG_MAX_COINS = 1_000_000

/** The server tick readout at the bottom of the screen: green and counting means the
 * authoritative server is answering. */
export const DEBUG_SERVER_STATUS = true
