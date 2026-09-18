import ReactEcs, { UiEntity, UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import {
    WESTERN_GLYPHS,
    WESTERN_KERNINGS,
    WESTERN_TEXTURE,
    WESTERN_TEXTURE_SIZE
} from './western-font'

// --- Bitmap text -------------------------------------------------------------------------
//
// react-ecs `Label` only offers sans-serif/serif/monospace, so the scene's own typeface is drawn
// from a texture instead: one UiEntity per character, each showing its glyph's cell of the atlas
// through `uvs`. The atlas is white, so `color` tints it like a label's colour would.
//
// `fontSize` is the font's full em (88 px in the atlas, descenders included), so the caps come
// out a little smaller than a Label at the same size would draw them.

const EM = 88

type Glyph = { u: number[]; w: number; h: number; x: number; y: number; advance: number }

const GLYPHS = new Map<number, Glyph>()
for (const [id, x, y, w, h, xoffset, yoffset, advance] of WESTERN_GLYPHS) {
    const s = WESTERN_TEXTURE_SIZE
    const u0 = x / s
    const u1 = (x + w) / s
    // The texture's v axis runs bottom-up; the .fnt's y runs top-down.
    const vTop = 1 - y / s
    const vBottom = 1 - (y + h) / s
    GLYPHS.set(id, {
        u: [u0, vBottom, u0, vTop, u1, vTop, u1, vBottom],
        w,
        h,
        x: xoffset,
        y: yoffset,
        advance
    })
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

export type BitmapTextProps = {
    value: string
    fontSize: number
    color?: Color4
    /** Where the text sits inside `uiTransform.width` when that is wider than the text. */
    align?: 'left' | 'center' | 'right'
    uiTransform?: UiTransformProps
}

export function BitmapText(props: BitmapTextProps) {
    const { value, fontSize, color = Color4.White(), align = 'left', uiTransform } = props
    const scale = fontSize / EM

    const glyphs = []
    for (let i = 0; i < value.length; i++) {
        const glyph = glyphFor(value[i])
        const kerning = i > 0 ? KERNINGS.get(value.charCodeAt(i - 1) * 65536 + value.charCodeAt(i)) ?? 0 : 0
        glyphs.push(
            <UiEntity
                key={i}
                uiTransform={{
                    width: glyph.advance * scale,
                    height: fontSize,
                    flexShrink: 0,
                    margin: { left: kerning * scale }
                }}
            >
                {glyph.w > 0 ? (
                    <UiEntity
                        uiTransform={{
                            positionType: 'absolute',
                            position: { left: glyph.x * scale, top: glyph.y * scale },
                            width: glyph.w * scale,
                            height: glyph.h * scale
                        }}
                        uiBackground={{
                            texture: { src: WESTERN_TEXTURE },
                            textureMode: 'stretch',
                            uvs: glyph.u,
                            color
                        }}
                    />
                ) : null}
            </UiEntity>
        )
    }

    return (
        <UiEntity
            uiTransform={{
                height: fontSize,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                flexShrink: 0,
                ...uiTransform
            }}
        >
            {glyphs}
        </UiEntity>
    )
}
