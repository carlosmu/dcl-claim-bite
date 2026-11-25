import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { t, upper } from '../i18n'
import { getTownTitles } from '../shared/net/town-titles-sync'
import { TitleId } from '../shared/titles'
import { BitmapLine, setBitmapText3d } from './bitmap-text-3d'

// --- The Town Board, in the plaza ----------------------------------------------------------
//
// Lettering on the town's billboard with the same titles as the Town Board panel, and under them the
// town's economy over the last seven days: ore mined by hand and by rigs, ore sold, coins the bank
// paid, coins that came in and went out. The server works it all out (server/titles.ts) and syncs it
// in TownTitles; this only draws what it last said, in the player's language.
//
// Where it stands: on the scene entity named TOWN_BOARD_ENTITY_NAME, a 1×1 plane the Creator Hub
// places, turns and scales: the lettering is laid out on a BOARD_WIDTH × BOARD_HEIGHT board and shrunk
// evenly to fit inside that plane, centred on it. While the scene has none, it stands at FALLBACK_POSITION.

/** The scene entity the board stands on. */
const TOWN_BOARD_ENTITY_NAME = 'town-board'
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

/** Sizes in metres per em of the western font. */
const TITLE_SIZE = 0.3
const SUBTITLE_SIZE = 0.15
const ROW_SIZE = 0.13
const GAP_SIZE = 0.1

const HEADER_COLOR = Color4.fromHexString('#FFC81EFF')
const TEXT_COLOR = Color4.fromHexString('#F3E6C8FF')

/** How often, in seconds, the board looks for something new to draw. Redrawing rebuilds its lines, so not every frame. */
const REFRESH_SECONDS = 2

/** The titles in the panel's order, each with how its value reads. */
const TITLES: { id: TitleId; title: () => string; value: (value: number) => string }[] = [
  { id: 'whale', title: () => t('town.whale'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'panic', title: () => t('town.panic'), value: (value) => t('town.orePerCoin', { rate: formatRate(value) }) },
  { id: 'active', title: () => t('town.worker'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'baron', title: () => t('town.baron'), value: (value) => t('town.ore', { ore: withCommas(value) }) },
  { id: 'roller', title: () => t('town.roller'), value: (value) => t('obj.coins', { coins: withCommas(value) }) }
]

/** 1000 → "1,000". */
function withCommas(value: number): string {
  return `${Math.round(value)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? `${rate}` : rate.toFixed(1)
}

function signed(value: number): string {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${withCommas(rounded)}` : rounded < 0 ? `-${withCommas(-rounded)}` : '0'
}

const row = (value: string): BitmapLine => ({ value, size: ROW_SIZE, maxWidth: TEXT_MAX_WIDTH })
const gap = (): BitmapLine => ({ value: ' ', size: GAP_SIZE })

function headerLines(): BitmapLine[] {
  return [
    { value: upper(t('town.title')), size: TITLE_SIZE, maxWidth: TEXT_MAX_WIDTH },
    { value: t('town.last7Days'), size: SUBTITLE_SIZE, maxWidth: TEXT_MAX_WIDTH }
  ]
}

function bodyLines(): BitmapLine[] {
  const board = getTownTitles()
  const lines: BitmapLine[] = []
  for (const title of TITLES) {
    const holder = board?.titles.find((entry) => entry.id === title.id)
    lines.push(row(holder === undefined ? `${title.title()}: —` : `${title.title()}: ${holder.name} · ${title.value(holder.value)}`))
  }
  lines.push(gap())
  const week = board?.week
  const stat = (key: Parameters<typeof t>[0], value: number | undefined) => row(`${t(key)}: ${value === undefined ? '—' : withCommas(value)}`)
  lines.push(stat('town.statHand', week?.hand))
  lines.push(stat('town.statRig', week?.rig))
  lines.push(stat('town.statSold', week?.oreSold))
  lines.push(stat('town.statBank', week?.bankPaid))
  lines.push(stat('town.statIn', week?.coinsIn))
  lines.push(stat('town.statOut', week?.coinsOut))
  lines.push(row(`${t('town.statNet')}: ${week === undefined ? '—' : signed(week.coinsIn - week.coinsOut)}`))
  return lines
}

/** How tall these lines stand, stacked as setBitmapText3d stacks them. */
function heightOf(lines: BitmapLine[]): number {
  return lines.reduce((total, line) => total + line.size, 0)
}

let header: Entity = engine.RootEntity
let body: Entity = engine.RootEntity
let lastDrawn = ''
let sinceRefresh = REFRESH_SECONDS

function refresh(): void {
  const top = headerLines()
  const rest = bodyLines()
  // Only a real change redraws: the same words in the same language leave the lines as they are.
  const key = JSON.stringify([top, rest])
  if (key === lastDrawn) return
  lastDrawn = key
  setBitmapText3d(header, top, HEADER_COLOR)
  Transform.getMutable(body).position.y = BOARD_HEIGHT - TEXT_TOP_MARGIN - heightOf(top) - GAP_SIZE * 2
  setBitmapText3d(body, rest, TEXT_COLOR)
}

export function setupTownBoard3d(): void {
  const authored = engine.getEntityOrNullByName(TOWN_BOARD_ENTITY_NAME)
  const root = engine.addEntity()
  const authoredScale = authored === null ? null : Transform.getOrNull(authored)?.scale ?? null
  // The board's frame of reference: its bottom edge, in the middle.
  const frame = engine.addEntity()
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

  engine.addSystem((dt: number) => {
    sinceRefresh += dt
    if (sinceRefresh < REFRESH_SECONDS) return
    sinceRefresh = 0
    refresh()
  }, undefined, 'town-board-3d')
}
