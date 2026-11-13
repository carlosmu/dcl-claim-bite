// The client's own check that it is still talking to the town, for when no message can say so.
//
// After a deploy a client can be left between two servers: the old one has let it go, the new
// one never hears it, so neither can tell it to rejoin. What the client can see is that the
// server's heartbeat stopped, or that its purse never came. Either, for long enough, brings up
// the rejoin screen; rejoining the world is the one thing that always reconnects.

import { engine } from '@dcl/sdk/ecs'

import { hasWallet } from '../net/economy-link'
import { isServerOnline } from '../net/server-link'
import { noteConnectionLost } from './server-outdated'

/**
 * Silence from the heartbeat before giving up on the server. Longer than a cold start (~15 s in
 * production, when the first visitor wakes the server) so that never counts.
 */
const OFFLINE_SECONDS = 30
/** No purse after this long in the scene: the server is not answering this client. */
const NO_WALLET_SECONDS = 45

let offlineFor = 0
let withoutWalletFor = 0

function watchConnection(dt: number): void {
  offlineFor = isServerOnline() ? 0 : offlineFor + dt
  withoutWalletFor = hasWallet() ? 0 : withoutWalletFor + dt
  if (offlineFor >= OFFLINE_SECONDS || withoutWalletFor >= NO_WALLET_SECONDS) {
    offlineFor = 0
    withoutWalletFor = 0
    noteConnectionLost()
  }
}

export function setupConnectionWatch(): void {
  engine.addSystem(watchConnection, undefined, 'client:connection-watch')
}
