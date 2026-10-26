import { engine, Entity, Font, TextAlignMode, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import { WESTERN_FONT_SRC } from '../ui/bitmap-text'

// --- Western text in the world -----------------------------------------------------------
//
// In-world text in the scene's own typeface, like the UI's BitmapText (ui/bitmap-text.tsx): one
// TextShape per line, drawn from the TTF through `fontSrc`.
//
// Sizes are in metres per em. Lines are centred on the root's origin, stacked downward from it,
// in the root's XY plane.

/** TextShape's fontSize is in world units, 10 to the metre. */
const FONT_SIZE_PER_METRE = 10
/** The TTF cannot be measured from the scene, so a line's width is estimated from this average advance, in ems per character. */
const AVERAGE_ADVANCE_EM = 0.6

export type BitmapLine = {
  value: string
  /** Metres per em. */
  size: number
  /** The line shrinks to fit this wide, in metres, when it would run wider. */
  maxWidth?: number
}

/** Draws the lines as children of `root`, replacing whatever it drew there before. */
export function setBitmapText3d(root: Entity, lines: BitmapLine[], color: Color4): void {
  for (const line of drawn.get(root) ?? []) engine.removeEntity(line)
  const entities: Entity[] = []

  let top = 0
  for (const line of lines) {
    const natural = line.value.length * AVERAGE_ADVANCE_EM * line.size
    const size = line.maxWidth !== undefined && natural > line.maxWidth ? (line.size * line.maxWidth) / natural : line.size
    const entity = engine.addEntity()
    Transform.create(entity, { parent: root, position: Vector3.create(0, top - size / 2, 0) })
    TextShape.create(entity, {
      text: line.value,
      fontSize: size * FONT_SIZE_PER_METRE,
      fontSrc: WESTERN_FONT_SRC,
      font: Font.F_SERIF,
      textColor: color,
      textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })
    entities.push(entity)
    top -= size
  }
  drawn.set(root, entities)
}

const drawn = new Map<Entity, Entity[]>()

/** Forgets what was drawn under `root`, once the root itself is removed with its children. */
export function forgetBitmapText3d(root: Entity): void {
  drawn.delete(root)
}
