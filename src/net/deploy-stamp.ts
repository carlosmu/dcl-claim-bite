// When the running scene was deployed, for the debug panel.
//
// The deployed entity file carries its own `timestamp`; it is fetched from the content server by
// the entity id in the scene's urn. A local preview has no deployment, so nothing is shown there.

import { executeTask } from '@dcl/sdk/ecs'
import { getRealm, getSceneInformation } from '~system/Runtime'

/** The stamp is written in this offset from UTC (0 = UTC, -3 = Argentina). */
const DEPLOY_STAMP_UTC_OFFSET_HOURS = -3

let stamp: string | undefined

/** Like 2026_10_23_1130 (24 h), or undefined in preview and until the lookup lands. */
export function getDeployStamp(): string | undefined {
  return stamp
}

function format(timestamp: number): string {
  const d = new Date(timestamp + DEPLOY_STAMP_UTC_OFFSET_HOURS * 3600 * 1000)
  const two = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getUTCFullYear()}_${two(d.getUTCMonth() + 1)}_${two(d.getUTCDate())}_${two(d.getUTCHours())}${two(d.getUTCMinutes())}`
}

export function setupDeployStamp(): void {
  executeTask(async () => {
    try {
      const realm = await getRealm({})
      if (realm.realmInfo?.isPreview) return
      const scene = await getSceneInformation({})
      const entityId = scene.urn.match(/^urn:decentraland:entity:([^?]+)/)?.[1]
      if (!entityId) return
      const response = await fetch(`${scene.baseUrl}${entityId}`)
      const entity = await response.json()
      if (typeof entity.timestamp === 'number') stamp = format(entity.timestamp)
    } catch (error) {
      console.log('deploy stamp unavailable', error)
    }
  })
}
