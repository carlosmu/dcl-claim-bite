import {
  engine,
  Entity,
  executeTask,
  GltfContainer,
  InputAction,
  Material,
  MeshRenderer,
  pointerEventsSystem,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { DEBUG_FILL_PROPERTY_LOTS } from '../shared/debug-flags'
import { setBitmapText3d } from '../world/bitmap-text-3d'
import { openOwnerCard } from './owner-card'
import { PROPERTY_AREAS, PROPERTY_KINDS, PropertyKind, PropertyLots } from '../shared/net/property-lots-sync'

// The properties standing in town. Every lot of the grid laid over each kind's area has its
// property standing, with a sign by it: the owner's name, or FOR SALE while nobody has it.
// Which lot is whose comes from the server (PropertyLots).

const PROPERTY_MODELS: Record<PropertyKind, string> = {
  cabin: 'assets/models/cabin.glb',
  house: 'assets/models/house.glb',
  ranch: 'assets/models/ranch.glb'
}

/** The same sign stands by every kind of property. */
const OWNER_SIGN_MODEL = 'assets/models/owner.glb'

// Rows pair up face to face, a street between them, and back to back with the next pair:
// even rows face +Z, odd rows are turned round to face -Z. Each model's origin is a front
// corner of its lot, the lot reaching into +X and back into -Z from it (as the scene sees the
// model: loading a glTF mirrors its X).

/** Which way the properties face within their lot, turned about Y. */
const PROPERTY_YAW_DEGREES = 0

/**
 * Kinds whose whole lot, property and sign together, is turned round: even rows face -Z and odd
 * rows +Z, the other way from the rule above. The lot stays where it is; only its facing flips.
 */
const LOTS_TURNED: Record<PropertyKind, boolean> = {
  cabin: false,
  house: false,
  ranch: true
}

/** Where the sign stands from the lot's origin (a front corner), and which way it faces. */
const OWNER_SIGN_OFFSET = Vector3.create(0, 0, 0)
const OWNER_SIGN_YAW_DEGREES = 0

/** How high above the sign's foot the lettering starts, and which way it faces. */
const OWNER_NAME_HEIGHT_METERS = 1.0
const OWNER_TEXT_YAW_DEGREES = 180
/** Where the board stands within owner.glb, from its origin, as the scene sees it (X mirrored from the glTF). */
const OWNER_BOARD_X_METERS = 1.54
const OWNER_BOARD_Z_METERS = -2.75
/** How far in front of the sign's centre the lettering sits, so it does not sink into the board. */
const OWNER_TEXT_FORWARD_METERS = -0.06

/** "Property of" above, the owner's name below; sizes are metres per em of the western font. */
const OWNER_CAPTION = 'Property of'
const OWNER_CAPTION_SIZE = 0.102
const OWNER_NAME_SIZE = 0.14
/** A long name shrinks to fit the board. */
const OWNER_NAME_MAX_WIDTH_METERS = 1.2
const OWNER_TEXT_COLOR = Color4.fromHexString('#2B1A0EFF')
/** What the sign says while the lot has no owner. */
const forSaleText = (kind: PropertyKind) => `${kind.toUpperCase()}\nFOR SALE`
const FOR_SALE_SIZE = 0.16
const FOR_SALE_COLOR = Color4.Black()
/** How much lower than the owner's lettering FOR SALE starts. */
const FOR_SALE_DROP_METERS = 0.1
/** The owner's profile picture under their name: how far below where the lettering starts its top edge sits, and how big it is. */
const OWNER_PICTURE_TOP_METERS = 0.28
const OWNER_PICTURE_SIZE_METERS = 0.3
/** The whole picture, the right way round on both faces (corners bottom-left, top-left, top-right, bottom-right). */
const OWNER_PICTURE_UVS = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0]
/** Shown while the owner's profile is looked up, and for good when it has no face. */
const OWNER_PICTURE_FALLBACK = 'assets/images/fallback_profile_pic.png'
const PROFILES_URL = 'https://peer.decentraland.org/lambdas/profiles/'

/** How far off an owned property can be clicked to see its owner's card. */
const OWNER_CARD_REACH_METERS = 12

/** Which end of each row the lots count from: the end nearest where players come in. */
const LOTS_FROM_PLUS_X: Record<PropertyKind, boolean> = {
  cabin: true,
  house: false,
  ranch: false
}

type Lot = { corner: Vector3; yawDegrees: number }
type Area = { root: Entity; lots: Lot[] }
type StandingProperty = {
  kind: PropertyKind
  root: Entity
  /** The property and its sign, which open the owner's card while the lot is owned. */
  model: Entity
  sign: Entity
  text: Entity
  picture: Entity
  shownName: string | null
  ownerAddress?: string
}

const areas = new Map<PropertyKind, Area>()
/** Keyed by kind and lot. */
const standing = new Map<string, StandingProperty>()

// The area is a plane turned flat, maybe also a quarter round about Y: its X and Y scales are
// its sides, and the turn decides which of them runs along X (the width) and which along Z.
function buildArea(kind: PropertyKind): void {
  const { areaName, spacingX, spacingZ } = PROPERTY_AREAS[kind]
  const area = engine.getEntityOrNullByName(areaName)
  if (area === null) {
    console.error(`[properties] no entity named "${areaName}" in the scene — ${kind}s have nowhere to stand`)
    return
  }
  const areaTransform = Transform.get(area)
  const sideX = Vector3.rotate(Vector3.create(areaTransform.scale.x, 0, 0), areaTransform.rotation)
  const sideY = Vector3.rotate(Vector3.create(0, areaTransform.scale.y, 0), areaTransform.rotation)
  const width = Math.abs(sideX.x) + Math.abs(sideY.x)
  const depth = Math.abs(sideX.z) + Math.abs(sideY.z)
  const columns = Math.max(1, Math.floor(width / spacingX))
  const rows = Math.max(1, Math.floor(depth / spacingZ))
  // No more lots than the server may hand out, so none stands for sale that cannot be bought.
  const lotCount = Math.min(columns * rows, PROPERTY_AREAS[kind].maxLots)

  const root = engine.addEntity()
  Transform.create(root, { parent: areaTransform.parent, position: areaTransform.position })

  const lots: Lot[] = []
  for (let row = 0; row < rows && lots.length < lotCount; row++) {
    // Turning a lot round about its middle is the same as swapping which corner is its origin.
    const facesBack = (row % 2 === 1) !== LOTS_TURNED[kind]
    for (let column = 0; column < columns && lots.length < lotCount; column++) {
      // The lot's low corner on the area; a lot turned round has its origin there instead.
      // The first lots handed out are the nearest.
      const place = LOTS_FROM_PLUS_X[kind] ? columns - 1 - column : column
      const x = (-columns * spacingX) / 2 + spacingX * place
      const z = (-rows * spacingZ) / 2 + spacingZ * row
      lots.push({
        corner: facesBack ? Vector3.create(x + spacingX, 0, z) : Vector3.create(x, 0, z + spacingZ),
        yawDegrees: facesBack ? 180 : 0
      })
    }
  }
  const built = { root, lots }
  areas.set(kind, built)
  lots.forEach((lot, index) => standing.set(`${kind}:${index}`, build(kind, built, lot)))
}

function build(kind: PropertyKind, area: Area, lot: Lot): StandingProperty {
  const root = engine.addEntity()
  Transform.create(root, {
    parent: area.root,
    position: Vector3.clone(lot.corner),
    rotation: Quaternion.fromEulerDegrees(0, lot.yawDegrees, 0)
  })

  const model = engine.addEntity()
  Transform.create(model, { parent: root, rotation: Quaternion.fromEulerDegrees(0, PROPERTY_YAW_DEGREES, 0) })
  GltfContainer.create(model, { src: PROPERTY_MODELS[kind] })

  const ownerSign = engine.addEntity()
  Transform.create(ownerSign, {
    parent: root,
    position: OWNER_SIGN_OFFSET,
    rotation: Quaternion.fromEulerDegrees(0, OWNER_SIGN_YAW_DEGREES, 0)
  })
  GltfContainer.create(ownerSign, { src: OWNER_SIGN_MODEL })

  const text = engine.addEntity()
  Transform.create(text, {
    parent: ownerSign,
    position: Vector3.create(
      OWNER_BOARD_X_METERS,
      OWNER_NAME_HEIGHT_METERS,
      OWNER_BOARD_Z_METERS + OWNER_TEXT_FORWARD_METERS
    ),
    rotation: Quaternion.fromEulerDegrees(0, OWNER_TEXT_YAW_DEGREES, 0)
  })

  const picture = engine.addEntity()
  Transform.create(picture, {
    parent: text,
    position: Vector3.create(0, -OWNER_PICTURE_TOP_METERS - OWNER_PICTURE_SIZE_METERS / 2, 0),
    scale: Vector3.create(OWNER_PICTURE_SIZE_METERS, OWNER_PICTURE_SIZE_METERS, 1)
  })

  return { kind, root, model, sign: ownerSign, text, picture, shownName: null }
}

// An upgrade moves the owner to the new kind's area, so their old lot goes back on sale.
function syncLots(): void {
  let entries: readonly { kind: string; lot: number; address: string; name: string }[] = []
  for (const [, lots] of engine.getEntitiesWith(PropertyLots)) entries = lots.lots
  if (DEBUG_FILL_PROPERTY_LOTS) entries = withStandIns(entries)

  const owners = new Map<string, { address: string; name: string }>()
  for (const entry of entries) owners.set(`${entry.kind}:${entry.lot}`, entry)

  for (const [key, property] of standing) {
    const owner = owners.get(key)
    // Prefixed so an owner named "FOR SALE" still reads as owned.
    const shown = owner === undefined ? forSaleText(property.kind) : `owner:${owner.address}:${owner.name}`
    if (property.shownName === shown) continue
    property.shownName = shown
    Transform.getMutable(property.text).position.y = OWNER_NAME_HEIGHT_METERS - (owner === undefined ? FOR_SALE_DROP_METERS : 0)
    setBitmapText3d(
      property.text,
      owner === undefined
        ? [
            { value: property.kind.toUpperCase(), size: FOR_SALE_SIZE },
            { value: 'FOR SALE', size: FOR_SALE_SIZE }
          ]
        : [
            { value: OWNER_CAPTION, size: OWNER_CAPTION_SIZE },
            { value: owner.name.toUpperCase(), size: OWNER_NAME_SIZE, maxWidth: OWNER_NAME_MAX_WIDTH_METERS }
          ],
      owner === undefined ? FOR_SALE_COLOR : OWNER_TEXT_COLOR
    )
    property.ownerAddress = owner?.address
    setOwnerPicture(property.picture, owner?.address)
    setOwnerClick(property, owner)
  }
}

// A lot on sale answers no click: the Land Office is where it is bought.
function setOwnerClick(property: StandingProperty, owner: { address: string; name: string } | undefined): void {
  for (const entity of [property.model, property.sign]) {
    pointerEventsSystem.removeOnPointerDown(entity)
    if (owner === undefined) continue
    pointerEventsSystem.onPointerDown(
      { entity, opts: { button: InputAction.IA_POINTER, hoverText: `${owner.name}'s place`, maxDistance: OWNER_CARD_REACH_METERS } },
      () => openOwnerCard(owner.address, owner.name)
    )
  }
}

/** Whether each owner's profile has a face, once looked up. */
const hasFace = new Map<string, boolean>()

// The engine fetches and caches the owner's face itself; a lot on sale shows none, an owner
// without a face (or not looked up yet) the fallback.
function setOwnerPicture(picture: Entity, address: string | undefined): void {
  if (address === undefined) {
    MeshRenderer.deleteFrom(picture)
    Material.deleteFrom(picture)
    return
  }
  MeshRenderer.setPlane(picture, OWNER_PICTURE_UVS)
  const face = hasFace.get(address)
  Material.setBasicMaterial(picture, {
    texture: face
      ? Material.Texture.Avatar({ userId: address })
      : Material.Texture.Common({ src: OWNER_PICTURE_FALLBACK })
  })
  if (face === undefined) lookUpFace(address)
}

/** Whether the owner's profile is known to have a face; the fallback picture stands in otherwise. */
export function ownerHasFace(address: string): boolean {
  return hasFace.get(address) === true
}

function lookUpFace(address: string): void {
  hasFace.set(address, false)
  // Stand-in owners have no wallet, so no profile either.
  if (!/^0x[0-9a-f]{40}$/i.test(address)) return
  executeTask(async () => {
    try {
      const response = await fetch(PROFILES_URL + address)
      const profile = (await response.json()) as { avatars?: { avatar?: { snapshots?: { face256?: string } } }[] }
      if (!profile.avatars?.[0]?.avatar?.snapshots?.face256) return
    } catch (error) {
      console.error(`[properties] could not look up the profile of ${address}`, error)
      return
    }
    hasFace.set(address, true)
    for (const [, property] of standing) {
      if (property.ownerAddress === address) setOwnerPicture(property.picture, address)
    }
  })
}

// Every lot nobody has, given to a made-up owner. Long and short names, to see both fit.
const STAND_IN_NAMES = ['Calamity Jane', 'Doc', 'Wild Bill Hickok', 'Annie Oakley', 'Butch', 'Jesse James']

function withStandIns(
  entries: readonly { kind: string; lot: number; address: string; name: string }[]
): { kind: string; lot: number; address: string; name: string }[] {
  const filled = [...entries]
  for (const [kind, area] of areas) {
    const taken = new Set(entries.filter((entry) => entry.kind === kind).map((entry) => entry.lot))
    for (let lot = 0; lot < area.lots.length; lot++) {
      if (taken.has(lot)) continue
      filled.push({ kind, lot, address: `debug-${lot}`, name: STAND_IN_NAMES[lot % STAND_IN_NAMES.length] })
    }
  }
  return filled
}

export function setupProperties(): void {
  for (const kind of PROPERTY_KINDS) buildArea(kind)
  engine.addSystem(syncLots, undefined, 'client:property-lots')
}
