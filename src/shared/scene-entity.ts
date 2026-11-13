// Which deploy this code belongs to: the entity id in the scene's urn. The same on a deploy's
// server and its clients, different on every deploy, so it tells an old version from the current one.

import { getSceneInformation } from '~system/Runtime'

let cached: Promise<string> | undefined

/** The deployed entity id, or the whole urn when it holds no recognisable id (a local preview). */
export function readSceneEntityId(): Promise<string> {
  cached ??= getSceneInformation({}).then((scene) => scene.urn.match(/^(?:urn:decentraland:entity:)?([^?]+)/)?.[1] ?? scene.urn)
  return cached
}
