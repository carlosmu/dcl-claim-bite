// The update screens. "Maintenance": an admin is about to deploy, nothing is saved, wait. "Rejoin":
// this player's state is from an old deploy (server/generation.ts, or the server noticed it
// directly), so rejoining the world is the only way back into the current version.

import { executeTask } from '@dcl/sdk/ecs'
import { getRealm } from '~system/Runtime'
import { teleportTo } from '~system/RestrictedActions'
import { isMobile } from '@dcl/sdk/platform'


/** How long a closed rejoin screen stays closed while the server keeps repeating its notice. */
const REOPEN_AFTER_MS = 2 * 60 * 1000

export type UpdateScreen = 'maintenance' | 'rejoin'

/** Why rejoin: a newer version is up, or this client lost the server (connection-watch.ts). */
export type RejoinReason = 'outdated' | 'lost'

/** A maintenance screen up this long also offers REJOIN, in case no notice ever reaches it. */
const MAINTENANCE_ESCAPE_MS = 60 * 1000

let screen: UpdateScreen | null = null
let rejoinReason: RejoinReason = 'outdated'
let maintenanceShownAt = 0
/** Whether the server says maintenance is on, shown or not (the rejoin screen wins). */
let maintenanceOn = false
let closedAt = 0
let rejoining = false
/** When REJOIN was last pressed: if the player is still here a while later, it did not work. */
let rejoinTriedAt = 0
/** Still on this screen this long after pressing REJOIN: show how to rejoin by hand. */
const REJOIN_HINT_AFTER_MS = 4000

/**
 * The server this client talks to says a newer one is up: rejoin, whatever deploy this client
 * runs. Even the newest code is stuck if it is still attached to the old server, which happens
 * when the explorer reloads the scene in place after a deploy ("Current scene has been
 * reloaded"): new code, old server, and nothing it does is saved.
 */
export function noteServerOutdated(_newestEntity: string): void {
  showRejoin('outdated')
}

/** The server found this client's state is not its own. */
export function noteRejoinNeeded(): void {
  showRejoin('outdated')
}

/** The client stopped hearing the server, or never got its purse (connection-watch.ts). */
export function noteConnectionLost(): void {
  showRejoin('lost')
}

export function noteMaintenance(on: boolean): void {
  maintenanceOn = on
  if (on && screen === null) {
    screen = 'maintenance'
    maintenanceShownAt = Date.now()
  }
  if (!on && screen === 'maintenance') screen = null
}

function showRejoin(reason: RejoinReason): void {
  // Over a maintenance screen at once: a player waiting must never be left with no way out.
  if (screen === 'rejoin' || (screen !== 'maintenance' && Date.now() - closedAt < REOPEN_AFTER_MS)) return
  screen = 'rejoin'
  rejoinReason = reason
}

export function getRejoinReason(): RejoinReason {
  return rejoinReason
}

/** Whether the maintenance screen has been up long enough to offer REJOIN as a way out. */
export function canEscapeMaintenance(): boolean {
  return screen === 'maintenance' && Date.now() - maintenanceShownAt >= MAINTENANCE_ESCAPE_MS
}

export function getUpdateScreen(): UpdateScreen | null {
  return screen
}

export function isMaintenanceOn(): boolean {
  return maintenanceOn
}

export function isRejoining(): boolean {
  return rejoining
}

/** Only the rejoin screen closes; it comes back after a while if the notice keeps coming. */
export function closeServerOutdated(): void {
  if (screen !== 'rejoin') return
  screen = maintenanceOn ? 'maintenance' : null
  closedAt = Date.now()
}

/** Whether REJOIN was pressed a while ago and the player is still here: it did not reconnect. */
export function didRejoinFail(): boolean {
  return rejoinTriedAt > 0 && !rejoining && Date.now() - rejoinTriedAt >= REJOIN_HINT_AFTER_MS
}

/**
 * Changing to the world the player is already in should be a full reconnect, onto the current
 * deploy. The mobile explorer does it with the world's name; the desktop one refuses that ("You
 * are already in ...") although the API promises a reconnect, so there the realm's URL is tried
 * instead. If neither works the screen says how to do it by hand (didRejoinFail).
 */
export function rejoinWorld(): void {
  if (rejoining) return
  rejoining = true
  rejoinTriedAt = Date.now()
  executeTask(async () => {
    try {
      const { realmInfo } = await getRealm({})
      const realm = isMobile() ? realmInfo?.realmName : realmInfo?.baseUrl || realmInfo?.realmName
      if (realm) await teleportTo({ realm })
      else console.log('rejoin: no realm to change to')
    } catch (error) {
      console.log('rejoin failed', error)
    } finally {
      rejoining = false
    }
  })
}
