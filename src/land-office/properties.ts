import { engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { DEBUG_FILL_PROPERTY_LOTS } from '../shared/debug-flags'
import { setBitmapText3d } from '../world/bitmap-text-3d'
import { PROPERTY_AREAS, PROPERTY_KINDS, PropertyKind, PropertyLots } from '../shared/net/property-lots-sync'

// The properties standing in town. Every lot of the grid laid over each kind's area has its
// property standing, with a sign by it: the owner's name, or FOR SALE while nobody has it.
// Which lot is whose comes from the server (PropertyLots).

const PROPERTY_MODELS: Record<PropertyKind, string> = {
  cabin: 'assets/models/cabin.glb',
  house: 'assets/models/house.glb'
}

/** The same sign stands by every kind of property. */
const OWNER_SIGN_MODEL = 'assets/models/owner.glb'

/** Which way the whole lot faces — property and sign together — turned about Y. */
const LOT_YAW_DEGREES: Record<PropertyKind, number> = {
  cabin: -90,
  // Houses stand across town from the cabins, so they face the other way.
  house: 90
}

/** Which way the properties face within their lot, turned about Y. */
const PROPERTY_YAW_DEGREES = 0

/** Where the sign stands from the lot's centre, and which way it faces. */
const OWNER_SIGN_OFFSET = Vector3.create(0, 0, 0)
const OWNER_SIGN_YAW_DEGREES = 0

/** How high above the sign's foot the lettering starts, and which way it faces. */
const OWNER_NAME_HEIGHT_METERS = 1.0
const OWNER_TEXT_YAW_DEGREES = 180
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
const FOR_SALE_TEXT = 'FOR SALE'
const FOR_SALE_SIZE = 0.16

type Area = { root: Entity; lots: Vector3[] }
type StandingProperty = { root: Entity; text: Entity; shownName: string | null }

const areas = new Map<PropertyKind, Area>()
/** Keyed by kind and lot. */
const standing = new Map<string, StandingProperty>()

// The area is a plane turned flat: its X scale is the width, its Y scale the depth (Z).
function buildArea(kind: PropertyKind): void {
  const { areaName, spacingX, spacingZ } = PROPERTY_AREAS[kind]
  const area = engine.getEntityOrNullByName(areaName)
  if (area === null) {
    console.error(`[properties] no entity named "${areaName}" in the scene — ${kind}s have nowhere to stand`)
    return
  }
  const areaTransform = Transform.get(area)
  const width = areaTransform.scale.x
  const depth = areaTransform.scale.y
  const columns = Math.max(1, Math.floor(width / spacingX))
  const rows = Math.max(1, Math.floor(depth / spacingZ))
  // No more lots than the server may hand out, so none stands for sale that cannot be bought.
  const lotCount = Math.min(columns * rows, PROPERTY_AREAS[kind].maxLots)

  const root = engine.addEntity()
  Transform.create(root, { parent: areaTransform.parent, position: areaTransform.position })

  const lots: Vector3[] = []
  for (let row = 0; row < rows && lots.length < lotCount; row++) {
    for (let column = 0; column < columns && lots.length < lotCount; column++) {
      lots.push(Vector3.create(-width / 2 + spacingX * (column + 0.5), 0, -depth / 2 + spacingZ * (row + 0.5)))
    }
  }
  const built = { root, lots }
  areas.set(kind, built)
  lots.forEach((lot, index) => standing.set(`${kind}:${index}`, build(kind, built, lot)))
}

function build(kind: PropertyKind, area: Area, lot: Vector3): StandingProperty {
  const root = engine.addEntity()
  Transform.create(root, {
    parent: area.root,
    position: Vector3.clone(lot),
    rotation: Quaternion.fromEulerDegrees(0, LOT_YAW_DEGREES[kind], 0)
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
    position: Vector3.create(0, OWNER_NAME_HEIGHT_METERS, OWNER_TEXT_FORWARD_METERS),
    rotation: Quaternion.fromEulerDegrees(0, OWNER_TEXT_YAW_DEGREES, 0)
  })

  return { root, text, shownName: null }
}

// An upgrade moves the owner to the new kind's area, so their old lot goes back on sale.
function syncLots(): void {
  let entries: readonly { kind: string; lot: number; address: string; name: string }[] = []
  for (const [, lots] of engine.getEntitiesWith(PropertyLots)) entries = lots.lots
  if (DEBUG_FILL_PROPERTY_LOTS) entries = withStandIns(entries)

  const owners = new Map<string, string>()
  for (const entry of entries) owners.set(`${entry.kind}:${entry.lot}`, entry.name)

  for (const [key, property] of standing) {
    const owner = owners.get(key)
    // Prefixed so an owner named "FOR SALE" still reads as owned.
    const shown = owner === undefined ? FOR_SALE_TEXT : `owner:${owner}`
    if (property.shownName === shown) continue
    property.shownName = shown
    setBitmapText3d(
      property.text,
      owner === undefined
        ? [{ value: FOR_SALE_TEXT, size: FOR_SALE_SIZE }]
        : [
            { value: OWNER_CAPTION, size: OWNER_CAPTION_SIZE },
            { value: owner.toUpperCase(), size: OWNER_NAME_SIZE, maxWidth: OWNER_NAME_MAX_WIDTH_METERS }
          ],
      OWNER_TEXT_COLOR
    )
  }
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
