import {
  Animator,
  AudioSource,
  Billboard,
  BillboardMode,
  EasingFunction,
  ColliderLayer,
  engine,
  Entity,
  Font,
  GltfContainer,
  InputAction,
  Material,
  MeshRenderer,
  pointerEventsSystem,
  TextAlignMode,
  TextShape,
  Transform,
  Tween,
  TweenLoop,
  TweenSequence
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { WESTERN_FONT_SRC } from '../ui/bitmap-text'
import { focusPanel, registerPanel } from '../world/panel-focus'
import { MULE_YARD_COLUMNS, MULE_YARD_ROWS, MuleYard } from '../shared/net/mule-yard-sync'
import { DEBUG_FILL_MULE_YARD } from '../shared/debug-flags'
import { sfxVolume } from '../world/volume'

// The idle rigs standing in the world. They dig straight into the player's storage; walking up
// to your rig is where you check on it. Fuel is bought at the General Store.

export const MULE_ENTITY_NAME = 'MULE'
export const MULE_RADIUS_METERS = 5

/** How high above the rig's origin the centre of the owner's panel floats. */
const PANEL_HEIGHT_METERS = 1.8

/** How far along Z the owner's panel stands from the rig's origin. */
const PANEL_OFFSET_Z_METERS = -0.3

/** Where the owner's panel stands, from the rig's origin. */
const PANEL_POSITION = Vector3.create(0, PANEL_HEIGHT_METERS, PANEL_OFFSET_Z_METERS)

/** How big the owner's panel is drawn, against the sizes below; the player's own is this times OWN_PANEL_SCALE. */
const PANEL_SCALE = 0.75
const PANEL_SCALE_VECTOR = Vector3.create(PANEL_SCALE, PANEL_SCALE, PANEL_SCALE)

/** How far the owner's panel is tilted around X. */
const PANEL_TILT_X_DEGREES = 0
const PANEL_ROTATION = Quaternion.fromEulerDegrees(PANEL_TILT_X_DEGREES, 180, 0)

export function isPlayerAtMule(): boolean {
  return atOwnMule
}

// The panel opens by walking up to your rig, or by clicking it from further off. Closing it only
// hides it for this visit: walking into or out of the rig's zone, or clicking it, opens it again.
let panelClosed = false
let openedByClick = false

/** How far you can be from your rig and still click it open. */
const CLICK_REACH_METERS = 12

/** A panel opened by a click stays up until you wander this far from the rig. */
const CLICK_KEEP_METERS = 16

export function isMulePanelOpen(): boolean {
  return (atOwnMule || openedByClick) && !panelClosed
}

export function closeMulePanel(): void {
  panelClosed = true
  // Otherwise stepping out of the zone, which reopens a closed panel, would bring back one that
  // was opened by a click and then closed.
  openedByClick = false
}


// --- The yard ------------------------------------------------------------------------------
//
// Every owner's rig stands in its own spot of a grid laid over `Mule_Area`. Which spot is whose comes from the server (MuleYard). Rigs use
// `mule-1.glb` unless a `MULE` is placed in the Creator Hub as a template: then its model is
// copied onto each parked rig and the original is emptied, so it can stay where it is for tuning
// without standing around twice.

export const MULE_AREA_ENTITY_NAME = 'Mule_Area'

// The owner's panel, in metres: face on top, the name under it and the rig count at the bottom.
const PANEL_PADDING = 0.05

const FACE_SIZE_METERS = 0.44
const FACE_FRAME = 0.018
const FACE_FRAME_SIZE = FACE_SIZE_METERS + FACE_FRAME * 2

/** Metres per em, as bitmap-text-3d counts them; TextShape's fontSize is 10 to the metre. */
const NAME_SIZE = 0.13
/** The rig count is the second line of the same text as the name, so it shares its size. */
const COUNT_SIZE = NAME_SIZE
const FACE_TO_NAME_GAP = 0.04
const NAME_TO_COUNT_GAP = 0.03

const PANEL_HEIGHT = PANEL_PADDING * 2 + FACE_FRAME_SIZE + FACE_TO_NAME_GAP + NAME_SIZE + NAME_TO_COUNT_GAP + COUNT_SIZE
/** The panel is square. */
const PANEL_WIDTH = PANEL_HEIGHT

/** What fits the panel in the western font, which averages 0.72 em per character. */
const NAME_MAX_CHARACTERS = Math.floor((PANEL_WIDTH - PANEL_PADDING * 2) / (NAME_SIZE * 0.72))

// Stacked down from the panel's top edge: face, name, count.
const FACE_Y = PANEL_HEIGHT / 2 - PANEL_PADDING - FACE_FRAME_SIZE / 2
const NAME_Y = FACE_Y - FACE_FRAME_SIZE / 2 - FACE_TO_NAME_GAP - NAME_SIZE / 2
const COUNT_Y = NAME_Y - NAME_SIZE / 2 - NAME_TO_COUNT_GAP - COUNT_SIZE / 2
/** Name and count are one two-line text, centred between where each line sits. */
const LABEL_Y = (NAME_Y + COUNT_Y) / 2

// Layers towards the panel's readable side, its -Z. The text stands well clear of the background,
// so it is never painted over when the panel is seen at an angle.
const LAYER_FACE_Z = -0.03
const LAYER_TEXT_Z = -0.12

/** #5A493B, the lighter tone of the reference swatch */
const PANEL_BACKGROUND = Color4.create(0.35, 0.29, 0.23, 1)
const PANEL_CREAM = Color4.create(0.96, 0.9, 0.78, 1)

type ParkedMule = {
  root: Entity
  panel: Entity
  label: Entity
  face: Entity
  faceResolved: boolean
  panelShown: boolean
  /** Which model the rig wears now: the full one, the low-detail one, or none yet. */
  model: 'full' | 'lod' | null
}

const parked = new Map<string, ParkedMule>()
let spots: Vector3[] = []
let yardRoot: Entity | null = null
/** The rig's model; a `MULE` placed in the Creator Hub overrides it (see adoptTemplate). */
let muleModel = 'assets/animations/mule-1.glb'
/** The clip that comes with the rig's model, played on a loop. */
const MULE_ANIMATION_CLIP = 'mule'
let myAddress = ''
/** The player's own rig, which is what the proximity check measures against. */
let ownMule: Entity | null = null
let atOwnMule = false

// Across the area the rigs sit like airplane seats: a block of rigs side by side, an aisle, the
// next block... Across, the outer blocks sit right against the area's edges; the rigs keep a
// fixed spacing and the aisles share what is left, so narrowing `Mule_Area` narrows the aisles.
// Front to back too: four rows, an aisle, four rows..., with aisles as wide as the ones across,
// centred in the area's depth.
/** Rigs side by side in one block, across the area (X). */
const MULE_BLOCK_COLUMNS = 3
/** Rows one behind the other in one block, along the area (Z). */
const MULE_BLOCK_ROWS = 4
/** Distance between neighbouring rigs of one block across the area (X), centre to centre, in metres. */
const MULE_SEAT_METERS = 1.05
/** Distance between neighbouring rows of one block along the area (Z), centre to centre, in metres. */
const MULE_ROW_METERS = 1.05

/**
 * Where each of `count` rigs stands along an axis `length` long, centred on 0, in blocks of
 * `blockSize` with aisles between. With no `aisleWidth` the aisles share what the rigs leave, so
 * the outer blocks touch the ends; with one, the yard keeps those aisles and sits centred, unless
 * that would not fit.
 */
function blockLayout(length: number, count: number, pitch: number, blockSize: number, aisleWidth?: number): { positions: number[]; aisle: number } {
  const aisles = Math.ceil(count / blockSize) - 1
  // An area too short for the rigs in a line squeezes them, with no aisles left.
  const spacing = Math.min(pitch, length / count)
  const fill = aisles > 0 ? (length - spacing * count) / aisles : 0
  const aisle = aisleWidth === undefined ? fill : Math.min(aisleWidth, fill)
  const span = spacing * count + aisle * aisles
  const positions: number[] = []
  for (let i = 0; i < count; i++) {
    positions.push(-span / 2 + spacing * (i + 0.5) + aisle * Math.floor(i / blockSize))
  }
  return { positions, aisle }
}

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
  const across = blockLayout(width, MULE_YARD_COLUMNS, MULE_SEAT_METERS, MULE_BLOCK_COLUMNS)
  // Front to back the aisles are as wide as the ones across, and the rows sit centred in the depth.
  const along = blockLayout(depth, MULE_YARD_ROWS, MULE_ROW_METERS, MULE_BLOCK_ROWS, across.aisle)
  const xs = across.positions
  const zs = along.positions

  yardRoot = engine.addEntity()
  Transform.create(yardRoot, { parent: areaTransform.parent, position: areaTransform.position })

  for (const z of zs) {
    for (const x of xs) spots.push(Vector3.create(x, 0, z))
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

function plate(parent: Entity, x: number, y: number, z: number, width: number, height: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position: Vector3.create(x, y, z), scale: Vector3.create(width, height, 1) })
  MeshRenderer.setPlane(entity)
  return entity
}

function solidPlate(parent: Entity, x: number, y: number, z: number, width: number, height: number, diffuseColor: Color4): void {
  Material.setBasicMaterial(plate(parent, x, y, z, width, height), { diffuseColor, castShadows: false })
}


function panelText(parent: Entity, y: number, size: number): Entity {
  const entity = engine.addEntity()
  Transform.create(entity, { parent, position: Vector3.create(0, y, LAYER_TEXT_Z) })
  TextShape.create(entity, {
    text: '',
    fontSize: size * 10,
    fontSrc: WESTERN_FONT_SRC,
    font: Font.F_SERIF,
    textColor: PANEL_CREAM,
    textAlign: TextAlignMode.TAM_MIDDLE_CENTER,
    textWrapping: false
  })
  return entity
}

// A plain, opaque square: no border, no notched corners.
function panelBackground(panel: Entity): void {
  solidPlate(panel, 0, 0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_BACKGROUND)
}

/** Keeps a long name from pushing past the panel's edge. */
function fitName(name: string): string {
  const characters = Array.from(name)
  if (characters.length <= NAME_MAX_CHARACTERS) return name
  return characters.slice(0, NAME_MAX_CHARACTERS - 1).join('').trimEnd() + '…'
}

function park(address: string): ParkedMule {
  const root = engine.addEntity()
  Transform.create(root, { parent: yardRoot ?? undefined })
  // The model goes on in syncModel, full or low-detail by how near the player is.
  const panel = engine.addEntity()
  Transform.create(panel, {
    parent: root,
    position: Vector3.clone(PANEL_POSITION),
    rotation: { ...PANEL_ROTATION },
    scale: Vector3.clone(PANEL_SCALE_VECTOR)
  })
  // Always turned to face the player, upright: only around Y, so it never leans back.
  Billboard.create(panel, { billboardMode: BillboardMode.BM_Y })
  panelBackground(panel)

  // The owner's face. The avatar texture is fetched by address, so it works for an owner who is
  // away too; it only drops to the fallback picture if the owner shows up as a guest (see
  // resolveFace).
  const face = plate(panel, 0, FACE_Y, LAYER_FACE_Z, FACE_SIZE_METERS, FACE_SIZE_METERS)
  // A stand-in has no avatar to fetch, which would leave the plate blank.
  setFace(
    face,
    address.startsWith(STAND_IN_ADDRESS_PREFIX)
      ? Material.Texture.Common({ src: FALLBACK_FACE_IMAGE })
      : Material.Texture.Avatar({ userId: address })
  )

  const mule: ParkedMule = {
    root,
    panel,
    label: panelText(panel, LABEL_Y, NAME_SIZE),
    face,
    faceResolved: false,
    panelShown: true,
    model: null
  }
  parked.set(address, mule)
  return mule
}

const FALLBACK_FACE_IMAGE = 'assets/images/fallback_profile_pic.png'

// Unlit so the face reads the same in the shade as in the sun.
function setFace(face: Entity, texture: ReturnType<typeof Material.Texture.Common>): void {
  Material.setBasicMaterial(face, { texture })
}

// A guest has no profile, so the avatar texture comes out blank; they get the fallback instead.
// Only a player in the scene can be told apart as a guest, so an absent owner keeps the avatar
// texture, and this is retried until the owner's profile arrives.
function resolveFace(address: string, mule: ParkedMule): void {
  if (mule.faceResolved) return
  const player = getPlayer({ userId: address })
  if (player === null) return
  mule.faceResolved = true
  if (!player.isGuest) return
  setFace(mule.face, Material.Texture.Common({ src: FALLBACK_FACE_IMAGE }))
}

function unpark(address: string, mule: ParkedMule): void {
  engine.removeEntityWithChildren(mule.root)
  parked.delete(address)
}

type YardEntry = { slot: number; address: string; name: string; level: number }

// Every spot nobody has, given to a made-up owner. Long and short names, to see both fit.
const STAND_IN_NAMES = ['Calamity Jane', 'Doc', 'Wild Bill Hickok', 'Annie Oakley', 'Butch', 'Jesse James']
const STAND_IN_ADDRESS_PREFIX = 'debug-mule-'

function withStandIns(entries: readonly YardEntry[]): YardEntry[] {
  const filled = [...entries]
  const taken = new Set(entries.map((entry) => entry.slot))
  for (let slot = 0; slot < spots.length; slot++) {
    if (taken.has(slot)) continue
    filled.push({ slot, address: `${STAND_IN_ADDRESS_PREFIX}${slot}`, name: STAND_IN_NAMES[slot % STAND_IN_NAMES.length], level: 1 + (slot % 5) })
  }
  return filled
}

// A rig is only parked in the world while the player is near its spot; further off it is taken
// down, model, panel and all, and put back on the way in. Taking it down a little further out than
// it comes back keeps one on the edge from flickering in and out.
/** A rig is put up once the player comes this close to its spot. */
const MULE_SHOW_RADIUS_METERS = 40
/** And taken down once they are this far from it. */
const MULE_HIDE_RADIUS_METERS = 45

function isNearPlayer(spot: Vector3, player: Vector3 | undefined, shown: boolean): boolean {
  return isWithin(spot, player, shown ? MULE_HIDE_RADIUS_METERS : MULE_SHOW_RADIUS_METERS)
}

function isWithin(spot: Vector3, player: Vector3 | undefined, radius: number): boolean {
  // Until the player's position arrives, nothing is put up.
  if (player === undefined) return false
  const world = yardPointToWorld(spot)
  if (world === null) return false
  return Vector3.distanceSquared(world, player) <= radius * radius
}

// The owner's panel only shows on rigs close to the player and in front of them (where the
// camera looks), so a full yard is not a wall of signs; the player's own panel always shows, so
// their rig is easy to find. Same give as the rigs: it hides a little further out than it shows.
/** A panel shows once the player comes this close to its rig. */
const PANEL_SHOW_RADIUS_METERS = 6
/** And hides once they are this far from it. */
const PANEL_HIDE_RADIUS_METERS = 7
/** A panel shows once its rig is within this angle either side of where the camera looks. */
const PANEL_SHOW_HALF_ANGLE_DEGREES = 45
/** And hides once the rig is further off to the side than this. */
const PANEL_HIDE_HALF_ANGLE_DEGREES = 55

/** Whether the spot lies within `halfAngleDegrees` of the camera's heading, on the ground plane. */
function isInFront(spot: Vector3, player: Vector3 | undefined, halfAngleDegrees: number): boolean {
  if (player === undefined) return false
  const camera = Transform.getOrNull(engine.CameraEntity)
  const world = yardPointToWorld(spot)
  if (camera === null || world === null) return false
  const forward = Vector3.rotate(Vector3.Forward(), camera.rotation)
  const toSpot = Vector3.create(world.x - player.x, 0, world.z - player.z)
  const heading = Vector3.create(forward.x, 0, forward.z)
  const lengths = Vector3.length(toSpot) * Vector3.length(heading)
  // Standing on the spot, or looking straight down: counts as in front.
  if (lengths < 1e-4) return true
  return Vector3.dot(toSpot, heading) / lengths >= Math.cos((halfAngleDegrees * Math.PI) / 180)
}

// Rigs further off wear a low-detail model with no animation, so a full yard stays cheap. Same
// give as the rest: a rig goes back to the low-detail one a little further out than it leaves it.
const MULE_LOD_MODEL = 'assets/animations/mule-LOD.glb'
/** A rig wears the full model once the player comes this close to it. */
const MULE_FULL_RADIUS_METERS = 5
/** And the low-detail one once they are this far from it. */
const MULE_LOD_RADIUS_METERS = 6

function syncModel(mule: ParkedMule, spot: Vector3, player: Vector3 | undefined): void {
  if (muleModel === '') return
  const wantFull = isWithin(spot, player, mule.model === 'full' ? MULE_LOD_RADIUS_METERS : MULE_FULL_RADIUS_METERS)
  const model = wantFull ? 'full' : 'lod'
  if (model === mule.model) return
  mule.model = model
  if (model === 'full') {
    // Visible meshes on the pointer layer only, so the rig can be clicked; physics stays on the
    // invisible collision meshes as before.
    GltfContainer.createOrReplace(mule.root, {
      src: muleModel,
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
      invisibleMeshesCollisionMask: ColliderLayer.CL_POINTER | ColliderLayer.CL_PHYSICS
    })
    Animator.createOrReplace(mule.root, { states: [{ clip: MULE_ANIMATION_CLIP, playing: true, loop: true }] })
  } else {
    // The low-detail model has no collision meshes, so its visible ones take the pointer: your own
    // rig can still be clicked from afar. Nobody walks into a rig this far off.
    GltfContainer.createOrReplace(mule.root, {
      src: MULE_LOD_MODEL,
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER,
      invisibleMeshesCollisionMask: 0
    })
    Animator.deleteFrom(mule.root)
  }
}

// Hidden by scaling the panel to zero, which takes the face and the text with it: the Explorer
// does not carry VisibilityComponent down to a child TextShape.
function syncPanelVisibility(mule: ParkedMule, spot: Vector3, player: Vector3 | undefined, own: boolean): void {
  const shown = mule.panelShown
  const show =
    own ||
    (isWithin(spot, player, shown ? PANEL_HIDE_RADIUS_METERS : PANEL_SHOW_RADIUS_METERS) &&
      isInFront(spot, player, shown ? PANEL_HIDE_HALF_ANGLE_DEGREES : PANEL_SHOW_HALF_ANGLE_DEGREES))
  const wasShown = mule.panelShown
  mule.panelShown = show
  const scale = Transform.get(mule.panel).scale
  if (!show) {
    // Checked every frame: putting a panel back in line (raiseOwnPanel) resets its scale.
    if (!Vector3.equals(scale, Vector3.Zero())) Transform.getMutable(mule.panel).scale = Vector3.Zero()
  } else if (!wasShown) {
    Transform.getMutable(mule.panel).scale = Vector3.clone(PANEL_SCALE_VECTOR)
  }
}

function syncYard(): void {
  if (yardRoot === null) return
  if (myAddress === '') myAddress = (getPlayer()?.userId ?? '').toLowerCase()

  let entries: readonly { slot: number; address: string; name: string; level: number }[] = []
  for (const [, yard] of engine.getEntitiesWith(MuleYard)) entries = yard.mules
  if (DEBUG_FILL_MULE_YARD) entries = withStandIns(entries)

  const player = Transform.getOrNull(engine.PlayerEntity)

  const seen = new Set<string>()
  ownMule = null
  let ownParked: ParkedMule | null = null
  for (const entry of entries) {
    const spot = spots[entry.slot]
    if (spot === undefined) continue
    if (!isNearPlayer(spot, player?.position, parked.has(entry.address))) continue
    seen.add(entry.address)

    const mule = parked.get(entry.address) ?? park(entry.address)
    resolveFace(entry.address, mule)
    const transform = Transform.getMutable(mule.root)
    if (!Vector3.equals(transform.position, spot)) transform.position = Vector3.clone(spot)

    const levelText = `${entry.level} ${entry.level === 1 ? 'M.U.L.E.' : 'M.U.L.E.s'}`
    const labelText = `${fitName(entry.name)}\n${levelText}`
    if (TextShape.get(mule.label).text !== labelText) TextShape.getMutable(mule.label).text = labelText

    const own = entry.address.toLowerCase() === myAddress
    syncPanelVisibility(mule, spot, player?.position, own)
    syncModel(mule, spot, player?.position)
    if (own) {
      ownMule = mule.root
      ownParked = mule
    }
  }

  for (const [address, mule] of parked) {
    if (!seen.has(address)) unpark(address, mule)
  }
  makeClickable(ownMule)
  raiseOwnPanel(ownParked?.panel ?? null)
  syncYardSound(parked.size > 0)
}

// The rigs' running sound loops from the centre of `Mule_Area` (where the yard's root stands, clear
// of the plane's scale and hidden flag) while at least one is parked. It is a loop, so
// unlike the one-shots it is kept following the effects slider while it plays.
const YARD_SOUND = 'assets/sounds/mule.mp3'

function syncYardSound(running: boolean): void {
  if (yardRoot === null) return
  const volume = sfxVolume()
  const audio = AudioSource.getOrNull(yardRoot)
  if (audio === null) {
    if (!running) return
    AudioSource.create(yardRoot, { audioClipUrl: YARD_SOUND, playing: true, loop: true, volume, global: false })
    return
  }
  if (audio.playing !== running || audio.volume !== volume) {
    const mutable = AudioSource.getMutable(yardRoot)
    mutable.playing = running
    mutable.volume = volume
  }
}

// The player's own panel floats higher than the neighbours', bigger, standing straight and bobbing
// up and down, so their rig is easy to find in a full yard.
/** How much higher than the rest the player's own panel floats, at the bottom of its bob. */
const OWN_PANEL_RAISE_METERS = 1
const OWN_PANEL_BOB_METERS = 0.5
/** One way of the bob, in milliseconds; it then comes back the same way. */
const OWN_PANEL_BOB_MS = 1000
const OWN_PANEL_SCALE = 1.5
/** Stands straight: the others' tilt is left out. */
const OWN_PANEL_ROTATION = Quaternion.fromEulerDegrees(0, 180, 0)

let raisedPanel: Entity | null = null

function raiseOwnPanel(panel: Entity | null): void {
  if (panel === raisedPanel) return
  // Back in line with the rest; the old one may already be gone (unpark removes children).
  if (raisedPanel !== null && Transform.getOrNull(raisedPanel) !== null) {
    Tween.deleteFrom(raisedPanel)
    TweenSequence.deleteFrom(raisedPanel)
    const transform = Transform.getMutable(raisedPanel)
    transform.position = Vector3.clone(PANEL_POSITION)
    transform.rotation = { ...PANEL_ROTATION }
    transform.scale = Vector3.clone(PANEL_SCALE_VECTOR)
  }
  raisedPanel = panel
  if (panel === null) return

  const low = Vector3.add(PANEL_POSITION, Vector3.create(0, OWN_PANEL_RAISE_METERS, 0))
  const high = Vector3.add(low, Vector3.create(0, OWN_PANEL_BOB_METERS, 0))
  const transform = Transform.getMutable(panel)
  transform.position = low
  transform.rotation = { ...OWN_PANEL_ROTATION }
  transform.scale = Vector3.scale(PANEL_SCALE_VECTOR, OWN_PANEL_SCALE)
  Tween.setMove(panel, low, high, OWN_PANEL_BOB_MS, EasingFunction.EF_EASESINE)
  TweenSequence.createOrReplace(panel, { sequence: [], loop: TweenLoop.TL_YOYO })
}

// Only your own rig answers a click: the panel shows your fleet, not a neighbour's.
let clickable: Entity | null = null

function makeClickable(mule: Entity | null): void {
  if (mule === clickable) return
  // The old one may be gone already (unpark removes it), so only a live one is unhooked.
  if (clickable !== null && Transform.getOrNull(clickable) !== null) pointerEventsSystem.removeOnPointerDown(clickable)
  clickable = mule
  if (mule === null) return
  pointerEventsSystem.onPointerDown(
    { entity: mule, opts: { button: InputAction.IA_POINTER, hoverText: 'Open M.U.L.E.', maxDistance: CLICK_REACH_METERS } },
    () => {
      openedByClick = true
      panelClosed = false
      focusPanel('mule')
    }
  )
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

/** A point given in `parent`'s space, in world space, through however many parents it has. */
function toWorld(parent: Entity | undefined, point: Vector3): Vector3 {
  let position = Vector3.clone(point)
  while (parent !== undefined && parent !== engine.RootEntity) {
    const p = Transform.getOrNull(parent)
    if (p === null) break
    position = Vector3.add(p.position, Vector3.rotate(Vector3.multiply(position, p.scale), p.rotation ?? Quaternion.Identity()))
    parent = p.parent
  }
  return position
}

/** An entity's position in world space, through however many parents it has. */
function worldPosition(entity: Entity): Vector3 | null {
  const t = Transform.getOrNull(entity)
  if (t === null) return null
  return toWorld(t.parent, t.position)
}

/** A point in the yard's own space (where the rigs' positions live), in world space. */
export function yardPointToWorld(point: Vector3): Vector3 | null {
  if (yardRoot === null) return null
  return toWorld(yardRoot, point)
}

export type YardBounds = { minX: number; maxX: number; minZ: number; maxZ: number; y: number }

/** The rectangle the parked rigs' origins span, in the yard's own space; null with the yard empty. */
export function getParkedMuleBounds(): YardBounds | null {
  let bounds: YardBounds | null = null
  for (const [, mule] of parked) {
    const t = Transform.getOrNull(mule.root)
    if (t === null) continue
    const { x, y, z } = t.position
    if (bounds === null) {
      bounds = { minX: x, maxX: x, minZ: z, maxZ: z, y }
    } else {
      bounds.minX = Math.min(bounds.minX, x)
      bounds.maxX = Math.max(bounds.maxX, x)
      bounds.minZ = Math.min(bounds.minZ, z)
      bounds.maxZ = Math.max(bounds.maxZ, z)
    }
  }
  return bounds
}

// Distance to the player's own rig, measured every frame like the other proximity zones.
function checkOwnMule(): void {
  let distance = Infinity
  if (ownMule !== null) {
    const player = Transform.getOrNull(engine.PlayerEntity)
    // The yard hangs off whatever `Mule_Area` is parented to, so the rig is walked up to world space.
    const mulePosition = worldPosition(ownMule)
    if (player !== null && mulePosition !== null) distance = Vector3.distance(player.position, mulePosition)
  }
  const inside = distance <= MULE_RADIUS_METERS
  if (openedByClick && distance > CLICK_KEEP_METERS) openedByClick = false
  showIndicator(isMulePanelOpen() ? ownMule : null)
  if (inside === atOwnMule) return
  atOwnMule = inside
  panelClosed = false
  if (isMulePanelOpen()) focusPanel('mule')
  console.log(`[mule] player ${inside ? 'reached' : 'left'} their M.U.L.E.`)
}

export function setupMule(): void {
  registerPanel('mule', closeMulePanel)
  adoptTemplate()
  buildGrid()
  engine.addSystem(syncYard, undefined, 'client:mule-yard')
  engine.addSystem(checkOwnMule, undefined, 'client:mule-proximity')
}
