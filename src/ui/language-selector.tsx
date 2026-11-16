import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getLanguage, Language, LANGUAGE_COLUMNS, languageName } from '../i18n'
import { pickLanguage } from '../net/language-link'

// The language selector on the title card, up top and centred: a pill with the current flag and
// language name; tapping it drops a list of every language, the current one ticked.
//
// No globe, chevron or ✓ characters: the Unity explorer has no glyphs for them. The pill shows
// the flag instead of a globe, and the tick is Small_icons.png B1 (the "copied" icon).

const SMALL_ICONS_ATLAS = 'assets/images/Small_icons.png'
const SMALL_ICONS_GRID = 8

/** UVs of one Small_icons.png cell, letter = column, number = row, like ui.tsx's atlasCell. */
function smallIconUvs(column: number, row: number): number[] {
    const size = 1 / SMALL_ICONS_GRID
    const u0 = (column - 1) * size
    const v0 = 1 - row * size
    return [u0, v0, u0, v0 + size, u0 + size, v0 + size, u0 + size, v0]
}

const FLAG_UVS: Record<Language, number[]> = {
    en: smallIconUvs(1, 2), // A2
    es: smallIconUvs(2, 2), // B2
    pt: smallIconUvs(3, 2), // C2
    fr: smallIconUvs(4, 2), // D2
    ru: smallIconUvs(5, 2), // E2
    de: smallIconUvs(6, 2), // F2
    it: smallIconUvs(7, 2), // G2
    nl: smallIconUvs(8, 2), // H2
    zh: smallIconUvs(1, 3), // A3
    ja: smallIconUvs(2, 3), // B3
    tr: smallIconUvs(3, 3), // C3
    ko: smallIconUvs(4, 3), // D3
    id: smallIconUvs(5, 3), // E3
    vi: smallIconUvs(6, 3) // F3
    // G3: India, for Hindi once the explorer shapes Devanagari (it draws the letters unjoined today).
}
const TICK_UVS = smallIconUvs(2, 1) // B1

/** The flag of a language, as an atlas cell: for the in-game corner button. */
export function flagIcon(language: Language): { src: string; uvs: number[] } {
    return { src: SMALL_ICONS_ATLAS, uvs: FLAG_UVS[language] }
}

const PILL_HEIGHT = 52
const PILL_PADDING_X = 16
const PILL_BORDER = 2
const FLAG_SIZE = 28
const NAME_FONT_SIZE = 20
// Room for the longest names, "Nederlands" and "Português".
const NAME_WIDTH = 130
const MENU_GAP = 8
// The open list: the columns of LANGUAGE_COLUMNS, rows 30% taller than at first (48), on solid
// black so it reads over the logo. Each column fits the longest names ("Nederlands", "Português"),
// with the title card's bigger flag and the tick.
const COLUMN_WIDTH = 240
const MENU_PADDING = 6
/** The list's width, padding included: every column side by side. Both selectors use it. */
export const LANGUAGE_LIST_WIDTH = LANGUAGE_COLUMNS.length * COLUMN_WIDTH + 2 * MENU_PADDING
const MENU_WIDTH = LANGUAGE_LIST_WIDTH
const MENU_RADIUS = 12
const ROW_HEIGHT = Math.round(48 * 1.3)

/** Flag and row sizes for a list. The title card's are bigger: 30% for the flags, 25% for the rows. */
export type LanguageListSize = { flag: number; row: number }
const LIST_SIZE: LanguageListSize = { flag: FLAG_SIZE, row: ROW_HEIGHT }
const TITLE_LIST_SIZE: LanguageListSize = { flag: Math.round(FLAG_SIZE * 1.3), row: Math.round(ROW_HEIGHT * 1.25) }
const ROW_RADIUS = 8
const TICK_SIZE = 22

const GOLD = Color4.create(1, 0.76, 0.2, 1)
const PANEL_COLOR = Color4.create(0.13, 0.09, 0.06, 0.92)
const MENU_COLOR = Color4.Black()
const SELECTED_ROW_COLOR = Color4.create(1, 1, 1, 0.12)
const NAME_COLOR = Color4.White()

let open = false

function Flag(props: { language: Language; size?: number }) {
    const size = props.size ?? FLAG_SIZE
    return (
        <UiEntity
            uiTransform={{ width: size, height: size, flexShrink: 0 }}
            uiBackground={{ texture: { src: SMALL_ICONS_ATLAS }, textureMode: 'stretch', uvs: FLAG_UVS[props.language] }}
        />
    )
}

/** One language in a list: flag, name, and the tick on the current one. Picking it calls `onPicked` after. */
function LanguageRow(props: { key: string; language: Language; name: string; size: LanguageListSize; onPicked: () => void }) {
    const selected = props.language === getLanguage()
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: props.size.row,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 10, right: 10 },
                borderRadius: ROW_RADIUS
            }}
            uiBackground={selected ? { color: SELECTED_ROW_COLOR } : undefined}
            onMouseDown={() => {
                pickLanguage(props.language)
                props.onPicked()
            }}
        >
            <Flag language={props.language} size={props.size.flag} />
            <Label
                value={props.name}
                fontSize={NAME_FONT_SIZE}
                color={NAME_COLOR}
                textAlign="middle-left"
                // One line always: on the first load "Français" broke before its ç, measured late.
                textWrap="nowrap"
                uiTransform={{ height: props.size.row, flexGrow: 1, margin: { left: 12 } }}
            />
            {selected ? (
                <UiEntity
                    uiTransform={{ width: TICK_SIZE, height: TICK_SIZE, flexShrink: 0 }}
                    uiBackground={{ texture: { src: SMALL_ICONS_ATLAS }, textureMode: 'stretch', uvs: TICK_UVS, color: GOLD }}
                />
            ) : null}
        </UiEntity>
    )
}

/**
 * The list's columns (LANGUAGE_COLUMNS), side by side, for a row container `LANGUAGE_LIST_WIDTH`
 * wide (padding included). Picking a language calls `onPicked` after. `size`: the in-game list's
 * unless given.
 */
export function languageColumns(onPicked: () => void, size: LanguageListSize = LIST_SIZE): ReactEcs.JSX.Element[] {
    return LANGUAGE_COLUMNS.map((column, index) => (
        <UiEntity key={`column-${index}`} uiTransform={{ width: COLUMN_WIDTH, flexShrink: 0, flexDirection: 'column' }}>
            {column.map((language) => (
                <LanguageRow key={language} language={language} name={languageName(language)} size={size} onPicked={onPicked} />
            ))}
        </UiEntity>
    ))
}

/** The pill, with its list under it when open. Unplaced: the caller puts it where it goes, and
 *  should draw it after whatever the open list covers. */
export function LanguageSelector() {
    const current = getLanguage()
    const currentName = languageName(current)
    return (
        <UiEntity
            uiTransform={{
                flexDirection: 'column',
                alignItems: 'center'
            }}
        >
            <UiEntity
                uiTransform={{
                    height: PILL_HEIGHT,
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: { left: PILL_PADDING_X, right: PILL_PADDING_X },
                    borderWidth: PILL_BORDER,
                    borderColor: GOLD,
                    borderRadius: PILL_HEIGHT / 2
                }}
                uiBackground={{ color: PANEL_COLOR }}
                onMouseDown={() => {
                    open = !open
                }}
            >
                <Flag language={current} size={TITLE_LIST_SIZE.flag} />
                <Label
                    value={currentName}
                    fontSize={NAME_FONT_SIZE}
                    color={NAME_COLOR}
                    textAlign="middle-center"
                    textWrap="nowrap"
                    uiTransform={{ width: NAME_WIDTH, height: PILL_HEIGHT }}
                />
            </UiEntity>
            {open ? (
                <UiEntity
                    uiTransform={{
                        width: MENU_WIDTH,
                        margin: { top: MENU_GAP },
                        padding: MENU_PADDING,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        borderRadius: MENU_RADIUS
                    }}
                    uiBackground={{ color: MENU_COLOR }}
                >
                    {languageColumns(() => {
                        open = false
                    }, TITLE_LIST_SIZE)}
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}
