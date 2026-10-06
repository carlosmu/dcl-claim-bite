// Only one building's panel is ever on screen. The bank, the store, the Land Office and the
// M.U.L.E. each open on their own (walking up or clicking), so whichever opens last closes the
// rest, as if their X had been pressed.

export type PanelId = 'bank' | 'store' | 'land-office' | 'mule'

const closers = new Map<PanelId, () => void>()

/** Registers how to close a panel, so another one opening can close it. */
export function registerPanel(id: PanelId, close: () => void): void {
  closers.set(id, close)
}

/** Call when a panel opens: every other panel closes. */
export function focusPanel(id: PanelId): void {
  for (const [other, close] of closers) if (other !== id) close()
}
