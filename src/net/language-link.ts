import { engine } from '@dcl/sdk/ecs'
import { isStateSyncronized } from '@dcl/sdk/network'

import { restoreLanguage, setLanguage } from '../i18n'
import { isLanguage, Language } from '../shared/languages'
import { room } from '../shared/net/protocol'

// The language the player picks is kept by the server (server/prefs.ts), so the next visit opens
// in it. Picked on the title card the room is often not ready yet: the pick waits and goes out
// as soon as it is.

/** A pick not sent yet. */
let unsent: Language | null = null

/** The player picked a language: show it now, and have the server keep it. */
export function pickLanguage(language: Language): void {
  setLanguage(language)
  unsent = language
  flush()
}

function flush(): void {
  if (unsent === null || !isStateSyncronized()) return
  room.send('setLanguage', { language: unsent })
  unsent = null
}

export function setupLanguageLink(): void {
  room.onMessage('prefs', (data) => {
    if (isLanguage(data.language)) restoreLanguage(data.language)
  })
  engine.addSystem(flush, undefined, 'client:language-link')
}
