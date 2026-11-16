// Each player's preferences: for now, the language they picked, so they do not have to pick it
// again on every visit. Kept with the player (./persistence), apart from the purse and outside
// the seasons.
//
// A preference is read once per player and kept. A pick overwrites it whole and is written at
// once: it happens a handful of times per visit at most.

import { room } from '../shared/net/protocol'
import { isLanguage } from '../shared/languages'
import { loadPrefs, savePrefs, StoredPrefs } from './persistence'

/** Each player's preferences, once read. */
const kept = new Map<string, StoredPrefs>()

function prefsOf(address: string): Promise<StoredPrefs> {
  const known = kept.get(address)
  if (known !== undefined) return Promise.resolve(known)
  return loadPrefs(address).then((stored) => {
    // A pick may have raced the read in: it is newer than what was stored.
    const prefs = kept.get(address) ?? stored ?? {}
    kept.set(address, prefs)
    return prefs
  })
}

/** Sends a player the language they picked before ('' if none). A failed read sends nothing. */
export function sendPrefs(address: string): void {
  prefsOf(address)
    .then((prefs) => room.send('prefs', { language: prefs.language ?? '' }, { to: [address] }))
    .catch((error) => console.log(`[Server] could not read prefs for ${address}: ${error}`))
}

/** Keeps the language a player picked. Anything that is not one of the scene's is ignored. */
export function setLanguagePref(address: string, language: string): void {
  if (!isLanguage(language)) return
  const prefs: StoredPrefs = { ...(kept.get(address) ?? {}), language }
  kept.set(address, prefs)
  savePrefs(address, prefs).catch(() => {})
}
