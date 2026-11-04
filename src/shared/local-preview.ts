// Whether this is a local preview rather than a deployed scene, on either half of the scene.
//
// Asked once at start-up. It stays false until the realm has answered and if it never does, so a
// failed lookup shuts the debug tools rather than opening them to players.

import { getRealm } from '~system/Runtime'

let localPreview = false

export function isLocalPreview(): boolean {
  return localPreview
}

export function setupLocalPreview(): void {
  getRealm({})
    .then(({ realmInfo }) => {
      localPreview = realmInfo?.isPreview === true
    })
    .catch((error) => console.log(`could not tell whether this is a local preview: ${error}`))
}
