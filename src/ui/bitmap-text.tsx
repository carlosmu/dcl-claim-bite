import ReactEcs, { Label, UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
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

export function BitmapText(props: BitmapTextProps) {
    const { value, fontSize, color = Color4.White(), align = 'left', uiTransform } = props
    return (
        <Label
            value={value}
            fontSize={fontSize}
            color={color}
            fontSrc={gameFontSrc()}
            font="serif"
            textAlign={align === 'center' ? 'middle-center' : align === 'right' ? 'middle-right' : 'middle-left'}
            textWrap="nowrap"
            uiTransform={{ height: fontSize, flexShrink: 0, ...uiTransform }}
        />
    )
}
