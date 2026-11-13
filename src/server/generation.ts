// Which server is the newest: the guard against a leftover server from an old deploy.
//
// A player who is in the scene during a deploy is not moved to the new version: their client and
// its server keep running the old one, both servers see every player, and the old one's purses,
// read hours ago, were written over the real ones (the incidents of 2026-11-11 and 2026-11-13).
//
// So each server writes itself into storage when it starts (GENERATION_KEY in persistence.ts) and
// keeps reading it back. The one that finds a newer server there stops saving for good and tells
// its players a new version is out. Nothing here can stop a server deployed before this file
// existed: those still need shutting down by hand.

import { engine, executeTask } from '@dcl/sdk/ecs'

import { room } from '../shared/net/protocol'
import { readSceneEntityId } from '../shared/scene-entity'
import { loadGeneration, saveGeneration, StoredGeneration, stopWrites } from './persistence'

/** How often the record is read back, and how often an outdated server repeats its notice. */
const GENERATION_CHECK_PERIOD_SECONDS = 30

let mine: StoredGeneration | null = null
/** The newest deploy's entity id, once this server has found out it is not the newest. */
let newestEntity: string | null = null
let checking = false
let sinceLastCheck = 0

/** This server's generation id ('' until it is known), for the wallet's `server` field. */
export function getGenerationId(): string {
  return mine?.id ?? ''
}

/** The newest deploy's entity id once this server knows it is outdated, else null. */
export function getNewestEntity(): string | null {
  return newestEntity
}

export function setupGeneration(): void {
  executeTask(async () => {
    const entity = await readSceneEntityId()
    mine = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, entity, startedAt: Date.now() }
    console.log(`[Server] generation ${mine.id} for ${entity}`)
    await claimNewest()
  })
  engine.addSystem(checkGeneration, undefined, 'server:generation')
}

/** Writes this server in as the newest. A failed write is tried again at the next check. */
async function claimNewest(): Promise<void> {
  if (mine === null) return
  if (!(await saveGeneration(mine))) console.log('[Server] could not write the server generation, trying again later')
}

function checkGeneration(dt: number): void {
  sinceLastCheck += dt
  if (sinceLastCheck < GENERATION_CHECK_PERIOD_SECONDS) return
  sinceLastCheck = 0

  // Repeated while it lasts, for the players who arrive after the first one.
  if (newestEntity !== null) {
    room.send('serverOutdated', { entity: newestEntity })
    return
  }
  if (mine === null || checking) return
  checking = true
  executeTask(async () => {
    try {
      const stored = await loadGeneration()
      if (mine === null) return
      // Missing, or an older server's (ours did not land): this one is the newest.
      if (stored === null || (stored.id !== mine.id && stored.startedAt < mine.startedAt)) {
        await claimNewest()
        return
      }
      // A server in maintenance has stopped writing too, and must still find out it is outdated.
      if (stored.id === mine.id || newestEntity !== null) return
      stopWrites()
      newestEntity = stored.entity
      console.log(`[Server] OUTDATED: server ${stored.id} (${stored.entity}) started after this one (${mine.id}, ${mine.entity}); saving stopped`)
      room.send('serverOutdated', { entity: stored.entity })
    } catch (error) {
      // An unreadable record proves nothing either way: asked again at the next check.
      console.log(`[Server] could not read the server generation: ${error}`)
    } finally {
      checking = false
    }
  })
}
