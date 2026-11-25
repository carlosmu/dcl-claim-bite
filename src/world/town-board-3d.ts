import {
  AvatarBase,
  ColliderLayer,
  engine,
  Entity,
  GltfContainer,
  InputAction,
  Material,
  MeshCollider,
  MeshRenderer,
  PlayerIdentityData,
  pointerEventsSystem,
  Transform
} from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { hoverText, itemName, t, upper } from '../i18n'
import { ownerHasFace, worldPosition } from '../land-office/properties'
import { findItem, ShopItemId } from '../shared/economy/catalogue'
import { getTownTitles } from '../shared/net/town-titles-sync'
import { NEW_OWNERS_SHOWN, TitleId } from '../shared/titles'
import { BitmapLine, setBitmapText3d } from './bitmap-text-3d'

// --- The Town Board, in the plaza ----------------------------------------------------------
//
// Lettering on the town's billboard, one page at a time like the Town Board panel: a page for each
// title (its holder's picture, or a dash while nobody holds it), one for each of the town's figures
// (ore mined by hand and dug by rigs over the last seven days, the coins every player holds now,
// coins spent on purchases over the last seven days), the newest property owners, and whoever is
// in the scene now. Arrows either side turn the
// page, for this player only. Whatever had nothing this week shows last week's, and says so. The
// server works it all out (server/titles.ts) and syncs it in TownTitles; this only draws what it
// last said, in the player's language.
//
// The arrows: scene entities named PREV_ARROW_ENTITY_NAME / NEXT_ARROW_ENTITY_NAME if the Creator Hub
// has both (clicked through their own collider, or a plane one added here), otherwise drawn here.
//
// Where it stands: on the scene entity named TOWN_BOARD_ENTITY_NAME, a 1×1 plane the Creator Hub
// places, turns and scales: the lettering is laid out on a BOARD_WIDTH × BOARD_HEIGHT board and shrunk
// evenly to fit inside that plane, centred on it. While the scene has none, it stands at FALLBACK_POSITION.

/** The scene entity the board stands on. */
const TOWN_BOARD_ENTITY_NAME = 'town-board'
/** Scene entities that, if both exist, turn the page instead of the arrows drawn here. */
const PREV_ARROW_ENTITY_NAME = 'town-board-prev'
const NEXT_ARROW_ENTITY_NAME = 'town-board-next'
/** Where the board stands, in the scene, while there is no TOWN_BOARD_ENTITY_NAME entity. */
const FALLBACK_POSITION = Vector3.create(6, 0, -44)
const FALLBACK_YAW_DEGREES = 0

/** The board the lettering is laid out on (no plane of its own), its bottom edge this high off the ground at FALLBACK_POSITION. Metres. */
const BOARD_WIDTH = 4
const BOARD_HEIGHT = 3.2
const BOARD_BOTTOM = 1

/** Which way the lettering faces, turned about Y, and how far in front of the plane it sits so it does not sink in. */
const TEXT_YAW_DEGREES = 0
const TEXT_FORWARD_METERS = -0.03
/** Room left between the top edge and the first line. */
const TEXT_TOP_MARGIN = 0.18
/** No line runs wider than this: a long one shrinks to fit. */
const TEXT_MAX_WIDTH = BOARD_WIDTH - 0.4
/** A page's lines leave room for the arrows either side. */
const PAGE_MAX_WIDTH = BOARD_WIDTH - 1.2

/** The drawn arrows: how far from the middle, how high up, their size (metres per em), and the square that takes the click. */
const ARROW_X = BOARD_WIDTH / 2 - 0.3
const ARROW_Y = BOARD_HEIGHT * 0.45
const ARROW_SIZE = 0.45
const ARROW_HIT_SIZE = 0.5
/** How far away the arrows can be clicked from. */
const ARROW_REACH_METERS = 12

/** Where the page count stands: the top of its line, off the bottom edge. */
const COUNTER_Y = 0.3

/** Sizes in metres per em of the western font. */
const TITLE_SIZE = 0.3
const SUBTITLE_SIZE = 0.15
const ROW_SIZE = 0.13
const GAP_SIZE = 0.1
/** A title's page: its name, who holds it. */
const PAGE_TITLE_SIZE = 0.22
const HOLDER_SIZE = 0.18
/** A figure that has a page to itself (ore by hand, ore by rigs): how big the number reads. */
const FIGURE_SIZE = 0.45

/** The holder's profile picture, between the title and their name: its size, the gold frame round it, and the room left above and below. Metres. */
const PHOTO_SIZE = 0.9
const PHOTO_FRAME = 0.04
const PHOTO_GAP = 0.08
/** The whole picture, the right way round on both faces (corners bottom-left, top-left, top-right, bottom-right). */
const PHOTO_UVS = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0]
/** Shown while the holder's profile is looked up, and for good when it has no face. */
const PHOTO_FALLBACK = 'assets/images/fallback_profile_pic.png'
/**
 * Pictures are only drawn (and profiles only looked up) for a player this close to the board, so
 * nobody pays for them from across the plaza. Further than PHOTO_HIDE_METERS they go again: the
 * gap between the two keeps them from flickering at the edge. Metres.
 */
const PHOTO_SHOW_METERS = 15
const PHOTO_HIDE_METERS = 18

/** The new owners' page: each owner's picture, and how wide a column each gets (picture, name and property under it). Metres. */
const OWNER_PHOTO_SIZE = 0.6
const OWNER_COLUMN_WIDTH = 0.95

/**
 * The active users' page: a grid of pictures, each with the name under it. Columns and rows at most
 * (past that, a line under the grid says how many are left out), each picture's size, the room each takes
 * across and down, the name's size and how long it may run. Metres.
 */
const ACTIVE_COLUMNS = 5
const ACTIVE_ROWS = 3
const ACTIVE_PHOTO_SIZE = 0.32
const ACTIVE_COLUMN_WIDTH = 0.52
const ACTIVE_ROW_HEIGHT = 0.48
const ACTIVE_CAPTION_SIZE = 0.07
const ACTIVE_NAME_CHARS = 12


const HEADER_COLOR = Color4.fromHexString('#FFC81EFF')
const TEXT_COLOR = Color4.fromHexString('#F3E6C8FF')

/** How often, in seconds, the board looks for something new to draw. Redrawing rebuilds its lines, so not every frame. */
const REFRESH_SECONDS = 2

/** The titles in the panel's order, each with what earned it and how its value reads. */
const TITLES: { id: TitleId; title: () => string; feat: () => string; value: (value: number) => string }[] = [
  { id: 'whale', title: () => t('town.whale'), feat: () => t('town.whaleFeat'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'panic', title: () => t('town.panic'), feat: () => t('town.panicFeat'), value: (value) => t('town.orePerCoin', { rate: formatRate(value) }) },
  { id: 'active', title: () => t('town.worker'), feat: () => t('town.workerFeat'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'baron', title: () => t('town.baron'), feat: () => t('town.baronFeat'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'roller', title: () => t('town.roller'), feat: () => t('town.rollerFeat'), value: (value) => t('obj.coins', { coins: withCommas(value) }) }
]

/** 1000 → "1,000". */
function withCommas(value: number): string {
  return `${Math.round(value)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}` : rate.toFixed(1)
}

const row = (value: string): BitmapLine => ({ value, size: ROW_SIZE, maxWidth: PAGE_MAX_WIDTH })
const gap = (): BitmapLine => ({ value: ' ', size: GAP_SIZE })
const pageTitle = (value: string): BitmapLine => ({ value, size: PAGE_TITLE_SIZE, maxWidth: PAGE_MAX_WIDTH })

/** A picture on a page, and what is written under it (if anything). No address: the caption alone, where the picture would be. */
type Photo = { address: string; caption: BitmapLine[] }

/** How a page lays out several pictures: so many to a row, this far apart across and down, the caption this far under the frame, and whether the gold frame is left off. */
type PhotoGrid = { columns: number; columnWidth: number; rowHeight: number; captionGap: number; noFrame?: boolean }

/**
 * One page of the board: its lines, whether they are last week's, and the pictures it shows in a
 * row after its first line, `photoSize` metres each (the second line must be the room they take: photoRoom).
 * `grid`: several rows of pictures rather than one; `photoLine`: the room line's index, when it is not the second.
 * `notWeekly`: not a figure of the last seven days (coins held now, new owners, who is here), so no subtitle.
 */
type Page = { lines: BitmapLine[]; previous: boolean; photos: Photo[]; photoSize: number; notWeekly?: boolean; grid?: PhotoGrid; photoLine?: number }

type ArrowHover = 'hover.townPrev' | 'hover.townNext'

function headerLines(shown: Page): BitmapLine[] {
  // Left blank rather than dropped, so the page below stays where it is.
  const subtitle = shown.notWeekly === true ? ' ' : shown.previous ? t('town.previousWeek') : t('town.last7Days')
  return [
    { value: upper(t('town.title')), size: TITLE_SIZE, maxWidth: TEXT_MAX_WIDTH },
    { value: subtitle, size: SUBTITLE_SIZE, maxWidth: TEXT_MAX_WIDTH }
  ]
}

/** The line that leaves room for a row of pictures this size, with captions this tall under them. */
function photoRoom(size: number, captionHeight: number): BitmapLine {
  return { value: ' ', size: PHOTO_GAP * 2 + size + PHOTO_FRAME * 2 + captionHeight }
}

/** Everyone in the scene now, as this client sees them: name (or a short address for a guest without one), and address. */
function activeUsers(): { name: string; address: string }[] {
  const users: { name: string; address: string }[] = []
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const address = identity.address
    if (address === '') continue
    const name = AvatarBase.getOrNull(entity)?.name ?? ''
    users.push({ name: name !== '' ? name : `${address.slice(0, 6)}...${address.slice(-4)}`, address })
  }
  return users.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

/** The board's pages: every title (held or not), the economy, the new owners if there are any, and whoever is here now. */
function pages(): Page[] {
  const board = getTownTitles()
  const list: Page[] = []

  for (const title of TITLES) {
    const holder = board?.titles.find((entry) => entry.id === title.id)
    if (holder === undefined) {
      list.push({ previous: false, photos: [], photoSize: 0, lines: [pageTitle(title.title()), gap(), row(`${title.feat()}: —`)] })
      continue
    }
    list.push({
      previous: holder.previous,
      photos: [{ address: holder.address, caption: [] }],
      photoSize: PHOTO_SIZE,
      lines: [
        pageTitle(title.title()),
        photoRoom(PHOTO_SIZE, 0),
        { value: holder.name, size: HOLDER_SIZE, maxWidth: PAGE_MAX_WIDTH },
        row(`${title.feat()}: ${title.value(holder.value)}`)
      ]
    })
  }

  const week = board?.week
  const weekPrevious = board?.weekPrevious ?? false
  // The economy, a figure to a page, the number big.
  const figure = (key: Parameters<typeof t>[0], value: number | undefined, notWeekly: boolean = false): Page => ({
    previous: weekPrevious,
    notWeekly,
    photos: [],
    photoSize: 0,
    lines: [pageTitle(t(key)), gap(), { value: value === undefined ? '—' : withCommas(value), size: FIGURE_SIZE, maxWidth: PAGE_MAX_WIDTH }]
  })
  list.push(figure('town.statHand', week?.hand))
  list.push(figure('town.statRig', week?.rig))
  // Coins spent on things bought: homes, the Market, fuel, the Tailor Shop. Slot bets are not purchases.
  list.push(figure('town.statOut', week?.purchases))
  // From here on, nothing is of the last seven days: they go together, after the weekly pages.
  // What every player holds now (-1 while the server has not read its ledger yet).
  const circulation = board === null || board.circulation < 0 ? undefined : board.circulation
  list.push(figure('town.statCirculation', circulation, true))

  const owners = board?.owners ?? []
  if (owners.length > 0) {
    const caption = (value: string): BitmapLine => ({ value, size: ROW_SIZE, maxWidth: OWNER_COLUMN_WIDTH - 0.05 })
    list.push({
      previous: false,
      notWeekly: true,
      photoSize: OWNER_PHOTO_SIZE,
      photos: owners.map((owner) => ({
        address: owner.address,
        caption: [caption(owner.name), caption(itemName(findItem(owner.kind as ShopItemId), owner.kind))]
      })),
      lines: [pageTitle(t('town.newOwners')), photoRoom(OWNER_PHOTO_SIZE, ROW_SIZE * 2)]
    })
  }

  // Always there, and first, the page the board opens on: whoever is in the scene right now, a picture each.
  // Pages wrap around, so it still sits with the other pages that are not of the week (just before it, at the end).
  const users = activeUsers()
  const fits = ACTIVE_ROWS * ACTIVE_COLUMNS
  const shownUsers = users.slice(0, fits)
  const caption = (value: string): BitmapLine[] => [{ value, size: ACTIVE_CAPTION_SIZE, maxWidth: ACTIVE_COLUMN_WIDTH - 0.03 }]
  const userPhotos: Photo[] = shownUsers.map((user) => ({
    address: user.address,
    caption: caption(user.name.length > ACTIVE_NAME_CHARS ? `${user.name.slice(0, ACTIVE_NAME_CHARS - 1)}…` : user.name)
  }))
  const activeRows = Math.max(1, Math.ceil(userPhotos.length / ACTIVE_COLUMNS))
  list.unshift({
    previous: false,
    notWeekly: true,
    photos: userPhotos,
    photoSize: ACTIVE_PHOTO_SIZE,
    grid: { columns: ACTIVE_COLUMNS, columnWidth: ACTIVE_COLUMN_WIDTH, rowHeight: ACTIVE_ROW_HEIGHT, captionGap: 0.01, noFrame: true },
    photoLine: 2,
    lines: [
      pageTitle(t('town.activeUsers')),
      row(t('town.activeUsersCount', { count: users.length })),
      { value: ' ', size: PHOTO_GAP + activeRows * ACTIVE_ROW_HEIGHT },
      // Whoever did not fit, as a count.
      ...(users.length > shownUsers.length ? [row(t('town.andMore', { count: users.length - shownUsers.length }))] : [])
    ]
  })
  return list
}

/** How tall these lines stand, stacked as setBitmapText3d stacks them. */
function heightOf(lines: BitmapLine[]): number {
  return lines.reduce((total, line) => total + line.size, 0)
}

/** One picture's place on the board: its gold frame, the picture just in front, and its caption under them. */
type PhotoSlot = { frame: Entity; picture: Entity; caption: Entity }

let header: Entity = engine.RootEntity
let body: Entity = engine.RootEntity
let counter: Entity = engine.RootEntity
const photoSlots: PhotoSlot[] = []
/** The drawn arrows' lettering and the squares that take their clicks; empty when the scene has its own. */
const drawnArrows: { text: Entity; hit: Entity; label: string }[] = []
let page = 0
let pageCount = 1
let lastDrawn = ''
let sinceRefresh = REFRESH_SECONDS
/** The board's frame of reference, where it stands in the world (worked out on first need), and whether the player is close enough for pictures. */
let boardFrame: Entity = engine.RootEntity
let boardPosition: Vector3 | null = null
let near = false

function updateNear(): void {
  const player = Transform.getOrNull(engine.PlayerEntity)
  // Until the player's position arrives, the pictures stay as they are.
  if (player === null) return
  boardPosition ??= worldPosition(boardFrame)
  const radius = near ? PHOTO_HIDE_METERS : PHOTO_SHOW_METERS
  near = Vector3.distanceSquared(boardPosition, player.position) < radius * radius
}

function refresh(): void {
  const list = pages()
  pageCount = list.length
  // A page can go away while someone reads, so the page is kept in range here.
  page = Math.min(page, list.length - 1)
  const shown = list[page]
  const top = headerLines(shown)
  const count = list.length > 1 ? `${page + 1} / ${list.length}` : ''
  // A face shows once the profile is known to have one: until then, the fallback.
  updateNear()
  // Far away, no picture and no profile lookup: only the names.
  const faces = near ? shown.photos.map((photo) => ownerHasFace(photo.address)) : []
  // Only a real change redraws: the same words in the same language leave the lines as they are.
  const key = JSON.stringify([top, shown.lines, count, shown.photos, faces, near])
  if (key === lastDrawn) return
  lastDrawn = key
  setBitmapText3d(header, top, HEADER_COLOR)
  // A page with pictures starts under the header; one of text alone is centred on the arrows' height.
  const bodyY = shown.photos.length > 0 ? BOARD_HEIGHT - TEXT_TOP_MARGIN - heightOf(top) - GAP_SIZE * 2 : ARROW_Y + heightOf(shown.lines) / 2
  Transform.getMutable(body).position.y = bodyY
  setBitmapText3d(body, shown.lines, TEXT_COLOR)
  drawPhotos(shown, bodyY, faces, near)
  setBitmapText3d(counter, count === '' ? [] : [{ value: count, size: SUBTITLE_SIZE }], TEXT_COLOR)
  // With one page there is nothing to turn to.
  for (const arrow of drawnArrows) {
    setBitmapText3d(arrow.text, list.length > 1 ? [{ value: arrow.label, size: ARROW_SIZE }] : [], HEADER_COLOR)
    if (list.length > 1) MeshCollider.setPlane(arrow.hit, ColliderLayer.CL_POINTER)
    else MeshCollider.deleteFrom(arrow.hit)
  }
}

/** The page's pictures in a row, centred, in the room its second line leaves; the slots it does not use are emptied. */
function drawPhotos(shown: Page, bodyY: number, faces: boolean[], pictures: boolean): void {
  const size = shown.photoSize
  const above = heightOf(shown.lines.slice(0, shown.photoLine ?? 1))
  const firstY = bodyY - above - PHOTO_GAP - PHOTO_FRAME - size / 2
  // One row unless the page says otherwise, owners' columns apart.
  const grid = shown.grid ?? { columns: Math.max(1, shown.photos.length), columnWidth: OWNER_COLUMN_WIDTH, rowHeight: 0, captionGap: PHOTO_GAP / 2 }
  photoSlots.forEach((slot, index) => {
    const photo = shown.photos[index]
    if (photo === undefined || photo.address === '') {
      clearPicture(slot)
      // A caption with no picture (how many are left out) stands where the picture would.
      if (photo === undefined) setBitmapText3d(slot.caption, [], TEXT_COLOR)
      else {
        Transform.getMutable(slot.caption).position = slotPosition(grid, shown.photos.length, index, firstY, photo.caption)
        setBitmapText3d(slot.caption, photo.caption, TEXT_COLOR)
      }
      return
    }
    const rowIndex = Math.floor(index / grid.columns)
    const inRow = Math.min(grid.columns, shown.photos.length - rowIndex * grid.columns)
    const x = ((index % grid.columns) - (inRow - 1) / 2) * grid.columnWidth
    const y = firstY - rowIndex * grid.rowHeight
    const framed = size + PHOTO_FRAME * 2
    const frameTransform = Transform.getMutable(slot.frame)
    frameTransform.position = Vector3.create(x, y, TEXT_FORWARD_METERS)
    frameTransform.scale = Vector3.create(framed, framed, 1)
    const pictureTransform = Transform.getMutable(slot.picture)
    pictureTransform.position = Vector3.create(x, y, TEXT_FORWARD_METERS - 0.005)
    pictureTransform.scale = Vector3.create(size, size, 1)
    Transform.getMutable(slot.caption).position = Vector3.create(x, y - framed / 2 - grid.captionGap, TEXT_FORWARD_METERS)
    setBitmapText3d(slot.caption, photo.caption, TEXT_COLOR)
    if (!pictures) {
      clearPicture(slot)
      return
    }
    if (grid.noFrame === true) MeshRenderer.deleteFrom(slot.frame)
    else MeshRenderer.setPlane(slot.frame)
    MeshRenderer.setPlane(slot.picture, PHOTO_UVS)
    Material.setBasicMaterial(slot.picture, {
      texture: faces[index] ? Material.Texture.Avatar({ userId: photo.address }) : Material.Texture.Common({ src: PHOTO_FALLBACK })
    })
  })
}

/** Takes a slot's picture and frame away, keeping its caption. */
function clearPicture(slot: PhotoSlot): void {
  MeshRenderer.deleteFrom(slot.frame)
  MeshRenderer.deleteFrom(slot.picture)
  Material.deleteFrom(slot.picture)
}

/** Where a caption with no picture goes: centred on the picture's place. */
function slotPosition(grid: PhotoGrid, count: number, index: number, firstY: number, caption: BitmapLine[]): Vector3 {
  const rowIndex = Math.floor(index / grid.columns)
  const inRow = Math.min(grid.columns, count - rowIndex * grid.columns)
  const x = ((index % grid.columns) - (inRow - 1) / 2) * grid.columnWidth
  return Vector3.create(x, firstY - rowIndex * grid.rowHeight + heightOf(caption) / 2, TEXT_FORWARD_METERS)
}

function turn(by: number): void {
  if (pageCount <= 1) return
  page = (page + by + pageCount) % pageCount
  refresh()
}

function onArrow(entity: Entity, hover: ArrowHover, by: number): void {
  pointerEventsSystem.onPointerDown(
    { entity, opts: { button: InputAction.IA_POINTER, hoverText: hoverText(entity, hover), maxDistance: ARROW_REACH_METERS } },
    () => turn(by)
  )
}

/** The scene's own arrow, made clickable: given a plane collider if it has nothing to click on. */
function useAuthoredArrow(entity: Entity, hover: ArrowHover, by: number): void {
  if (!MeshCollider.has(entity) && !GltfContainer.has(entity)) MeshCollider.setPlane(entity, ColliderLayer.CL_POINTER)
  onArrow(entity, hover, by)
}

/** An arrow drawn on the board: `side` -1 is the reader's left (back a page), 1 the right (on a page). */
function drawArrow(frame: Entity, side: -1 | 1, rotation: Quaternion): void {
  const hit = engine.addEntity()
  Transform.create(hit, {
    parent: frame,
    position: Vector3.create(side * ARROW_X, ARROW_Y, TEXT_FORWARD_METERS),
    rotation,
    scale: Vector3.create(ARROW_HIT_SIZE, ARROW_HIT_SIZE, 1)
  })
  // The lettering is the hit square's sibling, not its child, so the square's scale does not squash it.
  const text = engine.addEntity()
  Transform.create(text, { parent: frame, position: Vector3.create(side * ARROW_X, ARROW_Y + ARROW_SIZE / 2, TEXT_FORWARD_METERS), rotation })
  drawnArrows.push({ text, hit, label: side < 0 ? '<' : '>' })
  onArrow(hit, side < 0 ? 'hover.townPrev' : 'hover.townNext', side)
}

export function setupTownBoard3d(): void {
  const authored = engine.getEntityOrNullByName(TOWN_BOARD_ENTITY_NAME)
  const root = engine.addEntity()
  const authoredScale = authored === null ? null : Transform.getOrNull(authored)?.scale ?? null
  // The board's frame of reference: its bottom edge, in the middle.
  const frame = engine.addEntity()
  boardFrame = frame
  if (authored !== null && authoredScale !== null) {
    // Undo the plane's own stretch so the lettering keeps its shape, then shrink it evenly to fit the plane.
    const s = authoredScale
    const fit = Math.min(s.x / BOARD_WIDTH, s.y / BOARD_HEIGHT)
    Transform.create(root, { parent: authored, scale: Vector3.create(fit / s.x, fit / s.y, fit / (s.z || 1)) })
    Transform.create(frame, { parent: root, position: Vector3.create(0, -BOARD_HEIGHT / 2, 0) })
  } else {
    Transform.create(root, { position: FALLBACK_POSITION, rotation: Quaternion.fromEulerDegrees(0, FALLBACK_YAW_DEGREES, 0) })
    Transform.create(frame, { parent: root, position: Vector3.create(0, BOARD_BOTTOM, 0) })
  }

  const textRotation = Quaternion.fromEulerDegrees(0, TEXT_YAW_DEGREES, 0)
  header = engine.addEntity()
  Transform.create(header, { parent: frame, position: Vector3.create(0, BOARD_HEIGHT - TEXT_TOP_MARGIN, TEXT_FORWARD_METERS), rotation: textRotation })
  body = engine.addEntity()
  Transform.create(body, { parent: frame, position: Vector3.create(0, BOARD_HEIGHT / 2, TEXT_FORWARD_METERS), rotation: textRotation })
  counter = engine.addEntity()
  Transform.create(counter, { parent: frame, position: Vector3.create(0, COUNTER_Y, TEXT_FORWARD_METERS), rotation: textRotation })
  // As many picture slots as a page can show: the frame sits on the lettering's plane, the picture just in front of it.
  for (let index = 0; index < Math.max(1, NEW_OWNERS_SHOWN, ACTIVE_COLUMNS * ACTIVE_ROWS); index++) {
    const slotFrame = engine.addEntity()
    Transform.create(slotFrame, { parent: frame, position: Vector3.create(0, BOARD_HEIGHT / 2, TEXT_FORWARD_METERS), rotation: textRotation })
    Material.setBasicMaterial(slotFrame, { diffuseColor: HEADER_COLOR })
    const picture = engine.addEntity()
    Transform.create(picture, { parent: frame, position: Vector3.create(0, BOARD_HEIGHT / 2, TEXT_FORWARD_METERS), rotation: textRotation })
    const caption = engine.addEntity()
    Transform.create(caption, { parent: frame, position: Vector3.create(0, BOARD_HEIGHT / 2, TEXT_FORWARD_METERS), rotation: textRotation })
    photoSlots.push({ frame: slotFrame, picture, caption })
  }

  const prev = engine.getEntityOrNullByName(PREV_ARROW_ENTITY_NAME)
  const next = engine.getEntityOrNullByName(NEXT_ARROW_ENTITY_NAME)
  if (prev !== null && next !== null) {
    useAuthoredArrow(prev, 'hover.townPrev', -1)
    useAuthoredArrow(next, 'hover.townNext', 1)
  } else {
    drawArrow(frame, -1, textRotation)
    drawArrow(frame, 1, textRotation)
  }

  engine.addSystem((dt: number) => {
    sinceRefresh += dt
    if (sinceRefresh < REFRESH_SECONDS) return
    sinceRefresh = 0
    refresh()
  }, undefined, 'town-board-3d')
}
