// Billboarded smoke puffs, pooled. Copied from circus_fortune_teller (smokeParticles.ts).
// Images: assets/images/smoke_04.png, smoke_07.png, smoke_08.png

import {
  Billboard,
  engine,
  Entity,
  Material,
  MaterialTransparencyMode,
  MeshRenderer,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

/** What one spawn of smoke looks like; each emitter brings its own preset. */
export type SmokeSpawnConfig = {
  opacity: number
  tint: { r: number; g: number; b: number }
  emissiveIntensity: number
  burstCount: number
  spawnOffsetY: number
  positionRandomX: number
  positionRandomY: number
  positionRandomZ: number
  /** Base rotation before the jitter (Euler degrees). -90 on X ≈ rising along Y. */
  rotationEulerX: number
  rotationEulerY: number
  rotationEulerZ: number
  rotationJitterDeg: number
  size: number
  lifeSec: number
  speedMin: number
  speedMax: number
  showDelaySec: number
}

const SMOKE_TEXTURES = ['smoke_04.png', 'smoke_07.png', 'smoke_08.png']

function randomSpeed(cfg: SmokeSpawnConfig): number {
  return cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin)
}

// --- Particle ----------------------------------------------------------------------------

class Particle {
  parent: Entity
  entity: Entity
  dead: boolean = true
  private life: number = 0
  private speed: number = 1
  private direction: Vector3 = Vector3.Zero()
  private showTimer: number = 0
  private pendingSize: number = 1

  constructor() {
    this.parent = engine.addEntity()
    Transform.create(this.parent)

    this.entity = engine.addEntity()
    MeshRenderer.setBox(this.entity)
    Transform.create(this.entity, { parent: this.parent, scale: Vector3.Zero() })
    Billboard.create(this.entity)
  }

  live(
    position: Vector3,
    rotation: Quaternion,
    particleLife: number,
    particleSize: number,
    particleSpeed: number,
    showDelaySec: number
  ) {
    this.life = particleLife
    this.speed = particleSpeed
    this.showTimer = showDelaySec
    this.pendingSize = particleSize
    this.dead = false

    Transform.createOrReplace(this.parent, { position, rotation })
    Transform.createOrReplace(this.entity, { parent: this.parent, scale: Vector3.Zero() })

    this.direction = Vector3.rotate(Vector3.Forward(), rotation)
  }

  update(dt: number) {
    if (this.dead) return

    if (this.showTimer > 0) {
      this.showTimer -= dt
      if (this.showTimer <= 0) {
        const size = this.pendingSize
        Transform.createOrReplace(this.entity, {
          parent: this.parent,
          scale: Vector3.create(size, size, size)
        })
      }
      return
    }

    this.life -= dt
    if (this.life <= 0) {
      this.die()
      return
    }

    let scale = Transform.get(this.entity).scale.x
    if (scale > 0) {
      scale -= dt / this.life / 100
      if (scale < 0) scale = 0
      Transform.getMutable(this.entity).scale = Vector3.create(scale, scale, scale)
    }

    const t = Transform.getMutable(this.parent)
    t.position = Vector3.add(t.position, Vector3.scale(this.direction, this.speed * dt))
  }

  die() {
    this.dead = true
    Transform.getMutable(this.parent).scale = Vector3.Zero()
  }
}

// --- Pool --------------------------------------------------------------------------------

class SmokePool {
  private pool: Particle[] = []

  constructor() {
    engine.addSystem((dt) => {
      for (const p of this.pool) {
        if (!p.dead) p.update(dt)
      }
    }, undefined, 'client:smoke-particles')
  }

  private getParticle(): Particle {
    for (const p of this.pool) {
      if (p.dead) return p
    }
    const p = new Particle()
    this.pool.push(p)
    return p
  }

  spawn(position: Vector3, cfg: SmokeSpawnConfig) {
    const p = this.getParticle()

    const x = position.x + (Math.random() - 0.5) * cfg.positionRandomX
    const y = position.y + (Math.random() - 0.5) * cfg.positionRandomY
    const z = position.z + (Math.random() - 0.5) * cfg.positionRandomZ

    const jitter = cfg.rotationJitterDeg
    const rnd = Quaternion.fromEulerDegrees(
      (Math.random() - 0.5) * jitter,
      (Math.random() - 0.5) * jitter,
      (Math.random() - 0.5) * jitter
    )
    const baseRot = Quaternion.fromEulerDegrees(cfg.rotationEulerX, cfg.rotationEulerY, cfg.rotationEulerZ)
    const finalRot = Quaternion.multiply(baseRot, rnd)

    const src = 'assets/images/' + SMOKE_TEXTURES[Math.floor(Math.random() * SMOKE_TEXTURES.length)]

    p.live(Vector3.create(x, y, z), finalRot, cfg.lifeSec, cfg.size, randomSpeed(cfg), cfg.showDelaySec)

    const color = Color4.create(cfg.tint.r, cfg.tint.g, cfg.tint.b, cfg.opacity)
    Material.setPbrMaterial(p.entity, {
      texture: Material.Texture.Common({ src }),
      albedoColor: color,
      emissiveColor: color,
      emissiveIntensity: cfg.emissiveIntensity,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
      castShadows: false
    })
  }
}

// --- Public API --------------------------------------------------------------------------

let pool: SmokePool | null = null

export function initSmokeParticles(): void {
  if (pool === null) pool = new SmokePool()
}

/** Puffs of smoke at a world position. */
export function fireSmokeWithConfig(position: Vector3, cfg: SmokeSpawnConfig): void {
  if (pool === null) {
    console.log('[smoke] call initSmokeParticles() first')
    return
  }
  const origin = Vector3.add(position, Vector3.create(0, cfg.spawnOffsetY, 0))
  for (let i = 0; i < cfg.burstCount; i++) pool.spawn(origin, cfg)
}
