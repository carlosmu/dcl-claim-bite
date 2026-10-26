import ReactEcs, { Label, UiTransformProps } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

// --- Western text ------------------------------------------------------------------------
//
// The scene's own typeface, drawn by the renderer from the TTF through `fontSrc`. `font` is the
// fallback: always on mobile, and on desktop until the font's asset bundle exists (deployed, or
// a preview with Compress Assets / `--asset-bundles`; a plain preview always shows the fallback).

export const WESTERN_FONT_SRC = 'assets/fonts/BouWeste.ttf'

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
            fontSrc={WESTERN_FONT_SRC}
            font="serif"
            textAlign={align === 'center' ? 'middle-center' : align === 'right' ? 'middle-right' : 'middle-left'}
            textWrap="nowrap"
            uiTransform={{ height: fontSize, flexShrink: 0, ...uiTransform }}
        />
    )
}
