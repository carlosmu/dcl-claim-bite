// When the running scene was deployed, for the debug panel.
//
// The deployed entity file carries its own `timestamp`; it is fetched from the content server by
// the entity id in the scene's urn. A local preview has no deployment, so nothing is shown there.

import { executeTask } from '@dcl/sdk/ecs'
import { getRealm, getSceneInformation } from '~system/Runtime'

/** The stamp is written in this offset from UTC (0 = UTC, -3 = Argentina). */
const DEPLOY_STAMP_UTC_OFFSET_HOURS = -3

let stamp: string | undefined
let deployedAt: number | undefined
// Last 6 characters of the deployed entity id: tells two deploys apart even within one minute.
let buildCode: string | undefined
// Why there is no stamp, once the lookup gave up: shown instead of the stamp so a deployed build
// that cannot find its own date says where it got stuck, rather than showing nothing.
let failure: string | undefined

/** Like 2026_10_23_1130 (24 h), or undefined in preview and until the lookup lands. */
export function getDeployStamp(): string | undefined {
  return stamp
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Like `Build x7k2qa Nov 10 12:00 UTC`, for players to quote in bug reports; undefined like
 *  getDeployStamp. */
export function getDeployStampUtc(): string | undefined {
  if (deployedAt === undefined || buildCode === undefined) return undefined
  const d = new Date(deployedAt)
  const two = (n: number) => `${n}`.padStart(2, '0')
  return `Build ${buildCode} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`
}

/** Why the deployed build has no stamp, or undefined while it is still looking or once it has one. */
export function getDeployStampFailure(): string | undefined {
  return failure
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
      if (realm.realmInfo?.isPreview) {
        // Only seen if the realm says preview while the scene does not think it is local.
        failure = 'preview realm'
        return
      }
      const scene = await getSceneInformation({})
      // The urn is usually urn:decentraland:entity:<id>?..., but take a bare id too.
      const entityId = scene.urn.match(/^(?:urn:decentraland:entity:)?([^?]+)/)?.[1]
      if (!entityId) {
        failure = 'no entity id'
        console.log('deploy stamp unavailable: no entity id in urn', scene.urn)
        return
      }
      const url = `${scene.baseUrl}${entityId}`
      const response = await fetch(url)
      if (!response.ok) {
        failure = `http ${response.status}`
        console.log('deploy stamp unavailable:', response.status, url)
        return
      }
      const entity = await response.json()
      if (typeof entity.timestamp === 'number') {
        deployedAt = entity.timestamp
        buildCode = entityId.slice(-6)
        stamp = format(entity.timestamp)
      } else {
        failure = 'no timestamp'
        console.log('deploy stamp unavailable: no timestamp at', url)
      }
    } catch (error) {
      failure = 'lookup failed'
      console.log('deploy stamp unavailable', error)
    }
  })
}
