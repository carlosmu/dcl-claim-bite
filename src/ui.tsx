import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { getCoins, getOre } from './shared/state/wallet'
import { changeSellAmount, getSellAmount, isPlayerAtBank, sellSelectedOre, setSellAmount } from './bank/bank'
import {
    getCarryCapacity,
    getMuleCapacity,
    getMuleFuelHours,
    getMuleOre,
    getSyncedRate,
    quoteSaleForDisplay,
    sendDebugCoins,
    sendDebugReset,
    sendEquip
} from './net/economy-link'
import { buySelected, getSelectedItem, getSelectedItemId, currentPrice, isPlayerAtShop, selectItem } from './shop/shop'
import { collectMule, isPlayerAtMule, refuelMule } from './mule/mule'
import { activePick, CATALOGUE, findItem, muleLevel, PICKS, ShopItem, ShopItemId } from './shared/economy/catalogue'
import { FUEL_MAX_TANKS, FUEL_TANK_HOURS } from './shared/economy/constants'
import { getEquipped, getOwned } from './shared/state/inventory'
import { getServerTick, isServerOnline } from './net/server-link'
import { getMiningStatus } from './mining/rocks'
import { setupRollingCounters, shownCoins, shownOre } from './ui/rolling-counter'
import { getOrePopup, RISE_SHARE, setupOrePopup } from './ui/ore-popup'
import { DEBUG_ADD_COINS, DEBUG_RESET_PROGRESS, DEBUG_SERVER_STATUS } from './shared/debug-flags'
import { BitmapText } from './ui/bitmap-text'
import { introScreen } from './ui/intro-screen'
import { welcomeOverlay } from './ui/welcome-overlay'

export function setupUi() {
    setupRollingCounters()
    setupOrePopup()

    // No screen inset: the SDK's default ('device') pulls the whole UI in by the phone's safe
    // margins. The game is landscape and everything sits in the centred column, where no notch
    // or corner reaches, so those margins only shrank the UI for nothing.
    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'none' })
}

const PANEL_WIDTH = 500

// Everything this scene draws lives inside one centred column: full screen height, but only
// 40% of its width.
//
// The narrowness is the point, not a layout accident. The left and right edges of the screen
// belong to the explorer's own interface — chat, minimap, the emote wheel — and anything we
// pin out there sits on top of it. Keeping to the middle band means the scene never has to
// guess where the client put its own UI this version.
//
// So nothing here is positioned against the SCREEN. An absolute child with `top`/`left`
// anchors to this column, which is what makes the HUD land inside the safe band.
const MAIN_CONTAINER_WIDTH = '40%'

// The HUD is the only permanent thing on screen (§6): small, clear of the thumb, pinned to
// the top of the container. The bank, market and rig panels are contextual — they exist
// only while the player stands in the matching zone.
const HUD_PANEL_WIDTH = 220
const HUD_ROW_HEIGHT = 34
const PANEL_BACKGROUND = Color4.create(0, 0, 0, 0.8)
const PANEL_RADIUS = 12
const ORE_COLOR = Color4.create(0.92, 0.92, 0.88, 1)
const COIN_COLOR = Color4.create(1, 0.84, 0.35, 1)
const MUTED_COLOR = Color4.create(0.65, 0.63, 0.6, 1)

// Magenta is the town's one interactable colour (§7), so it belongs on the button that acts.
const MAGENTA = Color4.create(0.9, 0.15, 0.65, 1)
const STEP_BUTTON_COLOR = Color4.create(0.22, 0.22, 0.24, 1)
const DISABLED_COLOR = Color4.create(0.25, 0.25, 0.26, 1)

// The server indicator is a development readout, not part of the game's look: it sits at the
// bottom centre, out of the way of the panels, and says plainly whether
// the authoritative server is answering. Green with a rising number means it is.
// --- HUD -------------------------------------------------------------------------------
//
// One horizontal pill at the top of the centred column, spanning its full width; the three
// segments share that width equally. It stays inside the column rather than the screen, so it never lands on top of the
// explorer's own interface. Tool, ore and coins, three segments split by hair lines, each an
// icon beside a caption and its value.
//
// Icons come from UI_01.png, a 4x4 grid. Rows are lettered A–D from the top, columns 1–4 from
// the left, so A2 is row A, column 2. Many cells are not used yet; they are mapped below anyway.
const ATLAS = 'assets/images/UI_01.png'
const ATLAS_COLUMNS = 4
const ATLAS_ROWS = 4

const HUD_MARGIN = 16
const HUD_HEIGHT = 64
const HUD_ICON_SIZE = HUD_HEIGHT - 8
const HUD_CAPTION_SIZE = 18
const HUD_VALUE_SIZE = 28
const HUD_BACKGROUND = Color4.create(0.07, 0.08, 0.1, 0.92)
const HUD_DIVIDER = Color4.create(1, 1, 1, 0.14)

/**
 * UVs for one cell of the atlas, addressed like a spreadsheet: column 1 is the left, row 1 is
 * the TOP. The v axis runs bottom-up in the texture, which is why the row is flipped here
 * rather than at every call site.
 *
 * The four corners go bottom-left, top-left, top-right, bottom-right.
 */
function atlasCell(column: number, row: number): number[] {
    const w = 1 / ATLAS_COLUMNS
    const h = 1 / ATLAS_ROWS
    const u0 = (column - 1) * w
    const v0 = 1 - row * h
    return [u0, v0, u0, v0 + h, u0 + w, v0 + h, u0 + w, v0]
}

const ICON_ORE = atlasCell(1, 1) // A1
const ICON_PICK_IRON = atlasCell(2, 1) // A2 — pick tier 0
const ICON_PICK_STEEL = atlasCell(3, 1) // A3 — pick tier 1
const ICON_PICK_DIAMOND = atlasCell(4, 1) // A4 — pick tier 2
const ICON_COINS = atlasCell(1, 2) // B1
const ICON_MULE = atlasCell(2, 2) // B2
const ICON_FUEL = atlasCell(3, 2) // B3
const ICON_WAREHOUSE = atlasCell(4, 2) // B4
const ICON_BANK = atlasCell(1, 3) // C1
const ICON_HOUSE = atlasCell(2, 3) // C2
const ICON_LOCK = atlasCell(3, 3) // C3
const ICON_TIMER = atlasCell(4, 3) // C4
const ICON_FORBIDDEN = atlasCell(1, 4) // D1 — skull / prohibited
const ICON_SHERIFF = atlasCell(2, 4) // D2
const ICON_MAP = atlasCell(3, 4) // D3
const ICON_NOTIFICATION = atlasCell(4, 4) // D4 — bell

// Pick icon by catalogue id. No pick shows the iron one.
const PICK_ICONS: Record<string, number[]> = {
    pick: ICON_PICK_IRON,
    'steel-pick': ICON_PICK_STEEL,
    'miners-pick': ICON_PICK_DIAMOND
}

const SERVER_ONLINE_COLOR = Color4.create(0.3, 0.9, 0.4, 1)
const SERVER_OFFLINE_COLOR = Color4.create(1, 0.3, 0.3, 1)
const SERVER_LABEL_HEIGHT = 28

const hudIcon = (uvs: number[]) => (
    <UiEntity
        uiTransform={{ width: HUD_ICON_SIZE, height: HUD_ICON_SIZE, margin: { right: 10 } }}
        uiBackground={{ texture: { src: ATLAS }, textureMode: 'stretch', uvs }}
    />
)

const hudDivider = () => (
    <UiEntity
        uiTransform={{ width: 1, height: HUD_HEIGHT * 0.5, margin: { left: 14, right: 14 } }}
        uiBackground={{ color: HUD_DIVIDER }}
    />
)

/**
 * Icon, caption, value.
 *
 * Labels wrap by default, so on a narrow screen "15 / 150" broke onto two lines once the column
 * squeezed the pill. The text never wraps and the segment never shrinks: the pill grows to fit
 * its contents instead.
 */
const hudSegment = (uvs: number[], caption: string, value: string, color: Color4) => (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
        {hudIcon(uvs)}
        <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center' }}>
            <BitmapText value={caption} fontSize={HUD_CAPTION_SIZE} color={MUTED_COLOR} />
            <BitmapText value={value} fontSize={HUD_VALUE_SIZE} color={color} />
        </UiEntity>
    </UiEntity>
)

const hud = () => {
    const pick = activePick((id) => getOwned(id), getEquipped())
    const capacity = getCarryCapacity()

    return (
        // Two entities, not one. The pill has to size itself to its contents, so it cannot
        // also be the thing that centres itself — an absolute box with `left` set is anchored,
        // not centred. The outer entity spans the column and centres whatever it holds; the
        // inner one is the pill, laid out normally and free to be as wide as it needs.
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: HUD_MARGIN },
                width: '100%',
                flexDirection: 'row',
                justifyContent: 'center'
            }}
        >
        <UiEntity
            uiTransform={{
                width: '100%',
                height: HUD_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 18, right: 22 },
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: HUD_BACKGROUND }}
        >
            {hudSegment((pick && PICK_ICONS[pick.id]) ?? ICON_PICK_IRON,'Tool', pick?.label ?? 'No pick', Color4.White())}
            {hudDivider()}
            {hudSegment(ICON_ORE, 'Ore', capacity > 0 ? `${shownOre()} / ${capacity}` : `${shownOre()}`, ORE_COLOR)}
            {hudDivider()}
            {hudSegment(ICON_COINS, 'Coins', `${shownCoins()}`, COIN_COLOR)}
        </UiEntity>
        </UiEntity>
    )
}

const infoRow = (label: string, value: string, valueColor: Color4) => (
    <UiEntity
        uiTransform={{
            width: '100%',
            height: 34,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}
    >
        <Label
            value={label}
            fontSize={20}
            color={MUTED_COLOR}
            textAlign="middle-left"
            uiTransform={{ width: '50%', height: 34 }}
        />
        <Label
            value={value}
            fontSize={22}
            color={valueColor}
            textAlign="middle-right"
            uiTransform={{ width: '50%', height: 34 }}
        />
    </UiEntity>
)

const stepButton = (label: string, onClick: () => void, width: number) => (
    <Button
        value={label}
        fontSize={20}
        color={Color4.White()}
        uiTransform={{
            width,
            height: 44,
            margin: { left: 4, right: 4 },
            borderRadius: 8
        }}
        uiBackground={{ color: STEP_BUTTON_COLOR }}
        onMouseDown={onClick}
    />
)

const bankPanel = () => {
    const ore = getOre()
    const amount = getSellAmount()
    const payout = quoteSaleForDisplay(amount)

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: 380,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            <BitmapText value="The Bank" fontSize={42} align="center" uiTransform={{ width: '100%' }} />
            {infoRow('Town rate', `${getSyncedRate().toFixed(1)} ore = 1 coin`, ORE_COLOR)}
            {infoRow('Your ore', `${ore}`, ORE_COLOR)}

            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: 52,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                {stepButton('-10', () => changeSellAmount(-10), 64)}
                {stepButton('-1', () => changeSellAmount(-1), 64)}
                <Label
                    value={`${amount}`}
                    fontSize={26}
                    color={Color4.White()}
                    textAlign="middle-center"
                    uiTransform={{ width: 96, height: 44 }}
                />
                {stepButton('+1', () => changeSellAmount(1), 64)}
                {stepButton('+10', () => changeSellAmount(10), 64)}
            </UiEntity>

            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: 48,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                {stepButton('Half', () => setSellAmount(Math.floor(getOre() / 2)), 96)}
                {stepButton('All', () => setSellAmount(getOre()), 96)}
            </UiEntity>

            {infoRow('You get', `${payout} coins`, COIN_COLOR)}

            <Button
                value={amount > 0 ? `SELL ${amount} ORE` : 'NOTHING TO SELL'}
                fontSize={24}
                color={Color4.White()}
                disabled={amount <= 0}
                uiTransform={{
                    width: '100%',
                    height: 56,
                    margin: { top: 12 },
                    borderRadius: 10
                }}
                uiBackground={{ color: amount > 0 ? MAGENTA : DISABLED_COLOR }}
                onMouseDown={sellSelectedOre}
            />
        </UiEntity>
    )
}

const TILE_COLOR = Color4.create(0.16, 0.16, 0.18, 1)
const TILE_SELECTED_COLOR = Color4.create(0.28, 0.1, 0.24, 1)
const TILE_BORDER_COLOR = Color4.create(0.32, 0.32, 0.34, 1)
const TILE_WIDTH = 220
const TILE_HEIGHT = 88

const shopTile = (item: ShopItem) => {
    const selected = getSelectedItemId() === item.id
    const owned = getOwned(item.id)
    const price = currentPrice(item)
    const affordable = price !== null && getCoins() >= price

    return (
        <UiEntity
            uiTransform={{
                width: TILE_WIDTH,
                height: TILE_HEIGHT,
                margin: { left: 6, right: 6, top: 6, bottom: 6 },
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 10,
                borderWidth: 2,
                borderColor: selected ? MAGENTA : TILE_BORDER_COLOR
            }}
            uiBackground={{ color: selected ? TILE_SELECTED_COLOR : TILE_COLOR }}
            onMouseDown={() => selectItem(item.id)}
        >
            <BitmapText value={item.label} fontSize={28} align="center" uiTransform={{ width: '100%' }} />
            <Label
                value={item.comingSoon === true ? 'coming soon' : price === null ? 'max level' : `${price} coins`}
                fontSize={18}
                color={affordable ? COIN_COLOR : MUTED_COLOR}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: 24 }}
            />
            {owned > 0 ? (
                <Label
                    value={item.id === 'mule' ? `level ${muleLevel((id) => getOwned(id))}` : `owned ${owned}`}
                    fontSize={14}
                    color={MUTED_COLOR}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: 18 }}
                />
            ) : null}
        </UiEntity>
    )
}

const shopRow = (items: ShopItem[]) => (
    <UiEntity
        uiTransform={{
            width: '100%',
            height: TILE_HEIGHT + 12,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
        }}
    >
        {items.map(shopTile)}
    </UiEntity>
)

/** Whether one more tank fits in the rig. The server checks this again; this only greys the button. */
function tankHasRoom(): boolean {
    return getMuleFuelHours() + FUEL_TANK_HOURS <= FUEL_MAX_TANKS * FUEL_TANK_HOURS
}

function buyButtonText(item: ShopItem, price: number | null, coins: number): string {
    if (item.comingSoon === true) return 'Coming soon'
    if (item.id === 'fuel' && getOwned('mule') <= 0) return 'Needs a M.U.L.E.'
    if (price === null) return 'Max level'
    if (item.id === 'fuel' && !tankHasRoom()) return 'Tank full'
    if (coins < price) return `Need ${price - coins} more coins`
    if (item.id === 'mule' && getOwned('mule') > 0) return `Upgrade to level ${muleLevel((id) => getOwned(id)) + 1}`
    return `Buy ${item.label}`
}

const marketPanel = () => {
    const selected = getSelectedItem()
    const coins = getCoins()
    const price = selected === null ? null : currentPrice(selected)
    const affordable =
        price !== null && coins >= price && (selected === null || selected.id !== 'fuel' || tankHasRoom())

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: 460,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            <BitmapText value="Market" fontSize={42} align="center" uiTransform={{ width: '100%' }} />

            {shopRow(CATALOGUE.slice(0, 3))}
            {shopRow(CATALOGUE.slice(3, 6))}
            {shopRow(CATALOGUE.slice(6))}

            {/* The buy button only exists once something is picked. */}
            {selected === null ? (
                <Label
                    value="Pick an item"
                    fontSize={20}
                    color={MUTED_COLOR}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: 56, margin: { top: 12 } }}
                />
            ) : (
                <Button
                    value={buyButtonText(selected, price, coins)}
                    fontSize={24}
                    color={Color4.White()}
                    disabled={!affordable}
                    uiTransform={{
                        width: '100%',
                        height: 56,
                        margin: { top: 12 },
                        borderRadius: 10
                    }}
                    uiBackground={{ color: affordable ? MAGENTA : DISABLED_COLOR }}
                    onMouseDown={buySelected}
                />
            )}
        </UiEntity>
    )
}

// --- Debug: reset progress --------------------------------------------------------------
//
// Sits just above the coins button. Takes two taps: the first arms it, the second wipes, so a
// stray click does not throw away a session of testing. Only drawn while DEBUG_RESET_PROGRESS
// is on; the server checks the same flag.

/** Seconds the armed button waits for the second tap before it disarms. */
const RESET_CONFIRM_SECONDS = 3
let resetArmedUntil = 0
let uiClock = 0

engine.addSystem((dt: number) => {
    uiClock += dt
})

const debugResetTool = () => {
    const armed = uiClock < resetArmedUntil
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { bottom: 104, left: 0 }
            }}
        >
            <Button
                value={armed ? 'Tap again to wipe' : 'Reset progress'}
                fontSize={16}
                color={Color4.White()}
                uiTransform={{ width: 150, height: 40, borderRadius: 8 }}
                uiBackground={{ color: armed ? MAGENTA : STEP_BUTTON_COLOR }}
                onMouseDown={() => {
                    if (!armed) {
                        resetArmedUntil = uiClock + RESET_CONFIRM_SECONDS
                        return
                    }
                    resetArmedUntil = 0
                    sendDebugReset()
                }}
            />
        </UiEntity>
    )
}

// --- Debug: add coins -------------------------------------------------------------------
//
// A small button at the bottom-left of the column that opens an amount field. Only drawn while
// DEBUG_ADD_COINS is on; the server checks the same flag, so hiding it is not the only guard.

let debugOpen = false
let debugAmount = ''

function submitDebugCoins() {
    const amount = Math.floor(Number(debugAmount))
    if (!(amount > 0)) return
    sendDebugCoins(amount)
    debugAmount = ''
    debugOpen = false
}

const debugCoinsTool = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { bottom: 56, left: 0 },
            flexDirection: 'row',
            alignItems: 'center'
        }}
    >
        <Button
            value={debugOpen ? 'Close' : '+ Coins (debug)'}
            fontSize={16}
            color={Color4.White()}
            uiTransform={{ width: 150, height: 40, borderRadius: 8 }}
            uiBackground={{ color: STEP_BUTTON_COLOR }}
            onMouseDown={() => {
                debugOpen = !debugOpen
            }}
        />
        {debugOpen ? (
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { left: 8 } }}>
                <Input
                    placeholder="amount"
                    value={debugAmount}
                    fontSize={18}
                    color={Color4.White()}
                    placeholderColor={MUTED_COLOR}
                    uiTransform={{ width: 140, height: 40 }}
                    uiBackground={{ color: PANEL_BACKGROUND }}
                    onChange={(value) => {
                        debugAmount = value
                    }}
                    onSubmit={(value) => {
                        debugAmount = value
                        submitDebugCoins()
                    }}
                />
                <Button
                    value="Add"
                    fontSize={18}
                    color={Color4.White()}
                    uiTransform={{ width: 70, height: 40, margin: { left: 8 }, borderRadius: 8 }}
                    uiBackground={{ color: MAGENTA }}
                    onMouseDown={submitDebugCoins}
                />
            </UiEntity>
        ) : null}
    </UiEntity>
)

// --- Mining bar ------------------------------------------------------------------------
//
// Sits right under the HUD, and only while the player is actually at a rock (§6: nothing
// permanent on screen but the HUD). Local by nature: it is drawn from this client's own swing
// count, so nobody else sees it.
//
// The wording carries the rule that the bar is the payout: no ore until it fills.

const MINING_BAR_WIDTH = 320
const MINING_BAR_HEIGHT = 14
const MINING_PANEL_TOP = HUD_MARGIN + HUD_HEIGHT + 10
const MINING_FILL_COLOR = Color4.create(1, 198 / 255, 0, 1)
const MINING_TRACK_COLOR = Color4.create(0.12, 0.1, 0.06, 1)

const miningBar = () => {
    const status = getMiningStatus()
    if (status === null) return null

    const progress = status.needed > 0 ? Math.min(1, status.hits / status.needed) : 0
    const left = Math.max(0, status.needed - status.hits)
    const caption =
        status.blocked !== ''
            ? status.blocked
            : `Keep mining — ${left} ${left === 1 ? 'hit' : 'hits'} to go`

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: MINING_PANEL_TOP },
                width: '100%',
                flexDirection: 'row',
                justifyContent: 'center'
            }}
        >
            <UiEntity
                uiTransform={{
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: { left: 18, right: 18, top: 10, bottom: 12 },
                    borderRadius: PANEL_RADIUS
                }}
                uiBackground={{ color: HUD_BACKGROUND }}
            >
                <Label
                    value={caption}
                    fontSize={18}
                    color={status.blocked !== '' ? MUTED_COLOR : Color4.White()}
                    textAlign="middle-center"
                    textWrap="nowrap"
                    uiTransform={{ height: 26, margin: { bottom: 8 } }}
                />
                {/* The bar is the payout: it has to be visibly unfinished for the caption below
                    to mean anything. */}
                <UiEntity
                    uiTransform={{
                        width: MINING_BAR_WIDTH,
                        height: MINING_BAR_HEIGHT,
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: Color4.Black()
                    }}
                    uiBackground={{ color: MINING_TRACK_COLOR }}
                >
                    <UiEntity
                        uiTransform={{ width: `${progress * 100}%`, height: '100%' }}
                        uiBackground={{ color: MINING_FILL_COLOR }}
                    />
                </UiEntity>
            </UiEntity>
        </UiEntity>
    )
}

// --- The "+5 Ore" popup ------------------------------------------------------------------
//
// Big, centred, rising and fading: the payout of a finished rock, where the player is already
// looking. Drawn in the scene's bitmap typeface, whose shadow is baked into the glyphs.

const POPUP_FONT_SIZE = 84
const POPUP_FADE_STEPS = 4
const POPUP_COLOR = Color4.create(1, 198 / 255, 0, 1)
// The social bonus line under it: smaller, and magenta, the town's colour for what other
// players bring (section 7).
const POPUP_BONUS_FONT_SIZE = 52
const POPUP_BONUS_COLOR = MAGENTA

const orePopup = () => {
    const popup = getOrePopup()
    if (popup === null) return null

    const text = `+${popup.amount} Ore`
    // Fades over the second half only, so it is fully readable while it is rising. In a few
    // steps rather than every frame: the fade recolours every glyph, and doing that each frame
    // stalled mobile until the scene errored.
    const alpha = Math.ceil(Math.min(1, (1 - popup.progress) * 2) * POPUP_FADE_STEPS) / POPUP_FADE_STEPS
    const risen = popup.progress * RISE_SHARE * 100

    return (
        <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%' }}>
            <BitmapText
                value={text}
                fontSize={POPUP_FONT_SIZE}
                color={Color4.create(POPUP_COLOR.r, POPUP_COLOR.g, POPUP_COLOR.b, alpha)}
                align="center"
                uiTransform={{ positionType: 'absolute', position: { top: `${40 - risen}%` }, width: '100%' }}
            />
            {popup.bonus > 0 ? (
                <BitmapText
                    value={`+${popup.bonus} Social bonus`}
                    fontSize={POPUP_BONUS_FONT_SIZE}
                    color={Color4.create(POPUP_BONUS_COLOR.r, POPUP_BONUS_COLOR.g, POPUP_BONUS_COLOR.b, alpha)}
                    align="center"
                    uiTransform={{
                        positionType: 'absolute',
                        position: { top: `${40 - risen + (POPUP_FONT_SIZE / 1080) * 100}%` },
                        width: '100%'
                    }}
                />
            ) : null}
        </UiEntity>
    )
}

const serverStatus = () => {
    const online = isServerOnline()
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { bottom: 16 },
                width: '100%',
                height: SERVER_LABEL_HEIGHT,
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <Label
                value={online ? `server tick: ${getServerTick()}` : 'server: offline'}
                fontSize={18}
                color={online ? SERVER_ONLINE_COLOR : SERVER_OFFLINE_COLOR}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: SERVER_LABEL_HEIGHT }}
            />
        </UiEntity>
    )
}

function fuelLeftText(): string {
    const hours = getMuleFuelHours()
    if (hours <= 0) return 'empty — stopped'
    if (hours < 1) return `${Math.ceil(hours * 60)} min left`
    return `${Math.floor(hours)}h left`
}

// The rig's panel. Collecting is a deliberate act at the rig itself rather than ore appearing
// in the bag on login: arriving to claim a load is the return the rig is built to create.
const mulePanel = () => {
    const waiting = getMuleOre()
    const room = Math.max(0, getCarryCapacity() - getOre())
    const takeable = Math.min(waiting, room)

    let buttonText = `Collect ${takeable} ore`
    if (waiting <= 0) buttonText = 'The rig is empty'
    else if (room <= 0) buttonText = 'Bag full'
    else if (takeable < waiting) buttonText = `Collect ${takeable} of ${waiting} ore`

    const fuel = findItem('fuel')
    const fuelPrice = fuel === null ? null : currentPrice(fuel)
    const canRefuel = fuelPrice !== null && tankHasRoom() && getCoins() >= fuelPrice
    let refuelText = `Refuel · ${fuelPrice} coins`
    if (!tankHasRoom()) refuelText = 'Tank full'
    else if (fuelPrice !== null && getCoins() < fuelPrice) refuelText = `Refuel · need ${fuelPrice - getCoins()} more coins`

    return (
        <UiEntity
            uiTransform={{
                width: PANEL_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: { top: 16, bottom: 16, left: 20, right: 20 },
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            {infoRow('M.U.L.E.', `${waiting} / ${getMuleCapacity()} ore`, ORE_COLOR)}
            {infoRow('Fuel', fuelLeftText(), getMuleFuelHours() > 0 ? COIN_COLOR : MUTED_COLOR)}
            <Button
                value={buttonText}
                fontSize={20}
                uiTransform={{ width: '100%', height: 46, margin: { top: 12 } }}
                uiBackground={{ color: takeable > 0 ? MAGENTA : DISABLED_COLOR }}
                onMouseDown={collectMule}
            />
            <Button
                value={refuelText}
                fontSize={20}
                uiTransform={{ width: '100%', height: 46, margin: { top: 8 } }}
                uiBackground={{ color: canRefuel ? MAGENTA : DISABLED_COLOR }}
                onMouseDown={refuelMule}
            />
        </UiEntity>
    )
}

// --- Inventory ----------------------------------------------------------------------------
//
// Opened by a button at the bottom-right of the column; closes itself with its own button. Lists
// what the player owns. Picks can be switched between — a request, answered by the wallet — and
// everything else is shown for reference only.

let inventoryOpen = false

const INVENTORY_ICON_SIZE = 72
const INVENTORY_ROW_HEIGHT = 88

// Icons for the non-pick items. The house and the rest have their own cells in the atlas.
const ITEM_ICONS: Partial<Record<ShopItemId, number[]>> = {
    warehouse: ICON_WAREHOUSE,
    mule: ICON_MULE,
    fuel: ICON_FUEL,
    house: ICON_HOUSE
}

const inventoryRow = (item: ShopItem) => {
    const isPick = item.hitsPerRock !== undefined
    const inUse = isPick && getEquipped() === item.id
    const icon = isPick ? PICK_ICONS[item.id] : ITEM_ICONS[item.id]
    const detail = isPick
        ? `${item.hitsPerRock} hits per rock`
        : item.id === 'mule'
          ? `level ${muleLevel((id) => getOwned(id))}`
          : `owned ${getOwned(item.id)}`

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: INVENTORY_ROW_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 12, right: 12 },
                margin: { bottom: 8 },
                borderRadius: 10,
                borderWidth: 2,
                borderColor: inUse ? MAGENTA : TILE_BORDER_COLOR
            }}
            uiBackground={{ color: inUse ? TILE_SELECTED_COLOR : TILE_COLOR }}
        >
            {icon !== undefined ? (
                <UiEntity
                    uiTransform={{ width: INVENTORY_ICON_SIZE, height: INVENTORY_ICON_SIZE, margin: { right: 14 }, flexShrink: 0 }}
                    uiBackground={{ texture: { src: ATLAS }, textureMode: 'stretch', uvs: icon }}
                />
            ) : null}
            <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
                <BitmapText value={item.label} fontSize={28} />
                <Label
                    value={detail}
                    fontSize={16}
                    color={MUTED_COLOR}
                    textAlign="middle-left"
                    textWrap="nowrap"
                    uiTransform={{ height: 22 }}
                />
            </UiEntity>
            {isPick ? (
                <Button
                    value={inUse ? 'In use' : 'Use'}
                    fontSize={20}
                    color={Color4.White()}
                    disabled={inUse}
                    uiTransform={{ width: 110, height: 46, borderRadius: 8, flexShrink: 0 }}
                    uiBackground={{ color: inUse ? DISABLED_COLOR : MAGENTA }}
                    onMouseDown={() => sendEquip(item.id)}
                />
            ) : null}
        </UiEntity>
    )
}

const inventoryPanel = () => {
    // Picks first, best last, then everything else — only what the player owns.
    const items = [...PICKS, ...CATALOGUE.filter((item) => item.hitsPerRock === undefined)].filter(
        (item) => getOwned(item.id) > 0
    )

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                padding: 20,
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            <BitmapText value="Inventory" fontSize={42} align="center" uiTransform={{ width: '100%', margin: { bottom: 8 } }} />
            {items.length === 0 ? (
                <Label
                    value="Nothing yet — the mayor has a pick for you"
                    fontSize={20}
                    color={MUTED_COLOR}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: 40 }}
                />
            ) : (
                items.map(inventoryRow)
            )}
            <Button
                value="Close"
                fontSize={20}
                color={Color4.White()}
                uiTransform={{ width: '100%', height: 46, margin: { top: 8 }, borderRadius: 10 }}
                uiBackground={{ color: STEP_BUTTON_COLOR }}
                onMouseDown={() => {
                    inventoryOpen = false
                }}
            />
        </UiEntity>
    )
}

const inventoryButton = () => (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 56, right: 0 } }}>
        <Button
            value={inventoryOpen ? 'Close' : 'Inventory'}
            fontSize={18}
            color={Color4.White()}
            uiTransform={{ width: 150, height: 44, borderRadius: 8 }}
            uiBackground={{ color: STEP_BUTTON_COLOR }}
            onMouseDown={() => {
                inventoryOpen = !inventoryOpen
                if (inventoryOpen) mapOpen = false
            }}
        />
    </UiEntity>
)

// --- Map ----------------------------------------------------------------------------------

const MAP_IMAGE = 'assets/images/map.jpg'
/** Share of the screen's width the map takes. It is square, so the height follows the width. */
const MAP_SCREEN_WIDTH = 0.4
/** Used until the canvas reports its size, on the first frame or two. */
const MAP_FALLBACK_SIZE = 560

function mapSize(): number {
    const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
    return canvas !== null && canvas.width > 0 ? canvas.width * MAP_SCREEN_WIDTH : MAP_FALLBACK_SIZE
}

let mapOpen = false

// The map's close button: red, pinned to the map's top-right corner.
const MAP_CLOSE_COLOR = Color4.fromHexString('#d32f2f')

const mapPanel = () => (
    <UiEntity
        uiTransform={{ width: mapSize(), height: mapSize(), positionType: 'relative', borderRadius: PANEL_RADIUS }}
        uiBackground={{ texture: { src: MAP_IMAGE }, textureMode: 'stretch' }}
    >
        <Button
            value="X"
            fontSize={30}
            color={Color4.White()}
            uiTransform={{
                positionType: 'absolute',
                position: { top: 0, right: 0 },
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 3,
                borderColor: Color4.Black()
            }}
            uiBackground={{ color: MAP_CLOSE_COLOR }}
            onMouseDown={() => {
                mapOpen = false
            }}
        />
    </UiEntity>
)

const mapButton = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { bottom: 56, right: 158 },
            width: 150,
            height: 44,
            borderRadius: 8,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
        }}
        uiBackground={{ color: STEP_BUTTON_COLOR }}
        onMouseDown={() => {
            mapOpen = !mapOpen
            if (mapOpen) inventoryOpen = false
        }}
    >
        <UiEntity
            uiTransform={{ width: 32, height: 32, margin: { right: 8 } }}
            uiBackground={{ texture: { src: ATLAS }, textureMode: 'stretch', uvs: ICON_MAP }}
        />
        <Label value="Map" fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ height: 44 }} />
    </UiEntity>
)

export const uiMenu = () => (
    <UiEntity
        uiTransform={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row'
        }}
    >
        {/* main-container: every piece of UI goes in here */}
        <UiEntity
            uiTransform={{
                width: MAIN_CONTAINER_WIDTH,
                height: '100%',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                positionType: 'relative'
            }}
        >
            {hud()}
            {miningBar()}
            {orePopup()}
            {mapOpen ? mapPanel() : null}
            {inventoryOpen ? inventoryPanel() : null}
            {!mapOpen && !inventoryOpen && isPlayerAtBank() ? bankPanel() : null}
            {!mapOpen && !inventoryOpen && isPlayerAtShop() ? marketPanel() : null}
            {!mapOpen && !inventoryOpen && isPlayerAtMule() && getMuleCapacity() > 0 ? mulePanel() : null}
            {mapButton()}
            {inventoryButton()}
            {DEBUG_SERVER_STATUS ? serverStatus() : null}
            {DEBUG_RESET_PROGRESS ? debugResetTool() : null}
            {DEBUG_ADD_COINS ? debugCoinsTool() : null}
        </UiEntity>
        {welcomeOverlay()}
        {introScreen()}
    </UiEntity>
)
