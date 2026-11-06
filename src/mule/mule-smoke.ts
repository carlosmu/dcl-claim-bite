import { engine } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'

import { fireSmokeWithConfig, initSmokeParticles, type SmokeSpawnConfig } from '../world/smoke-particles'
import { getParkedMuleBounds, yardPointToWorld } from './mule'

// Smoke drifting over the yard. Rather than one emitter per rig, a single one covers the
// rectangle the parked rigs span, padded on every side; with a single rig that is a square of
// twice the padding around it. It follows the yard as rigs park and leave.

/** How far the smoke reaches past the outermost rigs, on each side. */
export const MULE_SMOKE_PADDING_METERS = 0.5

/** Puffs per second for each square metre the area covers. */
export const MULE_SMOKE_PER_SQUARE_METER = 1

/** Caps the puffs per second however big the yard gets, since each puff is two entities alive for its whole life. */
export const MULE_SMOKE_MAX_PER_SECOND = 20

// The carpet preset from circus_fortune_teller. The area picks where each puff starts, so the
// preset adds no spread of its own across the ground.
export const MULE_SMOKE: SmokeSpawnConfig = {
  opacity: 0.5,
  // tint: { r: 0.48, g: 0.14, b: 0.68 },
  tint: { r: 0.05, g: 0.01, b: 0 },
  emissiveIntensity: 1,
  burstCount: 1,
  spawnOffsetY: 2,
  positionRandomX: 0,
  positionRandomY: 0.2,
  positionRandomZ: 0,
  rotationEulerX: -90,
  rotationEulerY: 0,
  rotationEulerZ: 0,
  rotationJitterDeg: 50,
  size: 2,
  lifeSec: 2,
  speedMin: 0.3,
  speedMax: 1,
  showDelaySec: 0.08
}

const MAX_PUFFS_PER_FRAME = 5

let pending = 0

function emit(dt: number): void {
  const bounds = getParkedMuleBounds()
  if (bounds === null) {
    pending = 0
    return
  }
  const minX = bounds.minX - MULE_SMOKE_PADDING_METERS
  const maxX = bounds.maxX + MULE_SMOKE_PADDING_METERS
  const minZ = bounds.minZ - MULE_SMOKE_PADDING_METERS
  const maxZ = bounds.maxZ + MULE_SMOKE_PADDING_METERS
  const area = (maxX - minX) * (maxZ - minZ)
  const perSecond = Math.min(area * MULE_SMOKE_PER_SQUARE_METER, MULE_SMOKE_MAX_PER_SECOND)

  // A frame's worth of puffs, carried over so a low rate still comes out right; capped so a long
  // hitch does not dump a backlog all at once.
  pending = Math.min(pending + perSecond * dt, MAX_PUFFS_PER_FRAME)
  while (pending >= 1) {
    pending -= 1
    const local = Vector3.create(minX + Math.random() * (maxX - minX), bounds.y, minZ + Math.random() * (maxZ - minZ))
    const world = yardPointToWorld(local)
    if (world === null) return
    fireSmokeWithConfig(world, MULE_SMOKE)
  }
}

export function setupMuleSmoke(): void {
  initSmokeParticles()
  engine.addSystem(emit, undefined, 'client:mule-smoke')
}
