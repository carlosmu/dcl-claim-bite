// The "new version" screen: this player's server was left over from an old deploy and no longer
// saves anything (server/generation.ts). Rejoining the world loads the current version.

import { executeTask } from '@dcl/sdk/ecs'
import { getRealm } from '~system/Runtime'
import { teleportTo } from '~system/RestrictedActions'

import { readSceneEntityId } from '../shared/scene-entity'

/** How long a closed screen stays closed while the server keeps repeating its notice. */
const REOPEN_AFTER_MS = 2 * 60 * 1000

let open = false
let closedAt = 0
let rejoining = false

/** The server's notice: shown unless this client already runs the newest deploy. */
export function noteServerOutdated(newestEntity: string): void {
  executeTask(async () => {
    const own = await readSceneEntityId()
    if (own === newestEntity) return
    if (open || Date.now() - closedAt < REOPEN_AFTER_MS) return
    open = true
  })
}

export function isServerOutdatedOpen(): boolean {
  return open
}

export function isRejoining(): boolean {
  return rejoining
}

export function closeServerOutdated(): void {
  open = false
  closedAt = Date.now()
}

/** Changing to the world the player is already in is a full reconnect, onto the current deploy. */
export function rejoinWorld(): void {
  if (rejoining) return
  rejoining = true
  executeTask(async () => {
    try {
      const { realmInfo } = await getRealm({})
      const realm = realmInfo?.realmName
      if (realm) await teleportTo({ realm })
      else console.log('rejoin: no realm name to change to')
    } catch (error) {
      console.log('rejoin failed', error)
    } finally {
      rejoining = false
    }
  })
}
