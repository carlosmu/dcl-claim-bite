import {
  Billboard,
  BillboardMode,
  engine,
  Entity,
  GltfContainer,
  Material,
  MeshRenderer,
  TextShape,
  Transform,
  Tween
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { MULE_YARD_SPACING_X, MULE_YARD_SPACING_Z, MuleYard } from '../shared/net/mule-yard-sync'
import { sendBuy, sendCollect } from '../net/economy-link'

// The idle rig standing in the world. Walking up to it is how a load gets claimed — the ore
// is not posted to the bag automatically, because arriving to collect is the return hook the
// rig exists to create (GDD §4).

export const MULE_ENTITY_NAME = 'MULE'
export const MULE_RADIUS_METERS = 5

/** How high above the rig's origin the level sign floats. */
const LEVEL_SIGN_HEIGHT_METERS = 2.5

export function isPlayerAtMule(): boolean {
  return atOwnMule
}

/** Asks the server to empty the rig into the bag. Nothing is decided here. */
export function collectMule(): void {
  sendCollect()
}

/** Asks the server to put one tank in the rig. It checks the price and the room in the tank. */
export function refuelMule(): void {
  sendBuy('fuel')
}

// --- The yard ------------------------------------------------------------------------------
//
// Every owner's rig stands in its own spot of a grid laid over `Mule_Area`, with a black pad
// marking each spot. Which spot is whose comes from the server (MuleYard). The `MULE` placed in
// the Creator Hub is only the template: its model is copied onto each parked rig and the
// original is emptied, so it can stay where it is for tuning without standing around twice.

export const MULE_AREA_ENTITY_NAME = 'Mule_Area'

/** Size of the black pad under each spot, in metres. */
const PAD_SIZE_METERS = 1

/** How far above the level sign the owner's name floats. */
const NAME_SIGN_GAP_METERS = 0.7

/** Size of the owner's face plane, and how far above the name its centre sits. */
const FACE_SIZE_METERS = 0.6
const FACE_GAP_METERS = 0.5

type ParkedMule = { root: Entity; level: Entity; name: Entity; face: Entity; faceResolved: boolean }

const parked = new Map<string, ParkedMule>()
let spots: Vector3[] = []
let yardRoot: Entity | null = null
let muleModel = ''
let myAddress = ''
/** The player's own rig, which is what the proximity check measures against. */
let ownMule: Entity | null = null
let atOwnMule = false

// The area is a plane turned flat: its X scale is the width, its Y scale the depth (Z).
function buildGrid(): void {
  const area = engine.getEntityOrNullByName(MULE_AREA_ENTITY_NAME)
  if (area === null) {
    console.error(`[mule] no entity named "${MULE_AREA_ENTITY_NAME}" in the scene — the yard has nowhere to stand`)
    return
  }
  const areaTransform = Transform.get(area)
  const width = areaTransform.scale.x
  const depth = areaTransform.scale.y
  const columns = Math.max(1, Math.floor(width / MULE_YARD_SPACING_X))
  const rows = Math.max(1, Math.floor(depth / MULE_YARD_SPACING_Z))

  yardRoot = engine.addEntity()
  Transform.create(yardRoot, { parent: areaTransform.parent, position: areaTransform.position })

  const flat = Quaternion.fromEulerDegrees(90, 0, 0)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const spot = Vector3.create(
        -width / 2 + MULE_YARD_SPACING_X * (column + 0.5),
        0,
        -depth / 2 + MULE_YARD_SPACING_Z * (row + 0.5)
      )
      spots.push(spot)

      const pad = engine.addEntity()
      Transform.create(pad, {
        parent: yardRoot,
        position: Vector3.create(spot.x, 0.01, spot.z),
        rotation: flat,
        scale: Vector3.create(PAD_SIZE_METERS, PAD_SIZE_METERS, 1)
      })
      MeshRenderer.setPlane(pad)
      Material.setPbrMaterial(pad, { albedoColor: Color4.Black(), metallic: 0, roughness: 1 })
    }
  }
}

function adoptTemplate(): void {
  const template = engine.getEntityOrNullByName(MULE_ENTITY_NAME)
  if (template === null) return
  const gltf = GltfContainer.getOrNull(template)
  if (gltf === null) return
  muleModel = gltf.src
  GltfContainer.deleteFrom(template)
}

function sign(parent: Entity, height: number, fontSize: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position: Vector3.create(0, height, 0) })
  Billboard.create(entity, { billboardMode: BillboardMode.BM_Y })
  TextShape.create(entity, { text: '', fontSize, textColor: Color4.White(), outlineWidth: 0.2, outlineColor: Color4.Black() })
  return entity
}

function park(address: string): ParkedMule {
  const root = engine.addEntity()
  Transform.create(root, { parent: yardRoot ?? undefined })
  if (muleModel !== '') {
    GltfContainer.create(root, { src: muleModel, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 3 })
  }
  // The owner's face. It starts on the fallback picture and switches to the avatar texture once
  // the player's profile shows they have one (see resolveFace).
  const face = engine.addEntity()
  Transform.create(face, {
    parent: root,
    position: Vector3.create(0, LEVEL_SIGN_HEIGHT_METERS + NAME_SIGN_GAP_METERS + FACE_GAP_METERS, 0),
    scale: Vector3.create(FACE_SIZE_METERS, FACE_SIZE_METERS, 1)
  })
  Billboard.create(face, { billboardMode: BillboardMode.BM_Y })
  MeshRenderer.setPlane(face)
  setFace(face, Material.Texture.Common({ src: FALLBACK_FACE_IMAGE }))

  const mule: ParkedMule = {
    root,
    level: sign(root, LEVEL_SIGN_HEIGHT_METERS, 4),
    name: sign(root, LEVEL_SIGN_HEIGHT_METERS + NAME_SIGN_GAP_METERS, 1.5),
    face,
    faceResolved: false
  }
  parked.set(address, mule)
  return mule
}

const FALLBACK_FACE_IMAGE = 'assets/images/fallback_profile_pic.png'

// Unlit so the face reads the same in the shade as in the sun.
function setFace(face: Entity, texture: ReturnType<typeof Material.Texture.Common>): void {
  Material.setBasicMaterial(face, { texture })
}

// A guest has no profile, so the avatar texture would come out blank; they keep the fallback.
// The profile may not have arrived when the rig is parked, so this is retried until it has.
function resolveFace(address: string, mule: ParkedMule): void {
  if (mule.faceResolved) return
  const player = getPlayer({ userId: address })
  if (player === null) return
  mule.faceResolved = true
  if (player.isGuest) return
  setFace(mule.face, Material.Texture.Avatar({ userId: address }))
}

function unpark(address: string, mule: ParkedMule): void {
  engine.removeEntityWithChildren(mule.root)
  parked.delete(address)
}

function syncYard(): void {
  if (yardRoot === null) return
  if (myAddress === '') myAddress = (getPlayer()?.userId ?? '').toLowerCase()

  let entries: readonly { slot: number; address: string; name: string; level: number }[] = []
  for (const [, yard] of engine.getEntitiesWith(MuleYard)) entries = yard.mules

  const seen = new Set<string>()
  ownMule = null
  for (const entry of entries) {
    const spot = spots[entry.slot]
    if (spot === undefined) continue
    seen.add(entry.address)

    const mule = parked.get(entry.address) ?? park(entry.address)
    resolveFace(entry.address, mule)
    const transform = Transform.getMutable(mule.root)
    if (!Vector3.equals(transform.position, spot)) transform.position = Vector3.clone(spot)

    const levelText = `x${entry.level}`
    if (TextShape.get(mule.level).text !== levelText) TextShape.getMutable(mule.level).text = levelText
    if (TextShape.get(mule.name).text !== entry.name) TextShape.getMutable(mule.name).text = entry.name

    if (entry.address.toLowerCase() === myAddress) ownMule = mule.root
  }

  for (const [address, mule] of parked) {
    if (!seen.has(address)) unpark(address, mule)
  }
}

// While the rig's panel is up, a ring turns under the player's own rig, so with a neighbour's
// parked next to it there is no doubt which one is being fuelled and emptied.

const INDICATOR_MODEL = 'assets/models/circle-indicator.glb'
const INDICATOR_TURN_SECONDS = 6

let indicator: Entity | null = null
let indicatorOn: Entity | null = null

function showIndicator(mule: Entity | null): void {
  if (mule === indicatorOn) return
  // The rig it hung from may already be gone (unpark removes children), so only remove a live one.
  if (indicator !== null && Transform.getOrNull(indicator) !== null) engine.removeEntity(indicator)
  indicator = null
  indicatorOn = mule
  if (mule === null) return

  indicator = engine.addEntity()
  Transform.create(indicator, { parent: mule, position: Vector3.create(0, 0.02, 0) })
  GltfContainer.create(indicator, { src: INDICATOR_MODEL, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  Tween.setRotateContinuous(indicator, Quaternion.fromEulerDegrees(0, -1, 0), 360 / INDICATOR_TURN_SECONDS)
}

// Distance to the player's own rig, measured every frame like the other proximity zones.
function checkOwnMule(): void {
  let inside = false
  if (ownMule !== null) {
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (player !== null) {
      const mulePosition = Transform.getOrNull(ownMule)?.position
      const root = yardRoot !== null ? Transform.getOrNull(yardRoot)?.position : undefined
      if (mulePosition !== undefined && root !== undefined) {
        // The yard root hangs off the scene root, so root + local is world space.
        inside = Vector3.distance(player.position, Vector3.add(root, mulePosition)) <= MULE_RADIUS_METERS
      }
    }
  }
  showIndicator(inside ? ownMule : null)
  if (inside === atOwnMule) return
  atOwnMule = inside
  console.log(`[mule] player ${inside ? 'reached' : 'left'} their M.U.L.E.`)
}

export function setupMule(): void {
  adoptTemplate()
  buildGrid()
  engine.addSystem(syncYard, undefined, 'client:mule-yard')
  engine.addSystem(checkOwnMule, undefined, 'client:mule-proximity')
}
