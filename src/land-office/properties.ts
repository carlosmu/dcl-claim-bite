import {
  Billboard,
  BillboardMode,
  EasingFunction,
  engine,
  Entity,
  executeTask,
  GltfContainer,
  InputAction,
  Material,
  MeshRenderer,
  Name,
  pointerEventsSystem,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence
} from '@dcl/sdk/ecs'
import { Color3, Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { DEBUG_FILL_PROPERTY_LOTS, DEBUG_OWN_CABIN } from '../shared/debug-flags'
import { setBitmapText3d } from '../world/bitmap-text-3d'
import { openOwnerCard } from './owner-card'
import { getLanguage, hoverText, itemName, t, upper } from '../i18n'
import { PROPERTY_AREAS, PROPERTY_KINDS, PropertyKind, PropertyLots } from '../shared/net/property-lots-sync'

// The properties standing in town. Every lot of the grid laid over each kind's area has its
// property standing, with a sign by it: the owner's name, or FOR SALE while nobody has it.
// Which lot is whose comes from the server (PropertyLots).

const PROPERTY_MODELS: Record<PropertyKind, string> = {
  cabin: 'assets/models/cabin.glb',
  house: 'assets/models/house.gltf',
  ranch: 'assets/models/ranch.glb'
}

// A property further off wears a low-detail model (LOD1), so a town full of them stays cheap. It
// goes back to the low-detail one a little further out than it leaves it, so one on the edge does
// not flicker. Distance is measured from the model's origin (the middle of its front wall).
/** Kinds with a low-detail model; the others always wear the full one. */
const PROPERTY_LOD_MODELS: Partial<Record<PropertyKind, string>> = {
  house: 'assets/models/house_LOD1.gltf'
}
/** A property wears the full model once the player comes this close to it. */
const LOD_FULL_RADIUS_METERS = 50
/** And the low-detail one once they are this far from it. */
const LOD_LOW_RADIUS_METERS = 52
/** How often, in seconds, distances are checked. */
const LOD_CHECK_SECONDS = 0.25

/** The same sign stands by every kind of property. */
const OWNER_SIGN_MODEL = 'assets/models/owner.gltf'

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

/**
 * Kinds whose rows all face the same way as the first, each row standing right behind the one
 * before instead of pairing up face to face or back to back.
 */
const ROWS_FACE_ONE_WAY: Record<PropertyKind, boolean> = {
  cabin: false,
  house: false,
  ranch: true
}

/**
 * Extra metres left free between one row and the next, on top of the lot spacing. The first
 * row keeps its place on the area; each row after it is pushed further back by the gap.
 */
const ROW_GAP_METERS: Record<PropertyKind, number> = {
  cabin: 0,
  house: 0,
  ranch: 11
}

/** How many metres forward (-Z) the first row stands from its place on the area; the rest follow it. */
const FIRST_ROW_FORWARD_METERS: Record<PropertyKind, number> = {
  cabin: 0,
  house: 0,
  ranch: 3
}

/** Where the sign stands from the lot's origin (a front corner), and which way it faces. */
const OWNER_SIGN_OFFSET: Record<PropertyKind, Vector3> = {
  cabin: Vector3.create(-1.5, 0, 0.5),
  house: Vector3.create(-2, 0, 0.5),
  ranch: Vector3.create(0, 0, 0)
}
const OWNER_SIGN_YAW_DEGREES = 0

/** How high above the sign's foot the lettering starts, and which way it faces. */
const OWNER_NAME_HEIGHT_METERS = 0.6
const OWNER_TEXT_YAW_DEGREES = 180
/** Where the board stands within owner.glb, from its origin, as the scene sees it (X mirrored from the glTF). */
const OWNER_BOARD_X_METERS = 0
const OWNER_BOARD_Z_METERS = 0
/** How far in front of the sign's centre the lettering sits, so it does not sink into the board. */
const OWNER_TEXT_FORWARD_METERS = -0.06

/** "Property of" (sign.propertyOf) above, the owner's name below; sizes are metres per em of the western font. */
const OWNER_CAPTION_SIZE = 0.102
const OWNER_NAME_SIZE = 0.14
/** A long name shrinks to fit the board. */
const OWNER_NAME_MAX_WIDTH_METERS = 1.2
const OWNER_TEXT_COLOR = Color4.fromHexString('#2B1A0EFF')
/** Whether a lot with no owner has a sign at all, saying FOR SALE; without it the lot stands bare. */
const SHOW_VACANT_SIGN: boolean = false
/** What the sign says while the lot has no owner. */
const forSaleText = (kind: PropertyKind) => `${upper(itemName({ id: kind, label: kind }))}\n${t('sign.forSale')}`
const FOR_SALE_SIZE = 0.16
const FOR_SALE_COLOR = Color4.Black()
/** How much lower than the owner's lettering FOR SALE starts. */
const FOR_SALE_DROP_METERS = 0.1
/** The owner's profile picture, above the lettering ("Property of" and the name under it): how big it is, and the gap between its bottom edge and where the lettering starts. */
const OWNER_PICTURE_SIZE_METERS = 0.45
const OWNER_PICTURE_GAP_METERS = 0.04
/** The whole picture, the right way round on both faces (corners bottom-left, top-left, top-right, bottom-right). */
const OWNER_PICTURE_UVS = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0]
/** Shown while the owner's profile is looked up, and for good when it has no face. */
const OWNER_PICTURE_FALLBACK = 'assets/images/fallback_profile_pic.png'
const PROFILES_URL = 'https://peer.decentraland.org/lambdas/profiles/'

/**
 * A pin floating over the owner's own property, seen only by them: their profile picture in a
 * yellow frame, a stem pointing down at the roof, always turned to face the camera.
 * Where the stem's tip stands from the lot's origin: the middle of the front wall, the model
 * reaching back into -Z from it. Over the middle of the roof, a little above its ridge
 * (cabin 4.6 m tall and 4.1 deep, house 5.1 and 6.3, ranch 8.1 and 9.8).
 */
const PIN_OFFSET: Record<PropertyKind, Vector3> = {
  cabin: Vector3.create(0, 5.2, -2.05),
  house: Vector3.create(0, 5.7, -3.15),
  ranch: Vector3.create(0, 8.7, -4.9)
}
const PIN_PICTURE_SIZE_METERS = 2.4
const PIN_FRAME_METERS = 0.24
const PIN_STEM_LENGTH_METERS = 1.2
/** The pin bobs up from where it stands and back down, over and over: how far, and how long each way takes. */
const PIN_BOB_METERS = 0.5
const PIN_BOB_SECONDS = 1.2
const PIN_COLOR = Color4.fromHexString('#FFC81EFF')
const PIN_EMISSIVE_INTENSITY = 0.5

/** How far off an owned property can be clicked to see its owner's card. */
const OWNER_CARD_REACH_METERS = 12

/** Which end of each row the lots count from: the end nearest where players come in. */
const LOTS_FROM_PLUS_X: Record<PropertyKind, boolean> = {
  cabin: true,
  house: false,
  ranch: false
}

/** Kinds whose property stands on a lot nobody owns; the others only stand once someone has them. */
const SHOW_VACANT_PROPERTY: Record<PropertyKind, boolean> = {
  cabin: false,
  house: false,
  ranch: false
}

/** A lot on the area's grid, or (`parent`) a placeholder in the scene the property stands on as it is. */
type Lot = { corner: Vector3; yawDegrees: number; parent?: Entity }
type Area = { root: Entity; lots: Lot[] }
type StandingProperty = {
  kind: PropertyKind
  root: Entity
  /** The property and its sign, which open the owner's card while the lot is owned. */
  model: Entity
  /**
   * The low-detail model, for kinds that have one: a sibling of the full one, both loaded once and
   * the unused one scaled to zero. Swapping src on one entity reloads the glTF, and on mobile the
   * fresh instance flashes at the scene origin for a frame before it takes its parent.
   */
  lowModel?: Entity
  /** Whether the model is the low-detail one, and where its origin stands in the world (worked out on first need). */
  lowDetail: boolean
  worldPosition?: Vector3
  sign: Entity
  text: Entity
  picture: Entity
  /** The pin over the property, shown only while the local player owns it: the frame and stem, and the picture inside. */
  pin: Entity
  pinParts: Entity[]
  pinPicture: Entity
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
  const prefix = PROPERTY_AREAS[kind].placeholderPrefix
  if (prefix !== undefined) {
    buildPlaceholderArea(kind, area, prefix)
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
  // The lots spread evenly over the rows they need, centred on the area, rather than filling
  // every column of the first rows and leaving the last one short.
  const rowLength = Math.ceil(lotCount / Math.ceil(lotCount / columns))

  const root = engine.addEntity()
  Transform.create(root, { parent: areaTransform.parent, position: areaTransform.position })

  const lots: Lot[] = []
  for (let row = 0; row < rows && lots.length < lotCount; row++) {
    // Turning a lot round about its middle is the same as swapping which corner is its origin.
    const facesBack = (!ROWS_FACE_ONE_WAY[kind] && row % 2 === 1) !== LOTS_TURNED[kind]
    for (let column = 0; column < rowLength && lots.length < lotCount; column++) {
      // The lot's low corner on the area; a lot turned round has its origin there instead.
      // The first lots handed out are the nearest.
      const place = LOTS_FROM_PLUS_X[kind] ? rowLength - 1 - column : column
      const x = (-rowLength * spacingX) / 2 + spacingX * place
      const rowGap = ROW_GAP_METERS[kind]
      const z = (-rows * spacingZ) / 2 - FIRST_ROW_FORWARD_METERS[kind] + (spacingZ + rowGap) * row
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

// The placeholders (children of Ranches_Places for ranches) already stand where and how the model should: lot n is the n-th by number
// (Ranch_1, Ranch_2, … skipping any number missing), and the property stands on it unmoved.
function buildPlaceholderArea(kind: PropertyKind, area: Entity, prefix: string): void {
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  const placeholders: { entity: Entity; number: number }[] = []
  for (const [entity, transform] of engine.getEntitiesWith(Transform, Name)) {
    if (transform.parent !== area) continue
    const match = pattern.exec(Name.get(entity).value)
    if (match !== null) placeholders.push({ entity, number: Number(match[1]) })
  }
  placeholders.sort((a, b) => a.number - b.number)
  const { maxLots } = PROPERTY_AREAS[kind]
  if (placeholders.length !== maxLots) {
    console.error(`[properties] ${placeholders.length} "${prefix}<n>" placeholders for ${kind}s, but the server hands out ${maxLots} lots`)
  }
  const lots: Lot[] = placeholders.slice(0, maxLots).map(({ entity }) => ({ corner: Vector3.Zero(), yawDegrees: 0, parent: entity }))
  const built = { root: area, lots }
  areas.set(kind, built)
  lots.forEach((lot, index) => standing.set(`${kind}:${index}`, build(kind, built, lot)))
}

function build(kind: PropertyKind, area: Area, lot: Lot): StandingProperty {
  const root = engine.addEntity()
  Transform.create(root, {
    parent: lot.parent ?? area.root,
    position: Vector3.clone(lot.corner),
    rotation: Quaternion.fromEulerDegrees(0, lot.yawDegrees, 0)
  })

  const model = engine.addEntity()
  Transform.create(model, { parent: root, rotation: Quaternion.fromEulerDegrees(0, PROPERTY_YAW_DEGREES, 0) })
  let lowModel: Entity | undefined
  if (PROPERTY_LOD_MODELS[kind] !== undefined) {
    lowModel = engine.addEntity()
    Transform.create(lowModel, { parent: root, rotation: Quaternion.fromEulerDegrees(0, PROPERTY_YAW_DEGREES, 0), scale: Vector3.Zero() })
  }

  const ownerSign = engine.addEntity()
  Transform.create(ownerSign, {
    parent: root,
    position: Vector3.clone(OWNER_SIGN_OFFSET[kind]),
    rotation: Quaternion.fromEulerDegrees(0, OWNER_SIGN_YAW_DEGREES, 0)
  })

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
    position: Vector3.create(0, OWNER_PICTURE_GAP_METERS + OWNER_PICTURE_SIZE_METERS / 2, 0),
    scale: Vector3.create(OWNER_PICTURE_SIZE_METERS, OWNER_PICTURE_SIZE_METERS, 1)
  })

  const pin = buildPin(root, kind)

  const property: StandingProperty = { kind, root, model, lowModel, lowDetail: false, sign: ownerSign, text, picture, pin: pin.root, pinParts: pin.parts, pinPicture: pin.picture, shownName: null }
  // A kind that stands only once owned gets its model when syncLots finds the owner.
  setModels(property, SHOW_VACANT_PROPERTY[kind])
  return property
}

// Loads (or takes away) the full model and, for kinds that have one, the low-detail one beside it.
function setModels(property: StandingProperty, shown: boolean): void {
  const low = PROPERTY_LOD_MODELS[property.kind]
  const models: [Entity | undefined, string | undefined][] = [
    [property.model, PROPERTY_MODELS[property.kind]],
    [property.lowModel, low]
  ]
  for (const [entity, src] of models) {
    if (entity === undefined || src === undefined) continue
    if (!shown) GltfContainer.deleteFrom(entity)
    else if (!GltfContainer.has(entity)) GltfContainer.create(entity, { src })
  }
}

// Shows whichever of the two models the distance calls for, without reloading either.
function showLod(property: StandingProperty): void {
  if (property.lowModel === undefined) return
  Transform.getMutable(property.model).scale = property.lowDetail ? Vector3.Zero() : Vector3.One()
  Transform.getMutable(property.lowModel).scale = property.lowDetail ? Vector3.One() : Vector3.Zero()
}

// Every piece lies side by side in the pin's plane, none in front of another, so it reads the
// same from either face. Meshes are added only while the pin is shown (setPin).
function buildPin(root: Entity, kind: PropertyKind): { root: Entity; parts: Entity[]; picture: Entity } {
  // Bobbing and facing the camera on separate entities, so neither overrides the other.
  const bob = engine.addEntity()
  Transform.create(bob, { parent: root, position: Vector3.clone(PIN_OFFSET[kind]) })
  const pin = engine.addEntity()
  Transform.create(pin, { parent: bob })
  Billboard.create(pin, { billboardMode: BillboardMode.BM_Y })

  const size = PIN_PICTURE_SIZE_METERS
  const frame = PIN_FRAME_METERS
  const centre = PIN_STEM_LENGTH_METERS + frame + size / 2
  const part = (x: number, y: number, width: number, height: number): Entity => {
    const entity = engine.addEntity()
    Transform.create(entity, { parent: pin, position: Vector3.create(x, y, 0), scale: Vector3.create(width, height, 1) })
    return entity
  }
  const outer = size + frame * 2
  const parts = [
    part(0, centre + size / 2 + frame / 2, outer, frame), // top
    part(0, centre - size / 2 - frame / 2, outer, frame), // bottom
    part(-size / 2 - frame / 2, centre, frame, size), // left
    part(size / 2 + frame / 2, centre, frame, size), // right
    part(0, PIN_STEM_LENGTH_METERS / 2, frame, PIN_STEM_LENGTH_METERS) // stem
  ]
  return { root: bob, parts, picture: part(0, centre, size, size) }
}

function setPin(property: StandingProperty, address: string | undefined): void {
  // Only a pin that is shown bobs; a hidden one rests where it stands.
  const low = PIN_OFFSET[property.kind]
  if (address === undefined) {
    Tween.deleteFrom(property.pin)
    TweenSequence.deleteFrom(property.pin)
    Transform.getMutable(property.pin).position = Vector3.clone(low)
  } else if (!Tween.has(property.pin)) {
    const high = Vector3.add(low, Vector3.create(0, PIN_BOB_METERS, 0))
    Tween.setMove(property.pin, low, high, PIN_BOB_SECONDS * 1000, EasingFunction.EF_EASESINE)
    TweenSequence.createOrReplace(property.pin, { sequence: [], loop: TweenLoop.TL_YOYO })
  }
  for (const entity of property.pinParts) {
    if (address === undefined) {
      MeshRenderer.deleteFrom(entity)
      Material.deleteFrom(entity)
      continue
    }
    MeshRenderer.setPlane(entity)
    Material.setPbrMaterial(entity, {
      albedoColor: PIN_COLOR,
      emissiveColor: Color3.create(PIN_COLOR.r, PIN_COLOR.g, PIN_COLOR.b),
      emissiveIntensity: PIN_EMISSIVE_INTENSITY,
      castShadows: false
    })
  }
  setOwnerPicture(property.pinPicture, address)
}

// An upgrade moves the owner to the new kind's area, so their old lot goes back on sale.
function syncLots(): void {
  let entries: readonly { kind: string; lot: number; address: string; name: string }[] = []
  for (const [, lots] of engine.getEntitiesWith(PropertyLots)) entries = lots.lots
  if (DEBUG_FILL_PROPERTY_LOTS) entries = withStandIns(entries)

  const owners = new Map<string, { address: string; name: string }>()
  for (const entry of entries) owners.set(`${entry.kind}:${entry.lot}`, entry)

  // The wallet shows up a few frames after the scene starts; until then nothing reads as ours.
  const me = (getPlayer()?.userId ?? '').toLowerCase()
  if (DEBUG_OWN_CABIN && me !== '' && !entries.some((entry) => entry.address.toLowerCase() === me)) {
    owners.set('cabin:0', { address: me, name: getPlayer()?.name ?? 'Me' })
  }

  for (const [key, property] of standing) {
    const owner = owners.get(key)
    const mine = owner !== undefined && me !== '' && owner.address.toLowerCase() === me
    // Prefixed so an owner named "FOR SALE" still reads as owned; with the language, so a change rewrites it.
    const shown =
      `${getLanguage()}|${mine ? 'mine|' : ''}` + (owner === undefined ? forSaleText(property.kind) : `owner:${owner.address}:${owner.name}`)
    if (property.shownName === shown) continue
    property.shownName = shown
    Transform.getMutable(property.text).position.y = OWNER_NAME_HEIGHT_METERS - (owner === undefined ? FOR_SALE_DROP_METERS : 0)
    // The model is taken away, not just hidden, so a bare lot has no sign to bump into either.
    const hasModel = owner !== undefined || SHOW_VACANT_PROPERTY[property.kind]
    setModels(property, hasModel)
    const hasSign = owner !== undefined || SHOW_VACANT_SIGN
    if (!hasSign) GltfContainer.deleteFrom(property.sign)
    else if (!GltfContainer.has(property.sign)) GltfContainer.create(property.sign, { src: OWNER_SIGN_MODEL })
    setBitmapText3d(
      property.text,
      owner === undefined
        ? !hasSign
          ? []
          : [
              { value: upper(itemName({ id: property.kind, label: property.kind })), size: FOR_SALE_SIZE },
              { value: t('sign.forSale'), size: FOR_SALE_SIZE }
            ]
        : [
            { value: t('sign.propertyOf'), size: OWNER_CAPTION_SIZE },
            { value: upper(owner.name), size: OWNER_NAME_SIZE, maxWidth: OWNER_NAME_MAX_WIDTH_METERS }
          ],
      owner === undefined ? FOR_SALE_COLOR : OWNER_TEXT_COLOR
    )
    property.ownerAddress = owner?.address
    setOwnerPicture(property.picture, owner?.address)
    setPin(property, mine ? owner.address : undefined)
    setOwnerClick(property, owner)
  }
}

let lodTimer = 0

function syncLod(dt: number): void {
  lodTimer -= dt
  if (lodTimer > 0) return
  lodTimer = LOD_CHECK_SECONDS
  const player = Transform.getOrNull(engine.PlayerEntity)
  // Until the player's position arrives, everything keeps the model it has.
  if (player === null) return
  for (const [, property] of standing) {
    if (PROPERTY_LOD_MODELS[property.kind] === undefined) continue
    property.worldPosition ??= worldPosition(property.root)
    const radius = property.lowDetail ? LOD_FULL_RADIUS_METERS : LOD_LOW_RADIUS_METERS
    const lowDetail = Vector3.distanceSquared(property.worldPosition, player.position) > radius * radius
    if (lowDetail === property.lowDetail) continue
    property.lowDetail = lowDetail
    showLod(property)
  }
}

/** Where an entity stands in the world, through however many parents it has. */
export function worldPosition(entity: Entity): Vector3 {
  const transform = Transform.get(entity)
  let position = Vector3.clone(transform.position)
  let parent = transform.parent
  while (parent !== undefined && parent !== engine.RootEntity) {
    const p = Transform.getOrNull(parent)
    if (p === null) break
    position = Vector3.add(p.position, Vector3.rotate(Vector3.multiply(position, p.scale), p.rotation))
    parent = p.parent
  }
  return position
}

// A lot on sale answers no click: the Land Office is where it is bought.
function setOwnerClick(property: StandingProperty, owner: { address: string; name: string } | undefined): void {
  for (const entity of [property.model, property.lowModel, property.sign]) {
    if (entity === undefined) continue
    pointerEventsSystem.removeOnPointerDown(entity)
    if (owner === undefined) continue
    pointerEventsSystem.onPointerDown(
      { entity, opts: { button: InputAction.IA_POINTER, hoverText: hoverText(entity, 'hover.ownersPlace', { name: owner.name }), maxDistance: OWNER_CARD_REACH_METERS } },
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
  if (!hasFace.has(address)) lookUpFace(address)
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
      if (property.ownerAddress !== address) continue
      setOwnerPicture(property.picture, address)
      if (MeshRenderer.has(property.pinPicture)) setOwnerPicture(property.pinPicture, address)
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
  engine.addSystem(syncLod, undefined, 'client:property-lod')
}
