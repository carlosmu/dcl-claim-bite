import { isServer } from '@dcl/sdk/network'

// Loaded for its side effect, and it has to be from here. `defineComponent` only works while
// the engine still accepts components — that window closes before main() runs. The server
// half arrives through a dynamic import inside main(), which is already too late, so the
// component is declared here instead, at module load, where both runtimes reach it in time.
import './shared/net/heartbeat'
import './shared/net/market-sync'
import './shared/net/protocol'

import { setupUi } from './ui'
import { setupMineProximity } from './mining/mine-proximity'
import { setupBank } from './bank/bank'
import { setupShop } from './shop/shop'
import { setupMusic } from './world/music'
import { setupServerLink } from './net/server-link'
import { setupEconomyLink } from './net/economy-link'

// One bundle, two runtimes. The server runs this same file headlessly, so everything that
// draws, plays or listens has to sit behind the isServer() branch — on the server there is
// no screen and no avatar, and touching a rendering component there is a crash waiting.
//
// The server half is imported dynamically so the client never pulls it into its bundle.
export async function main() {
    if (isServer()) {
        const { server } = await import('./server/server')
        server()
        return
    }

    setupServerLink()
    setupEconomyLink()
    setupMusic()
    setupMineProximity()
    setupBank()
    setupShop()
    setupUi()
}
