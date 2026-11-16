import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getLanguage, Language, LANGUAGES } from '../i18n'
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
    fr: smallIconUvs(4, 2) // D2
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
const NAME_WIDTH = 120
const MENU_GAP = 8
// The open list: half as wide again as it was (230), rows 30% taller (48), on solid black so it reads over the logo.
const MENU_WIDTH = 345
const MENU_PADDING = 6
const MENU_RADIUS = 12
const ROW_HEIGHT = Math.round(48 * 1.3)
const ROW_RADIUS = 8
const TICK_SIZE = 22

const GOLD = Color4.create(1, 0.76, 0.2, 1)
const PANEL_COLOR = Color4.create(0.13, 0.09, 0.06, 0.92)
const MENU_COLOR = Color4.Black()
const SELECTED_ROW_COLOR = Color4.create(1, 1, 1, 0.12)
const NAME_COLOR = Color4.White()

let open = false

function Flag(props: { language: Language }) {
    return (
        <UiEntity
            uiTransform={{ width: FLAG_SIZE, height: FLAG_SIZE, flexShrink: 0 }}
            uiBackground={{ texture: { src: SMALL_ICONS_ATLAS }, textureMode: 'stretch', uvs: FLAG_UVS[props.language] }}
        />
    )
}

/** One language in a list: flag, name, and the tick on the current one. Picking it calls `onPicked` after. */
export function LanguageRow(props: { key: string; language: Language; name: string; onPicked: () => void }) {
    const selected = props.language === getLanguage()
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: ROW_HEIGHT,
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
            <Flag language={props.language} />
            <Label
                value={props.name}
                fontSize={NAME_FONT_SIZE}
                color={NAME_COLOR}
                textAlign="middle-left"
                uiTransform={{ height: ROW_HEIGHT, flexGrow: 1, margin: { left: 12 } }}
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

/** The pill, with its list under it when open. Unplaced: the caller puts it where it goes, and
 *  should draw it after whatever the open list covers. */
export function LanguageSelector() {
    const current = getLanguage()
    const currentName = LANGUAGES.find((l) => l.id === current)?.name ?? ''
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
                <Flag language={current} />
                <Label
                    value={currentName}
                    fontSize={NAME_FONT_SIZE}
                    color={NAME_COLOR}
                    textAlign="middle-center"
                    uiTransform={{ width: NAME_WIDTH, height: PILL_HEIGHT }}
                />
            </UiEntity>
            {open ? (
                <UiEntity
                    uiTransform={{
                        width: MENU_WIDTH,
                        margin: { top: MENU_GAP },
                        padding: MENU_PADDING,
                        flexDirection: 'column',
                        borderRadius: MENU_RADIUS
                    }}
                    uiBackground={{ color: MENU_COLOR }}
                >
                    {LANGUAGES.map((l) => (
                        <LanguageRow
                            key={l.id}
                            language={l.id}
                            name={l.name}
                            onPicked={() => {
                                open = false
                            }}
                        />
                    ))}
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}
