import { engine, Entity, Material, MaterialTransparencyMode, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

import { WESTERN_GLYPHS, WESTERN_KERNINGS, WESTERN_TEXTURE, WESTERN_TEXTURE_SIZE } from '../ui/western-font'

// --- Bitmap text in the world ------------------------------------------------------------
//
// TextShape only offers the built-in fonts, so in-world text in the scene's own typeface is
// drawn like the UI's BitmapText (ui/bitmap-text.tsx): one plane per character, each showing its
// glyph's cell of the atlas through the plane's uvs. The atlas is white, so `color` tints it.
//
// Sizes are in metres per em (88 px in the atlas). Lines are centred on the root's origin,
// stacked downward from it, in the root's XY plane.

const EM = 88

type Glyph = { uvs: number[]; w: number; h: number; x: number; y: number; advance: number }

const GLYPHS = new Map<number, Glyph>()
for (const [id, x, y, w, h, xoffset, yoffset, advance] of WESTERN_GLYPHS) {
  const s = WESTERN_TEXTURE_SIZE
  const u0 = x / s
  const u1 = (x + w) / s
  // The texture's v axis runs bottom-up; the .fnt's y runs top-down.
  const vTop = 1 - y / s
  const vBottom = 1 - (y + h) / s
  // A plane's corners run bottom-left, top-left, top-right, bottom-right, once per face — the
  // same order the UI's uvs take.
  const face = [u0, vBottom, u0, vTop, u1, vTop, u1, vBottom]
  GLYPHS.set(id, { uvs: [...face, ...face], w, h, x: xoffset, y: yoffset, advance })
}

const KERNINGS = new Map<number, number>()
for (const [first, second, amount] of WESTERN_KERNINGS) KERNINGS.set(first * 65536 + second, amount)

const SPACE = GLYPHS.get(32)!

// Characters the font lacks but has a close stand-in for.
const SUBSTITUTES: Record<string, string> = { '—': '-', '–': '-', ';': ':', '’': '\'' }

function glyphFor(char: string): Glyph {
  const code = (SUBSTITUTES[char] ?? char).charCodeAt(0)
  return GLYPHS.get(code) ?? GLYPHS.get(String.fromCharCode(code).toUpperCase().charCodeAt(0)) ?? SPACE
}

function lineWidth(value: string): number {
  let width = 0
  for (let i = 0; i < value.length; i++) {
    const kerning = i > 0 ? KERNINGS.get(value.charCodeAt(i - 1) * 65536 + value.charCodeAt(i)) ?? 0 : 0
    width += kerning + glyphFor(value[i]).advance
  }
  return width / EM
}

export type BitmapLine = {
  value: string
  /** Metres per em. */
  size: number
  /** The line shrinks to fit this wide, in metres, when it would run wider. */
  maxWidth?: number
}

/** Draws the lines as children of `root`, replacing whatever it drew there before. */
export function setBitmapText3d(root: Entity, lines: BitmapLine[], color: Color4): void {
  for (const glyph of drawn.get(root) ?? []) engine.removeEntity(glyph)
  const glyphs: Entity[] = []

  let top = 0
  for (const line of lines) {
    const natural = lineWidth(line.value) * line.size
    const size = line.maxWidth !== undefined && natural > line.maxWidth ? (line.size * line.maxWidth) / natural : line.size
    const scale = size / EM
    let pen = -(natural * (size / line.size)) / 2

    for (let i = 0; i < line.value.length; i++) {
      const glyph = glyphFor(line.value[i])
      const kerning = i > 0 ? KERNINGS.get(line.value.charCodeAt(i - 1) * 65536 + line.value.charCodeAt(i)) ?? 0 : 0
      pen += kerning * scale
      if (glyph.w > 0) {
        const entity = engine.addEntity()
        Transform.create(entity, {
          parent: root,
          position: Vector3.create(pen + (glyph.x + glyph.w / 2) * scale, top - (glyph.y + glyph.h / 2) * scale, 0),
          scale: Vector3.create(glyph.w * scale, glyph.h * scale, 1)
        })
        MeshRenderer.setPlane(entity, glyph.uvs)
        // Blended on the atlas' own alpha, the way the rocks fade; the unlit material ignored it.
        Material.setPbrMaterial(entity, {
          texture: Material.Texture.Common({ src: WESTERN_TEXTURE }),
          albedoColor: color,
          transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND,
          metallic: 0,
          roughness: 1
        })
        glyphs.push(entity)
      }
      pen += glyph.advance * scale
    }
    top -= size
  }
  drawn.set(root, glyphs)
}

const drawn = new Map<Entity, Entity[]>()

/** Forgets what was drawn under `root`, once the root itself is removed with its children. */
export function forgetBitmapText3d(root: Entity): void {
  drawn.delete(root)
}
