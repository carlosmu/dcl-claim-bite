import ReactEcs, { Label, UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { getLanguage, Language } from '../i18n'

// --- Western text ------------------------------------------------------------------------
//
// The scene's own typeface, drawn by the renderer from the TTF through `fontSrc`. `font` is the
// fallback: always on mobile, and on desktop until the font's asset bundle exists (deployed, or
// a preview with Compress Assets / `--asset-bundles`; a plain preview always shows the fallback).

export const WESTERN_FONT_SRC = 'assets/fonts/BouWeste.ttf'

/**
 * The typeface for languages BouWeste cannot write, by language. BouWeste has Latin only; a
 * language missing here uses it. Each TTF is another ~700 KB asset bundle (fonts skill), so one
 * font per script, not per language. Licences sit next to the TTFs in assets/fonts.
 *
 * `null`: no TTF, the explorer's built-in face (`font`). Chinese and Japanese need thousands of
 * characters (Noto Sans SC alone is 17.8 MB); the built-in faces have them, checked in-world with
 * a temporary in-world test (desktop).
 */
const FONT_BY_LANGUAGE: Partial<Record<Language, string | null>> = {
    // Cyrillic: the built-in face, like Chinese and Japanese, checked in preview. Kelly Slab (Google
    // Fonts, OFL) was tried first and dropped: one more ~700 KB bundle for little gain.
    ru: null,
    zh: null,
    ja: null,
    // Korean (Hangul), and Turkish: BouWeste lacks ğ ş ı İ, and a word half in one face and half in
    // another reads as broken. Both checked in-world, like Chinese and Japanese.
    ko: null,
    tr: null,
    // Vietnamese: Latin with stacked accents, most of them missing from BouWeste. Checked in-world.
    vi: null
}

/** The scene's TTF for the current language, or undefined for the built-in face. */
export function gameFontSrc(): string | undefined {
    const src = FONT_BY_LANGUAGE[getLanguage()]
    return src === null ? undefined : src ?? WESTERN_FONT_SRC
}

export type BitmapTextProps = {
    value: string
    fontSize: number
    color?: Color4
    /** Where the text sits inside `uiTransform.width` when that is wider than the text. */
    align?: 'left' | 'center' | 'right'
    uiTransform?: UiTransformProps
}

/**
 * The built-in faces draw their letters lower in the line than BouWeste does, so the same box
 * looked bottom-heavy: "60" on the ore bar sat on the floor. When the built-in face shows, this
 * much of the font size is padded off the bottom of the box, which lifts the centred text by half
 * of it. Not when BouWeste shows, and a caller's own padding wins.
 */
const BUILT_IN_FACE_LIFT = 0.2

/**
 * Whether the text shows in the built-in face rather than BouWeste: a language BouWeste cannot
 * write, or the mobile app, which ignores `fontSrc`. (A desktop preview without asset bundles shows
 * it too, but nothing here can tell.)
 */
function showsBuiltInFace(): boolean {
    return gameFontSrc() === undefined || isMobile()
}

export function BitmapText(props: BitmapTextProps) {
    const { value, fontSize, color = Color4.White(), align = 'left', uiTransform } = props
    const lift = showsBuiltInFace() ? { padding: { bottom: Math.round(fontSize * BUILT_IN_FACE_LIFT) } } : {}
    return (
        <Label
            value={value}
            fontSize={fontSize}
            color={color}
            fontSrc={gameFontSrc()}
            font="serif"
            textAlign={align === 'center' ? 'middle-center' : align === 'right' ? 'middle-right' : 'middle-left'}
            textWrap="nowrap"
            uiTransform={{ height: fontSize, flexShrink: 0, ...lift, ...uiTransform }}
        />
    )
}
