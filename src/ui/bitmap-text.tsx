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
 * language missing here uses it. Each entry is another ~700 KB asset bundle (fonts skill), so
 * one font per script, not per language. Licences sit next to the TTFs in assets/fonts.
 */
const FONT_BY_LANGUAGE: Partial<Record<Language, string>> = {
    // Cyrillic. OFL, Reserved Font Names "Kelly" / "Kelly Slab": used unmodified.
    ru: 'assets/fonts/KellySlab-Regular.ttf'
}

/** The scene's typeface for the current language: BouWeste, or the one that has its letters. */
export function gameFontSrc(): string {
    return FONT_BY_LANGUAGE[getLanguage()] ?? WESTERN_FONT_SRC
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
