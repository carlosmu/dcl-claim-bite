import { engine } from '@dcl/sdk/ecs'

import { createProximityZone, ProximityZone } from '../world/proximity-zone'
import { getHitsPerRock, sendClaimPick } from '../net/economy-link'

// The town mayor, standing at spawn. Walking up to him with no pick gets you one — free, and
// as often as it takes (design/balance.md §2: pick tier 0 is the anti-soft-lock fallback).
//
// The server decides: this only asks. The pick appears in the hand when the wallet comes back
// saying it is owned (economy-link equips on every wallet).
//
// TBD: no hand-over animation yet, and the server does not check the player is at the mayor.

export const MAYOR_ENTITY_NAME = 'Town Mayor'
export const MAYOR_RADIUS_METERS = 2

/** Seconds between asks while standing there pickless. Covers a purse still loading on arrival
 * and a lost message, without spamming the server every frame. */
const ASK_RETRY_SECONDS = 2

let zone: ProximityZone | null = null
let sinceLastAsk = ASK_RETRY_SECONDS

function askForPick(dt: number): void {
  sinceLastAsk += dt
  if (zone === null || !zone.isPlayerInside()) return
  if (getHitsPerRock() > 0) return
  if (sinceLastAsk < ASK_RETRY_SECONDS) return

  sinceLastAsk = 0
  sendClaimPick()
}

export function setupMayor(): void {
  zone = createProximityZone({ entityName: MAYOR_ENTITY_NAME, radiusMeters: MAYOR_RADIUS_METERS })
  engine.addSystem(askForPick, undefined, 'client:mayor')
}
