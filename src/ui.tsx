import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { isMobile } from '@dcl/sdk/platform'
import { getCoins, getOre } from './shared/state/wallet'
import { changeSellCoins, closeBankPanel, getSellAmount, getSellCoins, isBankPanelOpen, maxSellCoins, sellSelectedOre, setSellCoins } from './bank/bank'
import {
    getCarryCapacity,
    getMuleCount,
    getMuleFuelHours,
    getRateHistory,
    getSyncedRate,
    sendDebugCoins,
    sendDebugOre,
    sendDebugReset,
    sendEquip
} from './net/economy-link'
import { buyItem, closeStorePanel, currentPrice, getSelectedProduct, isStorePanelOpen, selectProduct, whyUnavailable } from './shop/shop'
import { closeMulePanel, isMulePanelOpen } from './mule/mule'
import { closeLandOfficePanel, getSelectedProperty, isLandOfficePanelOpen, selectProperty } from './land-office/land-office'
import {
    activePick,
    CATALOGUE,
    findItem,
    fuelOrder,
    fuelTankGallons,
    itemsOf,
    nextTier,
    ownedTier,
    PICKS,
    ShopItem,
    ShopItemId
} from './shared/economy/catalogue'
import {
    FUEL_GALLONS_PER_RIG_DAY,
    FUEL_MAX_DAYS,
    FUEL_PRICE_PER_GALLON,
    MULE_ORE_PER_HOUR,
    MARKET_WINDOW_SECONDS,
    RATE_BASE,
    RATE_RECOVERY_PER_WINDOW
} from './shared/economy/constants'
import { getEquipped, getOwned } from './shared/state/inventory'
import { getServerTick, isServerOnline } from './net/server-link'
import { getMiningStatus } from './mining/rocks'
import { setupRollingCounters, shownCoins, shownOre } from './ui/rolling-counter'
import { getOrePopup, RISE_SHARE, setupOrePopup } from './ui/ore-popup'
import { DEBUG_ADD_COINS, DEBUG_ADD_ORE, DEBUG_RESET_PROGRESS, DEBUG_SERVER_STATUS, DEBUG_SHOW_MULE_ALERTS } from './shared/debug-flags'
import { quotedRate } from './shared/state/market'
import { BitmapText } from './ui/bitmap-text'
import { introScreen } from './ui/intro-screen'
import { welcomeOverlay } from './ui/welcome-overlay'
import { getObjective, Objective, setupObjective } from './ui/objective'

export function setupUi() {
    setupRollingCounters()
    setupOrePopup()
    setupObjective()

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

// The big panels (bank, store, rig, inventory) are laid out for the desktop column: 40% of
// 1920 = 768. On mobile the SDK swaps the 16:9 virtual screen for 1600x720, which shrinks the
// column to 640 and squeezes their rows until text spills over its neighbours. They keep at
// least this width instead, overflowing the column evenly on both sides — the screen around
// it has the room.
const PANEL_MIN_WIDTH = 760

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
// explorer's own interface. Ore, coins and rate, three segments split by hair lines. Ore is a
// storage bar with the amount on it; the pick lives in its own selector at the bottom-left.
//
// Icons come from two atlases, UI_01.png and UI_02.png, each a 4x4 grid named like a spreadsheet:
// columns are lettered A–D from the left, rows numbered 1–4 from the top, so B3 is column B,
// row 3. Many cells are not used yet; UI_01's are mapped below anyway.
const ATLAS = 'assets/images/UI_01.png'
const ATLAS_2 = 'assets/images/UI_02.png'
const ATLAS_COLUMNS = 4
const ATLAS_ROWS = 4

const HUD_MARGIN = 16
const HUD_HEIGHT = 64
/** Breathing room above and below the segments, so the captions don't touch the pill's top edge. */
const HUD_PADDING_Y = 8
const HUD_PILL_HEIGHT = HUD_HEIGHT + HUD_PADDING_Y * 2
const HUD_ICON_SIZE = HUD_HEIGHT - 8
const HUD_CAPTION_SIZE = 18
const HUD_VALUE_SIZE = 28
const HUD_BACKGROUND = Color4.create(0.07, 0.08, 0.1, 0.92)
const HUD_DIVIDER = Color4.create(1, 1, 1, 0.14)
const HUD_UNIT_SIZE = 13

// The ore segment's storage bar: how full the storage is, with the amount written on it.
const ORE_BAR_WIDTH = 170
const ORE_BAR_HEIGHT = 26
const ORE_BAR_VALUE_SIZE = 24
/** How far the amount sits in from the bar's left edge; the "Ore" caption is indented the same, so they line up. */
const ORE_BAR_TEXT_INSET = 8
const ORE_BAR_TRACK = Color4.create(0.12, 0.1, 0.06, 1)
const ORE_BAR_FILL = Color4.create(0.62, 0.48, 0.2, 1)
const ORE_BAR_FULL_FILL = Color4.create(0.7, 0.24, 0.2, 1)
const STORAGE_FULL_COLOR = Color4.create(0.95, 0.4, 0.35, 1)

/**
 * UVs for one cell of the atlas, addressed like a spreadsheet: column 1 is the left, row 1 is
 * the TOP. The v axis runs bottom-up in the texture, which is why the row is flipped here
 * rather than at every call site.
 *
 * The four corners go bottom-left, top-left, top-right, bottom-right.
 */
function atlasCell(column: number, row: number, src: string = ATLAS): Icon {
    const w = 1 / ATLAS_COLUMNS
    const h = 1 / ATLAS_ROWS
    const u0 = (column - 1) * w
    const v0 = 1 - row * h
    return { src, uvs: [u0, v0, u0, v0 + h, u0 + w, v0 + h, u0 + w, v0] }
}

/** One cell of one atlas. */
type Icon = { src: string; uvs: number[] }

/** The background that draws an icon, optionally tinted. */
function iconBackground(icon: Icon, color?: Color4) {
    return { texture: { src: icon.src }, textureMode: 'stretch' as const, uvs: icon.uvs, color }
}

const ICON_ORE = atlasCell(1, 1) // A1
const ICON_PICK_IRON = atlasCell(2, 1) // B1 — pick tier 0
const ICON_PICK_STEEL = atlasCell(3, 1) // C1 — pick tier 1
const ICON_PICK_DIAMOND = atlasCell(4, 1) // D1 — pick tier 2
const ICON_COINS = atlasCell(1, 2) // A2
const ICON_MULE = atlasCell(2, 2) // B2
const ICON_FUEL = atlasCell(3, 2) // C2
const ICON_WAREHOUSE = atlasCell(4, 2) // D2
const ICON_BANK = atlasCell(1, 3) // A3
const ICON_HOUSE = atlasCell(2, 3) // B3
const ICON_LOCK = atlasCell(3, 3) // C3
const ICON_TIMER = atlasCell(4, 3) // D3
const ICON_FORBIDDEN = atlasCell(1, 4) // A4 — skull / prohibited
const ICON_SHERIFF = atlasCell(2, 4) // B4
const ICON_MAP = atlasCell(3, 4) // C4
const ICON_NOTIFICATION = atlasCell(4, 4) // D4 — bell

// UI_02.png.
const ICON_WAGON = atlasCell(1, 1, ATLAS_2) // A1
const ICON_CABIN = atlasCell(2, 1, ATLAS_2) // B1
const ICON_HOUSE_HOME = atlasCell(3, 1, ATLAS_2) // C1
const ICON_RANCH = atlasCell(4, 1, ATLAS_2) // D1
const ICON_INVENTORY = atlasCell(1, 2, ATLAS_2) // A2
const ICON_HORSE = atlasCell(2, 2, ATLAS_2) // B2
const ICON_REVOLVER = atlasCell(3, 2, ATLAS_2) // C2
const ICON_RATE = atlasCell(1, 3, ATLAS_2) // A3

// Property icon by catalogue id.
const PROPERTY_ICONS: Record<string, Icon> = {
    wagon: ICON_WAGON,
    cabin: ICON_CABIN,
    house: ICON_HOUSE_HOME,
    ranch: ICON_RANCH
}

// Pick icon by catalogue id. No pick shows the iron one.
const PICK_ICONS: Record<string, Icon> = {
    pick: ICON_PICK_IRON,
    'steel-pick': ICON_PICK_STEEL,
    'miners-pick': ICON_PICK_DIAMOND
}

const SERVER_ONLINE_COLOR = Color4.create(0.3, 0.9, 0.4, 1)
const SERVER_OFFLINE_COLOR = Color4.create(1, 0.3, 0.3, 1)
const SERVER_LABEL_HEIGHT = 28

const hudIcon = (icon: Icon) => (
    <UiEntity
        uiTransform={{ width: HUD_ICON_SIZE, height: HUD_ICON_SIZE, margin: { right: 10 } }}
        uiBackground={iconBackground(icon)}
    />
)

const hudDivider = () => (
    <UiEntity
        uiTransform={{ width: 1, height: HUD_HEIGHT * 0.5, margin: { left: 20, right: 20 } }}
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
/**
 * The small line under a segment's value. Every segment keeps it, empty or not, so the
 * captions and values of all three segments sit at the same height.
 */
const hudUnitLine = (value: string, color: Color4, width?: number) => (
    <Label
        value={value}
        fontSize={HUD_UNIT_SIZE}
        color={color}
        textAlign="middle-center"
        textWrap="nowrap"
        uiTransform={{ width, height: HUD_UNIT_SIZE + 2 }}
    />
)

const hudSegment = (icon: Icon, caption: string, value: string, color: Color4) => (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
        {hudIcon(icon)}
        <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center' }}>
            <BitmapText value={caption} fontSize={HUD_CAPTION_SIZE} color={MUTED_COLOR} />
            <UiEntity uiTransform={{ height: HUD_VALUE_SIZE, flexDirection: 'row', alignItems: 'center' }}>
                <BitmapText value={value} fontSize={HUD_VALUE_SIZE} color={color} />
            </UiEntity>
            {hudUnitLine('', MUTED_COLOR)}
        </UiEntity>
    </UiEntity>
)

/** Ore: a storage bar, the amount on its left end, and a warning under it once it is full. */
const oreSegment = () => {
    const capacity = getCarryCapacity()
    const ore = shownOre()
    const fill = capacity > 0 ? Math.min(1, ore / capacity) : 0
    const full = capacity > 0 && getOre() >= capacity

    return (
        <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
            {hudIcon(ICON_ORE)}
            <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center' }}>
                <BitmapText value="Ore" fontSize={HUD_CAPTION_SIZE} color={MUTED_COLOR} uiTransform={{ margin: { left: ORE_BAR_TEXT_INSET } }} />
                <UiEntity uiTransform={{ height: HUD_VALUE_SIZE, flexDirection: 'row', alignItems: 'center' }}>
                <UiEntity
                    uiTransform={{
                        width: ORE_BAR_WIDTH,
                        height: ORE_BAR_HEIGHT,
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: BANK_GOLD,
                        flexDirection: 'row',
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        padding: { left: ORE_BAR_TEXT_INSET - 2 }
                    }}
                    uiBackground={{ color: ORE_BAR_TRACK }}
                >
                    <UiEntity
                        uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: percent(fill), height: '100%' }}
                        uiBackground={{ color: full ? ORE_BAR_FULL_FILL : ORE_BAR_FILL }}
                    />
                    <BitmapText value={`${ore}`} fontSize={ORE_BAR_VALUE_SIZE} color={ORE_COLOR} />
                </UiEntity>
                </UiEntity>
                {hudUnitLine(full ? 'STORAGE FULL' : '', STORAGE_FULL_COLOR, ORE_BAR_WIDTH)}
            </UiEntity>
        </UiEntity>
    )
}

/** Rate: the town's selling rate, as the bank quotes it. */
const rateSegment = () => {
    const rate = quotedRate(getSyncedRate())
    return (
        <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
            {hudIcon(ICON_RATE)}
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <BitmapText value="Rate" fontSize={HUD_CAPTION_SIZE} color={MUTED_COLOR} />
                <UiEntity uiTransform={{ height: HUD_VALUE_SIZE, flexDirection: 'row', alignItems: 'center' }}>
                    <BitmapText value={formatRate(rate)} fontSize={HUD_VALUE_SIZE} color={rateColor(rate)} />
                </UiEntity>
                {hudUnitLine('ore / coin', MUTED_COLOR)}
            </UiEntity>
        </UiEntity>
    )
}

const hud = () => {

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
                height: HUD_PILL_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 18, right: 22, top: HUD_PADDING_Y, bottom: HUD_PADDING_Y },
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: HUD_BACKGROUND }}
        >
            {oreSegment()}
            {hudDivider()}
            {hudSegment(ICON_COINS, 'Coins', `${shownCoins()}`, COIN_COLOR)}
            {hudDivider()}
            {rateSegment()}
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

// --- Bank ------------------------------------------------------------------------------
//
// Dark wood panels with gold trim, one section per step of the sale: what the town pays, what
// you hold, how much to sell, what you get back, and the button that does it. Big numbers and
// titles use the western font; the small section captions stay as plain labels.
const BANK_WOOD = Color4.create(0.17, 0.11, 0.08, 0.95)
const BANK_WOOD_DARK = Color4.create(0.1, 0.07, 0.04, 0.96)
const BANK_TRIM = Color4.create(0.42, 0.27, 0.12, 1)
const BANK_GOLD = Color4.create(0.88, 0.7, 0.32, 1)
const BANK_GOLD_LIGHT = Color4.create(1, 0.85, 0.48, 1)
const BANK_CREAM = Color4.create(0.96, 0.9, 0.78, 1)
const BANK_CAPTION = Color4.create(0.79, 0.65, 0.42, 1)

// Breathing room between the panel's rows, on top of each section's own 10 px margin.
// The panel's inner margin; the close button sits this far in from the corner too.
const BANK_PANEL_PADDING = 16
const BANK_ROW_GAP = 20
const BANK_BUTTON_GAP = 36
const BANK_HINT = Color4.create(0.86, 0.55, 0.3, 1)
const BANK_INK = Color4.create(0.17, 0.11, 0.08, 1)
const BANK_STEP_COLOR = Color4.create(0.23, 0.16, 0.1, 1)
const RATE_GOOD_COLOR = Color4.create(0.48, 0.83, 0.42, 1)
const RATE_FAIR_COLOR = Color4.create(0.95, 0.75, 0.3, 1)
const RATE_BAD_COLOR = Color4.create(0.9, 0.35, 0.3, 1)

// The chart's scale, in ore per coin. 10 is the rate a quiet town settles at; 12 is about as
// bad as it gets in play, so anything past it pins to the floor rather than squashing the rest.
// The line runs higher the better the rate is for the seller.
const RATE_CHART_BEST = 10
const RATE_CHART_WORST = 12
const RATE_CHART_HEIGHT = 56
const RATE_CHART_PADDING = 6
const RATE_LINE_WIDTH = 2
const RATE_DOT_SIZE = 9

function formatRate(rate: number): string {
    return Number.isInteger(rate) ? `${rate}` : rate.toFixed(1)
}

/** 1 at the best rate, 0 at the worst, clamped. */
function rateQuality(rate: number): number {
    return Math.max(0, Math.min(1, (RATE_CHART_WORST - rate) / (RATE_CHART_WORST - RATE_CHART_BEST)))
}

function mixColor(a: Color4, b: Color4, t: number): Color4 {
    return Color4.create(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1)
}

function rateColor(rate: number): Color4 {
    const quality = rateQuality(rate)
    return quality >= 0.5
        ? mixColor(RATE_FAIR_COLOR, RATE_GOOD_COLOR, (quality - 0.5) * 2)
        : mixColor(RATE_BAD_COLOR, RATE_FAIR_COLOR, quality * 2)
}

/** How far above the plot's floor the line sits at this rate. */
function rateLevel(rate: number): number {
    const inner = RATE_CHART_HEIGHT - RATE_CHART_PADDING * 2
    return rateQuality(rate) * (inner - RATE_LINE_WIDTH)
}

/**
 * How long until the rate is back at the base if nobody sells, at one recovery step per window.
 * An estimate: the client does not know how far into the current window the server is, so it
 * can be up to a minute early.
 */
function recoveryText(rate: number): string {
    const steps = Math.ceil((rate - RATE_BASE) / RATE_RECOVERY_PER_WINDOW - 1e-6)
    if (steps <= 0) return `At equilibrium price (${RATE_BASE})`
    const minutes = Math.ceil((steps * MARKET_WINDOW_SECONDS) / 60)
    return `Back to equilibrium (${RATE_BASE}) in ~${minutes} min`
}

// A plain reading of the rate, so the number does not have to be interpreted: traffic-light
// thirds of the 10–12 range. Judged in whole tenths, the way the rate is quoted, so 10.6 is
// exactly good and never a float's hair over.
const PRICE_GOOD_MAX_TENTHS = 106
const PRICE_FAIR_MAX_TENTHS = 113
const PRICE_GOOD_COLOR = Color4.create(0.42, 0.8, 0.36, 1)
const PRICE_FAIR_COLOR = Color4.create(0.96, 0.82, 0.25, 1)
const PRICE_BAD_COLOR = Color4.create(0.9, 0.33, 0.28, 1)

function priceVerdict(rate: number): { text: string; color: Color4 } {
    const tenths = Math.round(rate * 10)
    if (tenths <= PRICE_GOOD_MAX_TENTHS) return { text: 'GOOD PRICE', color: PRICE_GOOD_COLOR }
    if (tenths <= PRICE_FAIR_MAX_TENTHS) return { text: 'FAIR PRICE', color: PRICE_FAIR_COLOR }
    return { text: 'BAD PRICE', color: PRICE_BAD_COLOR }
}

// A small pill beside the recovery note, under the chart: smaller than the rate itself, coloured so it scans at a glance.
const priceVerdictPill = (rate: number) => {
    const verdict = priceVerdict(rate)
    return (
        <Label
            value={verdict.text}
            fontSize={14}
            color={BANK_INK}
            textAlign="middle-center"
            uiTransform={{ width: 112, height: 24, borderRadius: 12 }}
            uiBackground={{ color: verdict.color }}
        />
    )
}

const percent = (fraction: number): `${number}%` => `${fraction * 100}%`

// The session's rates as a step line, oldest on the left, newest reaching the right edge: a
// flat run per rate and a riser wherever it moved. The UI cannot rotate an entity, so there
// are no diagonals; the steps are what makes the peaks read. With no history yet the line is
// one flat run at the current rate. A dot marks where the price is now.
const rateLine = (history: readonly number[], current: number) => {
    const points = history.length > 0 ? history : [current]
    const slot = 1 / points.length
    const pieces: ReactEcs.JSX.Element[] = []

    points.forEach((rate, i) => {
        pieces.push(
            <UiEntity
                key={`run${i}`}
                uiTransform={{
                    positionType: 'absolute',
                    position: { left: percent(i * slot), bottom: rateLevel(rate) },
                    width: percent(slot),
                    height: RATE_LINE_WIDTH
                }}
                uiBackground={{ color: rateColor(rate) }}
            />
        )
        if (i === 0) return
        const from = rateLevel(points[i - 1])
        const to = rateLevel(rate)
        if (from === to) return
        pieces.push(
            <UiEntity
                key={`rise${i}`}
                uiTransform={{
                    positionType: 'absolute',
                    position: { left: percent(i * slot), bottom: Math.min(from, to) },
                    width: RATE_LINE_WIDTH,
                    height: Math.abs(to - from) + RATE_LINE_WIDTH
                }}
                uiBackground={{ color: rateColor(rate) }}
            />
        )
    })

    const last = points[points.length - 1]
    pieces.push(
        <UiEntity
            key="now"
            uiTransform={{
                positionType: 'absolute',
                position: { right: 0, bottom: rateLevel(last) - (RATE_DOT_SIZE - RATE_LINE_WIDTH) / 2 },
                width: RATE_DOT_SIZE,
                height: RATE_DOT_SIZE,
                borderRadius: RATE_DOT_SIZE / 2
            }}
            uiBackground={{ color: rateColor(last) }}
        />
    )
    return pieces
}

const rateChart = (history: readonly number[], current: number) => (
    <UiEntity uiTransform={{ width: '100%', height: RATE_CHART_HEIGHT, flexDirection: 'row', margin: { top: 8 } }}>
        <UiEntity uiTransform={{ width: 32, height: '100%', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Label value={`${RATE_CHART_BEST}`} fontSize={13} color={BANK_CAPTION} textAlign="top-left" uiTransform={{ height: 18 }} />
            <Label value={`${RATE_CHART_WORST}`} fontSize={13} color={BANK_CAPTION} textAlign="bottom-left" uiTransform={{ height: 18 }} />
        </UiEntity>
        <UiEntity
            uiTransform={{
                flexGrow: 1,
                height: '100%',
                padding: RATE_CHART_PADDING,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            {/* The line's pieces are absolute, so they get a box of their own: offsets then
                count from the inside of the padding, not from the frame's edge. */}
            <UiEntity uiTransform={{ width: '100%', height: '100%', positionType: 'relative' }}>
                {rateLine(history, current)}
            </UiEntity>
        </UiEntity>
    </UiEntity>
)

const bankIcon = (icon: Icon, size: number) => (
    <UiEntity
        uiTransform={{ width: size, height: size, flexShrink: 0, margin: { right: 12 } }}
        uiBackground={iconBackground(icon)}
    />
)

// Two sections can be joined into one box: `joined` names which half this one is. The corners
// where they meet go square, and the left half drops its right border so the seam is one
// line, not two side by side.
function sectionEdges(joined?: 'left' | 'right') {
    const r = PANEL_RADIUS
    return {
        borderColor: BANK_TRIM,
        borderWidth: joined === 'left' ? { top: 2, bottom: 2, left: 2, right: 0 } : 2,
        borderRadius:
            joined === 'left'
                ? { topLeft: r, bottomLeft: r, topRight: 0, bottomRight: 0 }
                : joined === 'right'
                  ? { topLeft: 0, bottomLeft: 0, topRight: r, bottomRight: r }
                  : r
    }
}

// A section spans the panel unless given a width; `grow` lets one share a row with another.
const bankSection = (
    caption: string,
    children: ReactEcs.JSX.Element | (ReactEcs.JSX.Element | null)[],
    layout: { width?: number | `${number}%`; grow?: number; marginRight?: number; joined?: 'left' | 'right' } = {}
) => (
    <UiEntity
        uiTransform={{
            width: layout.width ?? '100%',
            flexGrow: layout.grow ?? 0,
            flexShrink: layout.grow ?? 0,
            flexDirection: 'column',
            padding: { left: 18, right: 18, top: 10, bottom: 14 },
            margin: { top: 10, right: layout.marginRight ?? 0 },
            ...sectionEdges(layout.joined)
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <Label value={caption} fontSize={16} color={BANK_CAPTION} textAlign="middle-left" uiTransform={{ height: 22 }} />
        {children}
    </UiEntity>
)

// The two side boxes read as sentences with their caption: "You have / 3 ore", "You receive /
// 10 coins". The number is the big thing; its unit sits under it, since a 200 px box has no
// room for "126 COINS" on one line at that size.
const bankAmount = (icon: Icon, value: number, unit: string, color: Color4) => (
    <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center' }}>
        {bankIcon(icon, 48)}
        <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <BitmapText value={`${value}`} fontSize={46} color={color} />
            <UiEntity uiTransform={{ margin: { top: 2 } }}>
                <BitmapText value={unit} fontSize={26} color={color} />
            </UiEntity>
        </UiEntity>
    </UiEntity>
)

const bankButton = (
    label: string,
    onClick: () => void,
    transform: { width: number | `${number}%`; height: number },
    fontSize: number,
    background: Color4,
    textColor: Color4
) => (
    <UiEntity
        uiTransform={{
            ...transform,
            flexShrink: 0,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: background }}
        onMouseDown={onClick}
    >
        <BitmapText value={label} fontSize={fontSize} color={textColor} align="center" />
    </UiEntity>
)

const bankPanel = () => {
    const ore = getOre()
    // The selection is counted in coins, so the ore shown is always the ore that converts.
    const payout = getSellCoins()
    const amount = getSellAmount()
    // The rate as sales are priced, to one decimal; it doubles as the minimum to sell.
    const rate = quotedRate(getSyncedRate())
    const canSell = payout > 0

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                minWidth: PANEL_MIN_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: 96,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                {bankIcon(ICON_BANK, 72)}
                <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
                    <BitmapText value="THE BANK" fontSize={60} color={BANK_GOLD_LIGHT} />
                    <Label value="Sell Ore for Coins" fontSize={18} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ height: 24 }} />
                </UiEntity>
            </UiEntity>

            {/* Your ore on the left, the town's rate beside it: both stretch to the taller one. */}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: BANK_ROW_GAP } }}>
                {bankSection(
                    'YOU HAVE',
                    bankAmount(ICON_ORE, ore, 'ORE', BANK_CREAM),
                    { width: 200, joined: 'left' }
                )}

                {bankSection(
                    'TOWN RATE',
                    [
                        <UiEntity key="rate" uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center' }}>
                            <BitmapText value={`${formatRate(rate)} ORE = 1 COIN`} fontSize={34} color={BANK_CREAM} />
                        </UiEntity>,
                        <UiEntity key="chart" uiTransform={{ width: '100%' }}>
                            {rateChart(getRateHistory(), rate)}
                        </UiEntity>,
                        <UiEntity key="recovery" uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', margin: { top: 6 } }}>
                            {priceVerdictPill(rate)}
                            <Label
                                value={recoveryText(rate)}
                                fontSize={14}
                                color={BANK_CAPTION}
                                textAlign="middle-left"
                                uiTransform={{ flexGrow: 1, height: 24, margin: { left: 10 } }}
                            />
                        </UiEntity>
                    ],
                    { width: 0, grow: 1, joined: 'right' }
                )}
            </UiEntity>

            {/* What the sale pays on the left, the amount picker beside it, like the row above. */}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: BANK_ROW_GAP } }}>
                {bankSection(
                    'YOU RECEIVE',
                    bankAmount(ICON_COINS, payout, payout === 1 ? 'COIN' : 'COINS', COIN_COLOR),
                    { width: 200, joined: 'left' }
                )}

                {bankSection(
                    'SELL AMOUNT',
                    [
                        <UiEntity key="step" uiTransform={{ width: '100%', height: 64, flexDirection: 'row', alignItems: 'center' }}>
                            {bankButton('-10', () => changeSellCoins(-1), { width: 96, height: 60 }, 36, BANK_STEP_COLOR, BANK_CREAM)}
                            <UiEntity
                                uiTransform={{
                                    flexGrow: 1,
                                    height: 60,
                                    margin: { left: 12, right: 12 },
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    borderRadius: 10,
                                    borderWidth: 2,
                                    borderColor: BANK_TRIM
                                }}
                                uiBackground={{ color: BANK_WOOD_DARK }}
                            >
                                <BitmapText value={`${amount} ORE`} fontSize={42} color={BANK_GOLD_LIGHT} align="center" />
                            </UiEntity>
                            {bankButton('+10', () => changeSellCoins(1), { width: 96, height: 60 }, 36, BANK_STEP_COLOR, BANK_CREAM)}
                        </UiEntity>,
                        // The one place the minimum is stated: under the amount, quiet, always there.
                        <Label
                            key="minimum"
                            value={`Minimum: ${formatRate(rate)} Ore`}
                            fontSize={15}
                            color={BANK_HINT}
                            textAlign="middle-center"
                            uiTransform={{ width: '100%', height: 20, margin: { top: 4 } }}
                        />,
                        <UiEntity key="quick" uiTransform={{ width: '100%', height: 52, flexDirection: 'row', justifyContent: 'space-between', margin: { top: 6 } }}>
                            {bankButton('HALF', () => setSellCoins(Math.floor(maxSellCoins() / 2)), { width: '48%', height: 50 }, 30, BANK_STEP_COLOR, BANK_CREAM)}
                            {bankButton('MAX', () => setSellCoins(maxSellCoins()), { width: '48%', height: 50 }, 30, BANK_STEP_COLOR, BANK_CREAM)}
                        </UiEntity>
                    ],
                    { width: 0, grow: 1, joined: 'right' }
                )}
            </UiEntity>

            <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} />
            {bankButton(
                canSell ? `SELL ${amount} ORE` : 'SELL',
                canSell ? sellSelectedOre : () => {},
                { width: '100%', height: 72 },
                44,
                canSell ? BANK_GOLD : DISABLED_COLOR,
                canSell ? BANK_INK : MUTED_COLOR
            )}
            {/* Last, so it draws over the header. Inset from the corner by the panel's padding,
                so it lines up with the sections' sides below, with the panel's own corner radius. */}
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{
                    positionType: 'absolute',
                    position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING },
                    width: 48,
                    height: 48,
                    borderRadius: PANEL_RADIUS
                }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={closeBankPanel}
            />
        </UiEntity>
    )
}

const TILE_COLOR = Color4.create(0.16, 0.16, 0.18, 1)
const TILE_SELECTED_COLOR = Color4.create(0.28, 0.1, 0.24, 1)
const TILE_BORDER_COLOR = Color4.create(0.32, 0.32, 0.34, 1)
const TILE_WIDTH = 220
const TILE_HEIGHT = 88

// --- General Store -----------------------------------------------------------------------
//
// Select a product, inspect it, buy or equip it. A list of compact cards on the left; the
// selected one opens in a large detail panel on the right with its price, what it does, and
// one action button. Same wood-and-gold dress as the bank.
//
// Housing is not sold here: it belongs to the Land Office.

const STORE_LIST_WIDTH = 270
const STORE_CARD_HEIGHT = 60
const STORE_CARD_GAP = 6
const STORE_CARD_ICON = 42
const STORE_DETAIL_ICON = 130
const STORE_ACTION_HEIGHT = 64
const SHORT_COLOR = Color4.create(0.9, 0.45, 0.4, 1)
const EQUIPPED_COLOR = Color4.create(0.42, 0.52, 0.24, 1)
const EQUIPPED_TEXT = Color4.create(0.88, 0.95, 0.75, 1)
const COMING_SOON_TINT = Color4.create(1, 1, 1, 0.35)

/** Gallons in the tank, worked out from the autonomy the server reports: hours × rigs ÷ 24. */
function fuelGallonsNow(): number {
    return (getMuleFuelHours() * getMuleCount()) / 24
}

/** Why the buy button for this item is off, or null when it can be pressed. */
function buyBlocker(item: ShopItem): string | null {
    if (item.line === 'fuel') {
        // Priced by the same rule the server charges with, against what is in the tank now.
        const order = fuelOrder(item, getMuleCount(), fuelGallonsNow())
        if ('reason' in order) return order.reason
        return getCoins() < order.price ? 'Not enough coins' : null
    }
    const reason = whyUnavailable(item)
    if (reason !== null) return reason
    const price = currentPrice(item)
    if (price !== null && getCoins() < price) return 'Not enough coins'
    return null
}

/** 1000 → "1,000". */
function withCommas(value: number): string {
    return `${Math.round(value)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// What the detail panel says about each pick, beyond the catalogue's numbers.
const PICK_COPY: Record<string, { description: string; benefits: string[] }> = {
    pick: { description: 'A borrowed pick. It gets the job done.', benefits: ['Free starting tool', 'Mines every rock'] },
    'steel-pick': { description: 'Better hits. Faster mining.', benefits: ['Faster mining', 'Better hits'] },
    'miners-pick': { description: 'The finest pick in the territory.', benefits: ['Fastest mining', 'Strongest hits', 'Brightest sparks'] }
}

// --- Products ---

type ProductKey = ShopItemId | 'fuel' | 'storage' | 'horse' | 'revolver'

type Status = { text: string; color: Color4 }

type Product = {
    key: ProductKey
    title: string
    icon: Icon
    /** The card's second line: a price, or a short hint. */
    hint: string
    status: Status | null
    muted: boolean
}

const STATUS_EQUIPPED: Status = { text: 'Equipped', color: PRICE_GOOD_COLOR }
const STATUS_LOCKED: Status = { text: 'Locked', color: MUTED_COLOR }
const STATUS_BUY: Status = { text: 'Buy', color: BANK_GOLD_LIGHT }
const STATUS_SOON: Status = { text: 'Coming Soon', color: MUTED_COLOR }

function ownedStatus(count: number): Status {
    return { text: count > 1 ? `Owned x${count}` : 'Owned', color: BANK_CREAM }
}

function pickStatus(item: ShopItem): Status {
    const owned = (id: ShopItemId) => getOwned(id)
    if (getOwned(item.id) > 0) return activePick(owned, getEquipped())?.id === item.id ? STATUS_EQUIPPED : ownedStatus(1)
    return whyUnavailable(item) === null ? STATUS_BUY : STATUS_LOCKED
}

function storeProducts(): Product[] {
    const mules = getMuleCount()
    const picks: Product[] = PICKS.map((pick) => ({
        key: pick.id,
        title: pick.label,
        icon: PICK_ICONS[pick.id] ?? ICON_PICK_IRON,
        hint: pick.price > 0 ? `${pick.price} Coins` : 'Free',
        status: pickStatus(pick),
        muted: false
    }))
    const mule = itemsOf('mule')[0]
    return [
        ...picks,
        {
            key: 'mule',
            title: mule.label,
            icon: ICON_MULE,
            hint: `${mule.price} Coins`,
            status: mules > 0 ? ownedStatus(mules) : STATUS_BUY,
            muted: false
        },
        { key: 'fuel', title: 'Fuel', icon: ICON_FUEL, hint: `${FUEL_PRICE_PER_GALLON} Coins / Gallon`, status: mules > 0 ? null : STATUS_LOCKED, muted: false },
        { key: 'storage', title: 'Storage', icon: ICON_WAREHOUSE, hint: `${withCommas(getCarryCapacity())} Ore`, status: null, muted: false },
        { key: 'horse', title: 'Horse', icon: ICON_HORSE, hint: '', status: STATUS_SOON, muted: true },
        { key: 'revolver', title: 'Revolver', icon: ICON_REVOLVER, hint: '', status: STATUS_SOON, muted: true }
    ]
}

/** The selected product, or the pick in use when nothing has been picked yet this visit. */
function selectedProductKey(): ProductKey {
    const chosen = getSelectedProduct()
    if (chosen !== null) return chosen as ProductKey
    return activePick((id) => getOwned(id), getEquipped())?.id ?? 'pick'
}

const storeCard = (product: Product, selected: boolean, onSelect: (key: string) => void = selectProduct) => (
    <UiEntity
        key={product.key}
        uiTransform={{
            width: '100%',
            height: STORE_CARD_HEIGHT,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 10, right: 10 },
            margin: { bottom: STORE_CARD_GAP },
            borderRadius: 10,
            borderWidth: selected ? 3 : 2,
            borderColor: selected ? BANK_GOLD : BANK_TRIM
        }}
        uiBackground={{ color: selected ? BANK_TRIM : BANK_WOOD }}
        onMouseDown={() => onSelect(product.key)}
    >
        <UiEntity
            uiTransform={{ width: STORE_CARD_ICON, height: STORE_CARD_ICON, margin: { right: 10 }, flexShrink: 0 }}
            uiBackground={iconBackground(product.icon, product.muted ? COMING_SOON_TINT : undefined)}
        />
        <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
            <BitmapText value={product.title.toUpperCase()} fontSize={19} color={product.muted ? MUTED_COLOR : BANK_CREAM} />
            <UiEntity uiTransform={{ flexDirection: 'row', height: 18, margin: { top: 2 } }}>
                {product.hint !== '' ? (
                    <Label value={product.hint} fontSize={13} color={product.muted ? MUTED_COLOR : COIN_COLOR} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 18, margin: { right: 8 } }} />
                ) : null}
                {product.status !== null ? (
                    <Label value={product.status.text} fontSize={13} color={product.status.color} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 18 }} />
                ) : null}
            </UiEntity>
        </UiEntity>
    </UiEntity>
)

// --- Detail panel ---

type Action = { label: string; kind: 'buy' | 'equip' | 'equipped' | 'off'; onClick?: () => void }

const storeActionButton = (action: Action) => {
    const live = action.kind === 'buy' || action.kind === 'equip'
    const background = action.kind === 'equipped' ? EQUIPPED_COLOR : live ? BANK_GOLD : DISABLED_COLOR
    const text = action.kind === 'equipped' ? EQUIPPED_TEXT : live ? BANK_INK : MUTED_COLOR
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: STORE_ACTION_HEIGHT,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                margin: { top: 12 },
                borderRadius: 10,
                borderWidth: 2,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: background }}
            onMouseDown={() => {
                if (live) action.onClick?.()
            }}
        >
            {action.kind === 'equipped' ? (
                <Label value="✓" fontSize={34} color={text} textAlign="middle-center" uiTransform={{ width: 40, height: STORE_ACTION_HEIGHT }} />
            ) : null}
            <BitmapText value={action.label} fontSize={38} color={text} />
            {/* An empty twin of the tick on the other side, so the label itself is what is centred. */}
            {action.kind === 'equipped' ? <UiEntity uiTransform={{ width: 40, height: STORE_ACTION_HEIGHT }} /> : null}
        </UiEntity>
    )
}

const detailStat = (caption: string, value: string, color: Color4) => (
    <UiEntity key={caption} uiTransform={{ flexDirection: 'column', margin: { bottom: 10 } }}>
        <Label value={caption} fontSize={14} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 20 }} />
        <BitmapText value={value} fontSize={26} color={color} />
    </UiEntity>
)

const detailNote = (text: string, color: Color4 = BANK_CREAM) => (
    <Label key={text} value={text} fontSize={16} color={color} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 24 }} />
)

/** A price with the coin icon in front of it — never "c", which reads as cents. */
const coinAmount = (amount: number, color: Color4, size: number) => (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
        <UiEntity
            uiTransform={{ width: size, height: size, margin: { right: 6 }, flexShrink: 0 }}
            uiBackground={iconBackground(ICON_COINS)}
        />
        <BitmapText value={withCommas(amount)} fontSize={size} color={color} />
    </UiEntity>
)

/** Price as a stat: gold when it can be paid, red when it cannot — but always shown. */
function priceStat(price: number | null, label: string = 'Price'): ReactEcs.JSX.Element {
    if (price === null) return detailStat(label, '-', MUTED_COLOR)
    if (price === 0) return detailStat(label, 'FREE', COIN_COLOR)
    return (
        <UiEntity key={label} uiTransform={{ flexDirection: 'column', margin: { bottom: 10 } }}>
            <Label value={label} fontSize={14} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 20 }} />
            {coinAmount(price, getCoins() >= price ? COIN_COLOR : SHORT_COLOR, 28)}
        </UiEntity>
    )
}

/** The buy action for an item: live when it can be bought, off (price still shown above) when not. */
function buyAction(item: ShopItem): Action {
    const why = whyUnavailable(item)
    if (why !== null) return { label: 'LOCKED', kind: 'off' }
    return { label: 'BUY', kind: buyBlocker(item) === null ? 'buy' : 'off', onClick: () => buyItem(item.id) }
}

/** The pieces of one product's detail: what it is, its numbers, and what you can do. */
type Detail = { title: string; description: string; icon: Icon; stats: ReactEcs.JSX.Element[]; notes: ReactEcs.JSX.Element[]; actions: ReactEcs.JSX.Element[] }

function pickDetail(item: ShopItem): Detail {
    const copy = PICK_COPY[item.id]
    const status = pickStatus(item)
    let action: Action
    if (status === STATUS_EQUIPPED) action = { label: 'EQUIPPED', kind: 'equipped' }
    else if (getOwned(item.id) > 0) action = { label: 'EQUIP', kind: 'equip', onClick: () => sendEquip(item.id) }
    else if (item.starter === true) action = { label: 'LOCKED', kind: 'off' }
    else action = buyAction(item)

    const notes = copy.benefits.map((benefit) => detailNote(`• ${benefit}`))
    if (getOwned(item.id) <= 0 && item.starter === true) notes.push(detailNote('Free from the Mayor', BANK_CAPTION))
    else if (getOwned(item.id) <= 0 && item.requires !== undefined && getOwned(item.requires) <= 0) {
        notes.push(detailNote(`Requires ${findItem(item.requires)?.label ?? ''}`, SHORT_COLOR))
    }
    return {
        title: item.label,
        description: copy.description,
        icon: PICK_ICONS[item.id] ?? ICON_PICK_IRON,
        stats: [priceStat(item.price), detailStat('Breaks a rock in', `${item.hitsPerRock} HITS`, BANK_CREAM)],
        notes,
        actions: [storeActionButton(action)]
    }
}

function muleDetail(): Detail {
    const mule = itemsOf('mule')[0]
    const mules = getMuleCount()
    return {
        title: mule.label,
        description: 'Digs ore for you, even while you are away.',
        icon: ICON_MULE,
        stats: [priceStat(mule.price), detailStat('Produces', '200 ORE/DAY', BANK_CREAM)],
        notes: [
            detailNote('• Digs straight into your storage'),
            detailNote('• Requires fuel'),
            detailNote(mules > 0 ? `You own ${mules}` : 'You own none yet', BANK_CAPTION)
        ],
        actions: [storeActionButton(buyAction(mule))]
    }
}

// One fuel order: what it adds, what it costs (coin icon, never "c"), and its button.
const fuelOption = (item: ShopItem) => {
    const order = fuelOrder(item, getMuleCount(), fuelGallonsNow())
    const blocker = buyBlocker(item)
    const live = blocker === null
    return (
        <UiEntity
            key={item.id}
            uiTransform={{
                width: '100%',
                height: 50,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 14, right: 6 },
                margin: { top: 8 },
                borderRadius: 10,
                borderWidth: 2,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD }}
        >
            <BitmapText value={item.label.toUpperCase()} fontSize={24} color={BANK_CREAM} uiTransform={{ width: 170 }} />
            {/* An order the tank cannot take keeps its price, muted, and its button goes grey:
                that says enough without a warning line. */}
            <UiEntity uiTransform={{ flexGrow: 1 }}>
                {'price' in order
                    ? coinAmount(order.price, getCoins() >= order.price ? COIN_COLOR : SHORT_COLOR, 24)
                    : coinAmount(item.price, MUTED_COLOR, 24)}
            </UiEntity>
            <UiEntity
                uiTransform={{ width: 90, height: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 8 }}
                uiBackground={{ color: live ? BANK_GOLD : DISABLED_COLOR }}
                onMouseDown={() => {
                    if (live) buyItem(item.id)
                }}
            >
                <BitmapText value="BUY" fontSize={22} color={live ? BANK_INK : MUTED_COLOR} />
            </UiEntity>
        </UiEntity>
    )
}

// The store sells fuel as a resource: gallons and their price. How long they keep the rigs
// running is the M.U.L.E. panel's business.
function fuelDetail(): Detail {
    const mules = getMuleCount()
    const description = 'Keeps your M.U.L.E.s running.'
    if (mules <= 0) {
        return {
            title: 'Fuel',
            description,
            icon: ICON_FUEL,
            stats: [detailStat('Price', `${FUEL_PRICE_PER_GALLON} COINS / GALLON`, BANK_CREAM)],
            notes: [detailNote('Requires a M.U.L.E.', SHORT_COLOR)],
            actions: [storeActionButton({ label: 'LOCKED', kind: 'off' })]
        }
    }
    return {
        title: 'Fuel',
        description,
        icon: ICON_FUEL,
        stats: [
            detailStat('Price', `${FUEL_PRICE_PER_GALLON} COINS / GALLON`, BANK_CREAM),
            detailStat('In your tank', `${Math.floor(fuelGallonsNow())} / ${fuelTankGallons(mules)} GALLONS`, BANK_CREAM)
        ],
        notes: [detailNote('1 Gallon runs 1 M.U.L.E. for 1 day', BANK_CAPTION)],
        actions: itemsOf('fuel').map(fuelOption)
    }
}

function storageDetail(): Detail {
    const next = nextTier('storage', (id) => getOwned(id))
    const stats = [detailStat('Current capacity', `${withCommas(getCarryCapacity())} ORE`, BANK_CREAM)]
    if (next !== null) stats.push(detailStat('Next upgrade', `${withCommas(next.storage ?? 0)} ORE`, BANK_CREAM), priceStat(next.price))
    return {
        title: next?.label ?? 'Storage',
        description: 'How much ore you can hold.',
        icon: ICON_WAREHOUSE,
        stats,
        notes: [detailNote(`Stored now: ${withCommas(getOre())} Ore`, BANK_CAPTION)],
        actions: [storeActionButton(next === null ? { label: 'MAX CAPACITY', kind: 'off' } : buyAction(next))]
    }
}

function comingSoonDetail(title: string, icon: Icon): Detail {
    return {
        title,
        description: 'On its way to the store.',
        icon,
        stats: [],
        notes: [],
        actions: [storeActionButton({ label: 'COMING SOON', kind: 'off' })]
    }
}

function detailFor(key: ProductKey): Detail {
    if (key === 'mule') return muleDetail()
    if (key === 'fuel') return fuelDetail()
    if (key === 'storage') return storageDetail()
    if (key === 'horse') return comingSoonDetail('Horse', ICON_HORSE)
    if (key === 'revolver') return comingSoonDetail('Revolver', ICON_REVOLVER)
    const pick = findItem(key as ShopItemId)
    return pick !== null && pick.line === 'pick' ? pickDetail(pick) : pickDetail(PICKS[0])
}

const storeDetail = (detail: Detail) => (
    <UiEntity
        uiTransform={{
            flexGrow: 1,
            width: 0,
            flexDirection: 'column',
            padding: 18,
            margin: { left: 12 },
            borderRadius: PANEL_RADIUS,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <BitmapText value={detail.title.toUpperCase()} fontSize={40} color={BANK_GOLD_LIGHT} />
        <Label value={detail.description} fontSize={16} color={BANK_CAPTION} textAlign="middle-left" uiTransform={{ height: 26 }} />
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: 12 } }}>
            <UiEntity
                uiTransform={{ width: STORE_DETAIL_ICON, height: STORE_DETAIL_ICON, margin: { right: 18 }, flexShrink: 0 }}
                uiBackground={iconBackground(detail.icon)}
            />
            <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column' }}>{detail.stats}</UiEntity>
        </UiEntity>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: 6 } }}>{detail.notes}</UiEntity>
        {/* The action sits at the bottom, however much the product above has to say. */}
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        {detail.actions}
    </UiEntity>
)

const storePanel = () => {
    const key = selectedProductKey()
    return counterPanel('GENERAL STORE', closeStorePanel, storeProducts(), key, selectProduct, detailFor(key))
}

/** The frame the store and the Land Office share: title, purse, close, cards on the left, detail on the right. */
const counterPanel = (title: string, onClose: () => void, products: Product[], key: string, onSelect: (key: string) => void, detail: Detail) => {
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                minWidth: PANEL_MIN_WIDTH,
                // On mobile, the full screen height, inset top and bottom by the same margin as the
                // HUD: the 720-high screen has no room to spare. On desktop it fits its contents.
                ...(isMobile() ? { flexGrow: 1, margin: { top: HUD_MARGIN, bottom: HUD_MARGIN } } : {}),
                flexDirection: 'column',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            {/* Title centred with the purse under it; the close button sits apart in the corner. */}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center', margin: { bottom: 12 } }}>
                <BitmapText value={title} fontSize={40} color={BANK_GOLD_LIGHT} />
                <UiEntity
                    uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center', flexShrink: 0, padding: { left: 8, right: 14 }, margin: { top: 6 }, borderRadius: 22 }}
                    uiBackground={{ color: BANK_WOOD }}
                >
                    <UiEntity uiTransform={{ width: 34, height: 34, margin: { right: 8 } }} uiBackground={iconBackground(ICON_COINS)} />
                    <BitmapText value={`${withCommas(getCoins())} COINS`} fontSize={26} color={COIN_COLOR} />
                </UiEntity>
                <Button
                    value="X"
                    fontSize={30}
                    color={Color4.White()}
                    uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                    uiBackground={{ color: MAP_CLOSE_COLOR }}
                    onMouseDown={onClose}
                />
            </UiEntity>

            {/* On mobile, fills what the header leaves, so the detail's action sits at the bottom of the screen. */}
            <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row' }}>
                <UiEntity uiTransform={{ width: STORE_LIST_WIDTH, flexShrink: 0, flexDirection: 'column' }}>
                    {products.map((product) => storeCard(product, product.key === key, onSelect))}
                </UiEntity>
                {storeDetail(detail)}
            </UiEntity>
        </UiEntity>
    )
}

// --- Land & Claim Office ----------------------------------------------------------------
//
// The store's layout and dress, selling housing: Wagon → Cabin → House → Ranch. Each one is
// owned once; the Wagon is every player's from the start. Ownership only — nothing is placed
// in the world yet.
//
// The best property owned is the Active one, the home lived in, tagged green like an equipped
// pick; the ones before it stay owned, as Previous.

const STATUS_ACTIVE: Status = { text: 'Active', color: PRICE_GOOD_COLOR }
const STATUS_PREVIOUS: Status = { text: 'Previous', color: MUTED_COLOR }

/** The home the player lives in: the best property owned. */
function activeHome(): ShopItem | null {
    return ownedTier('housing', (id) => getOwned(id))
}

function propertyStatus(item: ShopItem): Status {
    if (item.id === activeHome()?.id) return STATUS_ACTIVE
    if (getOwned(item.id) > 0) return STATUS_PREVIOUS
    return whyUnavailable(item) === null ? STATUS_BUY : STATUS_LOCKED
}

function landOfficeProducts(): Product[] {
    return itemsOf('housing').map((item) => ({
        key: item.id,
        title: item.label,
        icon: PROPERTY_ICONS[item.id] ?? ICON_WAGON,
        hint: item.price > 0 ? `${withCommas(item.price)} Coins` : 'Free',
        status: propertyStatus(item),
        muted: false
    }))
}

/** The selected property, or the next one to get when nothing has been picked this visit. */
function selectedPropertyKey(): ShopItemId {
    const housing = itemsOf('housing')
    const chosen = housing.find((item) => item.id === getSelectedProperty())
    if (chosen !== undefined) return chosen.id
    return (housing.find((item) => getOwned(item.id) <= 0) ?? housing[housing.length - 1]).id
}

function propertyDetail(item: ShopItem): Detail {
    const owned = getOwned(item.id) > 0
    const active = item.id === activeHome()?.id
    let action: Action
    if (active) action = { label: 'ACTIVE', kind: 'equipped' }
    else if (owned) action = { label: 'PREVIOUS', kind: 'off' }
    else action = buyAction(item)

    const notes: ReactEcs.JSX.Element[] = []
    if (active) notes.push(detailNote('Your current home', PRICE_GOOD_COLOR))
    else if (owned) notes.push(detailNote('You moved up from here', BANK_CAPTION))
    else if (item.requires !== undefined && getOwned(item.requires) <= 0) notes.push(detailNote(`Requires ${findItem(item.requires)?.label ?? ''}`, SHORT_COLOR))
    return {
        title: item.label,
        description: item.benefit,
        icon: PROPERTY_ICONS[item.id] ?? ICON_WAGON,
        stats: [priceStat(item.price)],
        notes,
        actions: [storeActionButton(action)]
    }
}

const landOfficePanel = () => {
    const key = selectedPropertyKey()
    return counterPanel('LAND & CLAIM OFFICE', closeLandOfficePanel, landOfficeProducts(), key, selectProperty, propertyDetail(findItem(key)!))
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
        <UiEntity uiTransform={{ margin: { top: 8 } }}>
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

// --- Debug: free coins and ore -------------------------------------------------------
//
// Small buttons at the bottom-left of the column, each opening an amount field. Each is only
// drawn while its flag is on; the server checks the same flag, so hiding it is not the only guard.

type DebugGrant = 'coins' | 'ore'

let debugOpen: DebugGrant | null = null
let debugAmount = ''

function submitDebugGrant() {
    const amount = Math.floor(Number(debugAmount))
    if (!(amount > 0)) return
    if (debugOpen === 'coins') sendDebugCoins(amount)
    if (debugOpen === 'ore') sendDebugOre(amount)
    debugAmount = ''
    debugOpen = null
}

const debugGrantTool = (grant: DebugGrant, label: string) => (
    <UiEntity
        uiTransform={{
            flexDirection: 'row',
            alignItems: 'center',
            margin: { top: 8 }
        }}
    >
        <Button
            value={debugOpen === grant ? 'Close' : label}
            fontSize={16}
            color={Color4.White()}
            uiTransform={{ width: 150, height: 40, borderRadius: 8 }}
            uiBackground={{ color: STEP_BUTTON_COLOR }}
            onMouseDown={() => {
                // Switching tools starts the field over: an amount typed for coins is not meant as ore.
                if (debugOpen !== grant) debugAmount = ''
                debugOpen = debugOpen === grant ? null : grant
            }}
        />
        {debugOpen === grant ? (
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
                        submitDebugGrant()
                    }}
                />
                <Button
                    value="Add"
                    fontSize={18}
                    color={Color4.White()}
                    uiTransform={{ width: 70, height: 40, margin: { left: 8 }, borderRadius: 8 }}
                    uiBackground={{ color: MAGENTA }}
                    onMouseDown={submitDebugGrant}
                />
            </UiEntity>
        ) : null}
    </UiEntity>
)

// --- Debug box --------------------------------------------------------------------------
//
// One labelled panel on the left edge of the screen that groups every debug tool, so they read
// as a set and not as stray game buttons. It sits just under the HUD, away from the objective
// tracker on the right, and always shows every tool.

const DEBUG_BOX_TOP = HUD_MARGIN + HUD_PILL_HEIGHT + 40
/** Clears the Explorer's own button bar on the left edge of the screen. */
const DEBUG_BOX_LEFT = 80

const debugBox = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: DEBUG_BOX_TOP, left: DEBUG_BOX_LEFT },
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: 10,
            borderRadius: 10
        }}
        uiBackground={{ color: PANEL_BACKGROUND }}
    >
        <Label value="DEBUG PANEL" fontSize={14} color={MUTED_COLOR} uiTransform={{ height: 18 }} />
        {DEBUG_RESET_PROGRESS ? debugResetTool() : null}
        {DEBUG_ADD_COINS ? debugGrantTool('coins', 'Free coins') : null}
        {DEBUG_ADD_ORE ? debugGrantTool('ore', 'Free ore') : null}
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
const MINING_PANEL_TOP = HUD_MARGIN + HUD_PILL_HEIGHT + 10
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
                    borderRadius: PANEL_RADIUS,
                    borderWidth: 2,
                    borderColor: MINING_FILL_COLOR
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
    if (getMuleCount() <= 0) return 'no M.U.L.E.'
    if (hours <= 0) return 'empty'
    if (hours < 1) return `${Math.ceil(hours * 60)} min`
    if (hours < 24) return `${Math.floor(hours)}h`
    return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`
}

/** What the rigs are doing right now, by the same rules the server settles them with. */
function muleStatus(): { running: boolean; reason: string } {
    if (getMuleFuelHours() <= 0) return { running: false, reason: 'No fuel' }
    if (getOre() >= getCarryCapacity()) return { running: false, reason: 'Storage full' }
    return { running: true, reason: '' }
}

// --- M.U.L.E. panel -------------------------------------------------------------------------
//
// At your own rig. Three columns side by side, one question each, and nothing shown in two:
//
//   Fleet     what is my fleet doing?
//   Fuel      how much fuel do I have left?
//   Storage   how much ore have I stored, and when it stops for lack of room
//
// Same wood-and-gold dress as the bank and the store. Nothing is bought here: fuel and storage
// come from the General Store, which a line under the columns points to. The rigs dig straight
// into storage, so there is nothing to collect either.

const MULE_HEADER_HEIGHT = 52
const MULE_COLUMN_GAP = 10
const MULE_BAR_HEIGHT = 16
const MULE_BAR_TRACK = Color4.create(0.12, 0.1, 0.06, 1)

// Under this share of the tank the fuel turns red and blinks, so a nearly dry rig is noticed.
const FUEL_LOW_SHARE = 0.1
const FUEL_BLINK_SECONDS = 0.5

/** "3d 9h", "21h", "40 min" — however long, in the units that read best. */
function durationText(hours: number): string {
    if (hours < 1) return `${Math.max(1, Math.ceil(hours * 60))} min`
    if (hours < 24) return `${Math.floor(hours)}h`
    return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`
}

type MuleStat = {
    caption: string
    value: string
    unit?: string
    color?: Color4
    note?: string
    /** A status dot before the value; `pulse` breathes it while the thing is active. */
    dot?: { color: Color4; pulse: boolean }
}

// The status dot. While running it breathes slowly — a touch bigger and fainter, then back —
// so the fleet reads as alive without pulling the eye. It sits in a fixed box, so the pulse
// never nudges the word next to it.
const STATUS_DOT_SIZE = 12
const STATUS_DOT_GROWTH = 5
const STATUS_DOT_FADE = 0.5
const STATUS_DOT_BOX = STATUS_DOT_SIZE + STATUS_DOT_GROWTH
const STATUS_PULSE_SECONDS = 1.4

const statusDot = (dot: { color: Color4; pulse: boolean }) => {
    // 0 → 1 → 0 over one loop, eased by the cosine so it never snaps.
    const phase = dot.pulse ? 0.5 - 0.5 * Math.cos(((uiClock % STATUS_PULSE_SECONDS) / STATUS_PULSE_SECONDS) * 2 * Math.PI) : 0
    const size = STATUS_DOT_SIZE + STATUS_DOT_GROWTH * phase
    const color = Color4.create(dot.color.r, dot.color.g, dot.color.b, 1 - STATUS_DOT_FADE * phase)
    return (
        <UiEntity
            uiTransform={{ width: STATUS_DOT_BOX, height: STATUS_DOT_BOX, margin: { right: 8, bottom: 2 }, justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}
        >
            <UiEntity uiTransform={{ width: size, height: size, borderRadius: size / 2 }} uiBackground={{ color }} />
        </UiEntity>
    )
}

/**
 * One figure: a small caption, the value under it, and an optional note under that. A `unit`
 * follows the value on the same line, smaller, so "18 / 21 GALLONS" fits a column.
 */
const muleStat = (stat: MuleStat) => (
    <UiEntity key={stat.caption} uiTransform={{ width: '100%', flexDirection: 'column', margin: { bottom: 12 } }}>
        <Label value={stat.caption} fontSize={15} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 20 }} />
        <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            {stat.dot !== undefined ? statusDot(stat.dot) : null}
            <BitmapText value={stat.value.toUpperCase()} fontSize={22} color={stat.color ?? BANK_CREAM} />
            {stat.unit !== undefined ? (
                <BitmapText value={stat.unit.toUpperCase()} fontSize={15} color={stat.color ?? BANK_CREAM} uiTransform={{ margin: { left: 6 } }} />
            ) : null}
        </UiEntity>
        {stat.note !== undefined ? (
            <Label value={stat.note} fontSize={14} color={stat.color ?? MUTED_COLOR} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 18 }} />
        ) : null}
    </UiEntity>
)

// The track carries a border so the full capacity reads at a glance, however little is in it.
const muleBar = (key: string, share: number, color: Color4, border: Color4 = BANK_CAPTION) => (
    <UiEntity
        key={key}
        uiTransform={{
            width: '100%',
            height: MULE_BAR_HEIGHT,
            margin: { bottom: 12 },
            borderRadius: MULE_BAR_HEIGHT / 2,
            borderWidth: 2,
            borderColor: border
        }}
        uiBackground={{ color: MULE_BAR_TRACK }}
    >
        <UiEntity
            uiTransform={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: '100%', borderRadius: MULE_BAR_HEIGHT / 2 }}
            uiBackground={{ color }}
        />
    </UiEntity>
)

/** A column: a header like the old tabs (icon and title), and its figures stacked under it. */
const muleColumn = (title: string, icon: Icon, children: ReactEcs.JSX.Element[], last: boolean) => (
    <UiEntity
        key={title}
        uiTransform={{
            width: 0,
            flexGrow: 1,
            flexDirection: 'column',
            margin: { right: last ? 0 : MULE_COLUMN_GAP },
            borderRadius: PANEL_RADIUS,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <UiEntity
            uiTransform={{
                width: '100%',
                height: MULE_HEADER_HEIGHT,
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                // No fill of its own: only a line under it, where the figures start, in the
                // column frame's own colour.
                borderWidth: { top: 0, left: 0, right: 0, bottom: 2 },
                borderColor: BANK_TRIM
            }}
        >
            <UiEntity
                uiTransform={{ width: 32, height: 32, margin: { right: 6 }, flexShrink: 0 }}
                uiBackground={iconBackground(icon)}
            />
            <BitmapText value={title.toUpperCase()} fontSize={22} color={BANK_GOLD_LIGHT} />
        </UiEntity>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', padding: { left: 14, right: 14, top: 12, bottom: 4 } }}>
            {children}
        </UiEntity>
    </UiEntity>
)

function fleetColumn(): ReactEcs.JSX.Element[] {
    const mules = getMuleCount()
    const status = muleStatus()
    return [
        <UiEntity key="fleet-count" uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', margin: { bottom: 12 } }}>
            <BitmapText value={`${mules}`} fontSize={56} color={BANK_GOLD_LIGHT} />
            <BitmapText value={mules === 1 ? 'M.U.L.E.' : 'M.U.L.E.S'} fontSize={22} color={BANK_CREAM} uiTransform={{ margin: { left: 10, bottom: 6 } }} />
        </UiEntity>,
        muleStat(
            status.running
                ? { caption: 'Status', value: 'Running', color: PRICE_GOOD_COLOR, dot: { color: PRICE_GOOD_COLOR, pulse: true } }
                : { caption: 'Status', value: 'Paused', color: SHORT_COLOR, note: status.reason, dot: { color: SHORT_COLOR, pulse: false } }
        ),
        muleStat({ caption: 'Total output', value: `${withCommas(MULE_ORE_PER_HOUR * 24 * mules)} Ore/day` }),        
    ]
}

/**
 * A warning at the foot of a column: what stopped (or is about to stop) the rigs, and what to do.
 * Wraps, since a column is narrow. DEBUG_SHOW_MULE_ALERTS shows them all regardless.
 */
const muleAlert = (key: string, text: string, color: Color4 = SHORT_COLOR) => (
    <Label
        key={key}
        value={text}
        fontSize={14}
        color={color}
        textAlign="top-left"
        textWrap="wrap"
        uiTransform={{ width: '100%', height: 58, margin: { bottom: 8 } }}
    />
)

function fuelColumn(): ReactEcs.JSX.Element[] {
    const mules = getMuleCount()
    const gallons = fuelGallonsNow()
    const tank = fuelTankGallons(getMuleCount())
    const fuelUse = FUEL_GALLONS_PER_RIG_DAY * mules
    const share = tank > 0 ? gallons / tank : 0
    const low = share < FUEL_LOW_SHARE
    // Low fuel blinks: the fill and the frame flash red on the UI clock. The frame too, since
    // under a tenth of the tank the fill alone is a sliver.
    const blinkOff = low && Math.floor(uiClock / FUEL_BLINK_SECONDS) % 2 === 1
    return [
        muleStat({ caption: 'Fuel in tank', value: `${Math.floor(gallons)} / ${tank}`, unit: 'Gallons', color: low ? SHORT_COLOR : COIN_COLOR }),
        muleBar('fuel-bar', blinkOff ? 0 : share, low ? SHORT_COLOR : COIN_COLOR, low && !blinkOff ? SHORT_COLOR : BANK_CAPTION),
        muleStat({ caption: 'Fuel left', value: fuelLeftText(), color: gallons > 0 ? BANK_CREAM : SHORT_COLOR }),
        muleStat({ caption: 'Fuel use', value: `${fuelUse} ${fuelUse === 1 ? 'Gallon' : 'Gallons'}/day` }),
        // Empty outranks low: only one of the two is a real state at a time.
        DEBUG_SHOW_MULE_ALERTS || gallons <= 0
            ? muleAlert('fuel-empty', 'Out of fuel. Buy fuel at the General Store to keep producing.')
            : null,
        DEBUG_SHOW_MULE_ALERTS || (low && gallons > 0)
            ? muleAlert('fuel-low', 'Fuel is running low. Refill soon to keep producing.', COIN_COLOR)
            : null
    ].filter((element): element is ReactEcs.JSX.Element => element !== null)
}

function storageColumn(): ReactEcs.JSX.Element[] {
    const ore = getOre()
    const capacity = getCarryCapacity()
    const perHour = MULE_ORE_PER_HOUR * getMuleCount()
    const fuelHours = getMuleFuelHours()
    const next = nextTier('storage', (id) => getOwned(id))

    // When the storage fills at the current pace — unless the fuel runs out first, which
    // pauses the rigs before it can.
    let fullIn: MuleStat = { caption: 'Storage full in', value: 'Full now', color: SHORT_COLOR }
    if (ore < capacity) {
        const hours = (capacity - ore) / perHour
        if (perHour <= 0 || fuelHours <= 0) fullIn = { caption: 'Storage full in', value: '-', color: MUTED_COLOR, note: 'not filling' }
        else if (fuelHours < hours) fullIn = { caption: 'Storage full in', value: '-', color: MUTED_COLOR, note: 'fuel runs out first' }
        else fullIn = { caption: 'Storage full in', value: durationText(hours) }
    }

    return [
        muleStat({ caption: 'Stored ore', value: `${withCommas(ore)} / ${withCommas(capacity)}` }),
        muleBar('storage-bar', capacity > 0 ? ore / capacity : 0, ore >= capacity ? SHORT_COLOR : ORE_COLOR),
        muleStat(fullIn),
        // At the top tier there is nothing to upgrade to, so it only says so.
        muleStat(
            next === null
                ? { caption: 'Capacity', value: 'Max', color: BANK_GOLD_LIGHT }
                : { caption: 'Next upgrade', value: `${withCommas(next.storage ?? 0)} Ore` }
        ),
        DEBUG_SHOW_MULE_ALERTS || ore >= capacity
            ? muleAlert('storage-full', 'Storage is full. Sell your ore at the Bank to keep producing.')
            : null
    ].filter((element): element is ReactEcs.JSX.Element => element !== null)
}

const mulePanel = () => (
    <UiEntity
        uiTransform={{
            width: '100%',
            minWidth: PANEL_MIN_WIDTH,
            flexDirection: 'column',
            padding: BANK_PANEL_PADDING,
            borderRadius: PANEL_RADIUS,
            borderWidth: 3,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD_DARK }}
    >
        {/* The name centred: the acronym, with what it stands for under it, smaller. The close
            button sits apart in the top-right corner, so it does not pull the title off centre. */}
        <UiEntity uiTransform={{ width: '100%', height: 72, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: { bottom: 12 } }}>
            <BitmapText value="M.U.L.E." fontSize={46} color={BANK_GOLD_LIGHT} />
            <Label value="Mining Utility Labor Engine" fontSize={16} color={BANK_CAPTION} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: 22 }} />
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={closeMulePanel}
            />
        </UiEntity>
        {/* The columns stretch to the tallest, so their frames line up at the bottom. */}
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row' }}>
            {muleColumn('Fleet', ICON_MULE, fleetColumn(), false)}
            {muleColumn('Fuel', ICON_FUEL, fuelColumn(), false)}
            {muleColumn('Storage', ICON_WAREHOUSE, storageColumn(), true)}
        </UiEntity>
        <Label
            value="Get Fuel and Storage at the General Store"
            fontSize={16}
            color={BANK_CAPTION}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: 24, margin: { top: 10 } }}
        />
    </UiEntity>
)

// --- Inventory ----------------------------------------------------------------------------
//
// Opened by a button at the bottom-right of the column; closes from its corner. A grid of what
// the player owns, filtered by tabs, with a short detail under it for the card picked. For
// browsing only: switching picks is the selector's job, at the bottom-left.
//
// Storage, one system bought in tiers, shows as ONE card with its level, not a card per tier.
// Properties are each their own card: every one owned is a separate place.
//
// Dressed like the bank and the store: dark wood, trim borders, gold for what is selected.

let inventoryOpen = false

// Tools work the ore (picks and rigs), utilities keep the operation going (storage and fuel),
// property is where the player lives.
type InventoryTab = 'all' | 'tools' | 'utilities' | 'property'

const INVENTORY_TABS: { id: InventoryTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'tools', label: 'Tools' },
    { id: 'utilities', label: 'Utilities' },
    { id: 'property', label: 'Property' }
]

let inventoryTab: InventoryTab = 'all'
let inventorySelected: string | null = null

const INVENTORY_COLUMNS = 3
const INVENTORY_GAP = 10
const INVENTORY_CARD_WIDTH = 226
const INVENTORY_CARD_HEIGHT = 112
/** Tabs, grid and detail share this width, so their edges line up. */
const INVENTORY_GRID_WIDTH = INVENTORY_COLUMNS * INVENTORY_CARD_WIDTH + (INVENTORY_COLUMNS - 1) * INVENTORY_GAP
const INVENTORY_CARD_ICON = 60
const INVENTORY_TAB_HEIGHT = 40
const INVENTORY_DETAIL_ICON = 84
const INVENTORY_BADGE_COLOR = EQUIPPED_COLOR

type InventoryEntry = {
    key: string
    tab: Exclude<InventoryTab, 'all'>
    title: string
    icon: Icon
    /** The card's one short line: hits, a count, a level. */
    status: string
    equipped: boolean
    /** The green tag's text when `equipped`; 'Equipped' unless said otherwise. */
    badge?: string
    /** The detail panel's lines, under the title. */
    details: string[]
}

/** 'Level 1' for the free base, then one level per tier owned. */
function tierLevel(line: 'storage' | 'housing'): { level: number; top: ShopItem | null } {
    const top = ownedTier(line, (id) => getOwned(id))
    return { level: top === null ? 1 : itemsOf(line).indexOf(top) + 2, top }
}

function inventoryEntries(): InventoryEntry[] {
    const entries: InventoryEntry[] = []
    const inUse = activePick((id) => getOwned(id), getEquipped())?.id ?? ''

    for (const pick of PICKS) {
        if (getOwned(pick.id) <= 0) continue
        const equipped = pick.id === inUse
        entries.push({
            key: pick.id,
            tab: 'tools',
            title: pick.label,
            icon: PICK_ICONS[pick.id] ?? ICON_PICK_IRON,
            status: `${pick.hitsPerRock} hits per rock`,
            equipped,
            details: [
                `${pick.hitsPerRock} hits per rock`,
                pick.benefit,
                equipped ? 'Currently equipped' : 'Switch picks from the tool button'
            ]
        })
    }

    const mules = getMuleCount()
    if (mules > 0) {
        entries.push({
            key: 'mule',
            tab: 'tools',
            title: 'M.U.L.E.',
            icon: ICON_MULE,
            status: `x${mules}`,
            equipped: false,
            details: [
                `${mules} owned`,
                `Produces ${withCommas(MULE_ORE_PER_HOUR * 24 * mules)} ore/day`,
                `Fuel left: ${fuelLeftText()}`
            ]
        })
    }

    const storage = tierLevel('storage')
    const nextStorage = nextTier('storage', (id) => getOwned(id))
    entries.push({
        key: 'storage',
        tab: 'utilities',
        title: 'Storage',
        icon: ICON_WAREHOUSE,
        status: `Level ${storage.level}`,
        equipped: false,
        details: [
            `Level ${storage.level} · holds ${withCommas(getCarryCapacity())} ore`,
            `Stored now: ${withCommas(getOre())} ore`,
            nextStorage === null ? 'Max level' : `Next: ${nextStorage.label} at the Store`
        ]
    })

    // The home lived in carries the green tag, the way the pick in use does.
    const home = activeHome()
    for (const property of itemsOf('housing')) {
        if (getOwned(property.id) <= 0) continue
        const active = property.id === home?.id
        entries.push({
            key: property.id,
            tab: 'property',
            title: property.label,
            icon: PROPERTY_ICONS[property.id] ?? ICON_WAGON,
            status: property.benefit,
            equipped: active,
            badge: 'Active',
            details: [
                property.benefit,
                property.startsOwned === true ? 'Yours from the start' : `Bought for ${withCommas(property.price)} coins`,
                active ? 'Your current home' : 'You moved up from here'
            ]
        })
    }

    if (mules > 0) {
        const gallons = Math.floor(fuelGallonsNow())
        entries.push({
            key: 'fuel',
            tab: 'utilities',
            title: 'Fuel',
            icon: ICON_FUEL,
            status: `${gallons} gal`,
            equipped: false,
            details: [
                `${gallons} / ${fuelTankGallons(mules)} gallons in the tank`,
                getMuleFuelHours() <= 0 ? 'Tank empty — the M.U.L.E.s are stopped' : `Lasts ${fuelLeftText()} at this fleet size`
            ]
        })
    }

    return entries
}

const inventoryTabButton = (tab: { id: InventoryTab; label: string }) => {
    const active = tab.id === inventoryTab
    return (
        <UiEntity
            key={tab.id}
            uiTransform={{
                height: INVENTORY_TAB_HEIGHT,
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center',
                margin: { right: tab.id === INVENTORY_TABS[INVENTORY_TABS.length - 1].id ? 0 : 6 },
                borderRadius: 8,
                borderWidth: active ? 3 : 2,
                borderColor: active ? BANK_GOLD : BANK_TRIM
            }}
            uiBackground={{ color: active ? BANK_TRIM : BANK_WOOD }}
            onMouseDown={() => {
                inventoryTab = tab.id
            }}
        >
            <BitmapText value={tab.label} fontSize={20} color={active ? BANK_GOLD_LIGHT : BANK_CAPTION} />
        </UiEntity>
    )
}

const inventoryCard = (entry: InventoryEntry, index: number) => {
    const selected = entry.key === inventorySelected
    const lastInRow = index % INVENTORY_COLUMNS === INVENTORY_COLUMNS - 1
    return (
        <UiEntity
            key={entry.key}
            uiTransform={{
                width: INVENTORY_CARD_WIDTH,
                height: INVENTORY_CARD_HEIGHT,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                margin: { right: lastInRow ? 0 : INVENTORY_GAP, bottom: INVENTORY_GAP },
                borderRadius: 10,
                borderWidth: selected ? 3 : 2,
                borderColor: selected ? BANK_GOLD : BANK_TRIM
            }}
            uiBackground={{ color: selected ? BANK_TRIM : BANK_WOOD }}
            onMouseDown={() => {
                inventorySelected = selected ? null : entry.key
            }}
        >
            <UiEntity
                uiTransform={{ width: INVENTORY_CARD_ICON, height: INVENTORY_CARD_ICON, flexShrink: 0 }}
                uiBackground={iconBackground(entry.icon)}
            />
            <BitmapText value={entry.title} fontSize={20} color={BANK_CREAM} uiTransform={{ margin: { top: 4 } }} />
            <Label
                value={entry.status}
                fontSize={14}
                color={COIN_COLOR}
                textAlign="middle-center"
                textWrap="nowrap"
                uiTransform={{ height: 18 }}
            />
            {entry.equipped ? (
                <Label
                    value={entry.badge ?? 'Equipped'}
                    fontSize={12}
                    color={EQUIPPED_TEXT}
                    textAlign="middle-center"
                    textWrap="nowrap"
                    uiTransform={{ positionType: 'absolute', position: { top: 6, right: 6 }, width: 70, height: 20, borderRadius: 6 }}
                    uiBackground={{ color: INVENTORY_BADGE_COLOR }}
                />
            ) : null}
        </UiEntity>
    )
}

const inventoryDetail = (entry: InventoryEntry) => (
    <UiEntity
        uiTransform={{
            width: INVENTORY_GRID_WIDTH,
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            margin: { top: 4 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_GOLD
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <UiEntity
            uiTransform={{ width: INVENTORY_DETAIL_ICON, height: INVENTORY_DETAIL_ICON, margin: { right: 16 }, flexShrink: 0 }}
            uiBackground={iconBackground(entry.icon)}
        />
        <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
            <BitmapText value={entry.title.toUpperCase()} fontSize={28} color={BANK_GOLD_LIGHT} uiTransform={{ margin: { bottom: 4 } }} />
            {entry.details.map((line, i) => (
                <Label
                    key={`${i}`}
                    value={line}
                    fontSize={15}
                    color={entry.equipped && i === entry.details.length - 1 ? PRICE_GOOD_COLOR : BANK_CREAM}
                    textAlign="middle-left"
                    textWrap="nowrap"
                    uiTransform={{ height: 20 }}
                />
            ))}
        </UiEntity>
    </UiEntity>
)

const inventoryPanel = () => {
    const all = inventoryEntries()
    const shown = inventoryTab === 'all' ? all : all.filter((entry) => entry.tab === inventoryTab)
    // A selection the tab no longer shows (or an item no longer owned) is dropped.
    const selected = shown.find((entry) => entry.key === inventorySelected) ?? null
    if (selected === null) inventorySelected = null
    const noPick = inventoryTab === 'tools' && shown.length === 0

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                minWidth: PANEL_MIN_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <BitmapText value="INVENTORY" fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 12 } }} />
            {/* Closed from the corner, like the store. */}
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={() => {
                    inventoryOpen = false
                }}
            />
            <UiEntity uiTransform={{ width: INVENTORY_GRID_WIDTH, flexDirection: 'row', margin: { bottom: 12 } }}>
                {INVENTORY_TABS.map(inventoryTabButton)}
            </UiEntity>
            {shown.length === 0 ? (
                <Label
                    value={noPick ? 'Nothing yet — the mayor has a pick for you' : 'Nothing here yet'}
                    fontSize={18}
                    color={BANK_CAPTION}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: INVENTORY_CARD_HEIGHT }}
                />
            ) : (
                <UiEntity uiTransform={{ width: INVENTORY_GRID_WIDTH, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                    {shown.map(inventoryCard)}
                </UiEntity>
            )}
            {selected !== null ? inventoryDetail(selected) : null}
        </UiEntity>
    )
}

// Dressed like the Map button next to it: icon, then label.
const inventoryButton = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { bottom: BOTTOM_BUTTON_Y, right: 0 },
            width: BOTTOM_BUTTON_WIDTH,
            height: BOTTOM_BUTTON_HEIGHT,
            borderRadius: 8,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
        }}
        uiBackground={{ color: STEP_BUTTON_COLOR }}
        onMouseDown={() => {
            inventoryOpen = !inventoryOpen
            if (inventoryOpen) {
                mapOpen = false
                pickSelectorOpen = false
            }
        }}
    >
        <UiEntity uiTransform={{ width: 32, height: 32, margin: { right: 8 } }} uiBackground={iconBackground(ICON_INVENTORY)} />
        <Label value={inventoryOpen ? 'Close' : 'Inventory'} fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ height: 44 }} />
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

// The red close button every panel uses; the map's sits in its top-right corner.
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
            uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
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
            position: { bottom: BOTTOM_BUTTON_Y, right: BOTTOM_BUTTON_WIDTH + BOTTOM_BUTTON_GAP },
            width: BOTTOM_BUTTON_WIDTH,
            height: BOTTOM_BUTTON_HEIGHT,
            borderRadius: 8,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center'
        }}
        uiBackground={{ color: STEP_BUTTON_COLOR }}
        onMouseDown={() => {
            mapOpen = !mapOpen
            if (mapOpen) {
                inventoryOpen = false
                pickSelectorOpen = false
            }
        }}
    >
        <UiEntity
            uiTransform={{ width: 32, height: 32, margin: { right: 8 } }}
            uiBackground={iconBackground(ICON_MAP)}
        />
        <Label value="Map" fontSize={18} color={Color4.White()} textAlign="middle-center" uiTransform={{ height: 44 }} />
    </UiEntity>
)

// --- Bottom buttons -----------------------------------------------------------------------
//
// The pick selector on the bottom-left of the column, Map and Inventory on the bottom-right.

const BOTTOM_BUTTON_Y = 56
const BOTTOM_BUTTON_WIDTH = 150
const BOTTOM_BUTTON_HEIGHT = 44
const BOTTOM_BUTTON_GAP = 8

// --- Pick selector ------------------------------------------------------------------------
//
// The pick in hand, as a button: icon and name. Tapping it opens a short list of every pick
// above it — the one in use highlighted, the owned ones selectable, the rest locked. Choosing
// is a request, answered by the wallet, so the highlight moves when the server agrees.

const PICK_ROW_WIDTH = 240
const PICK_ROW_HEIGHT = 48
const PICK_ROW_ICON = 36
const LOCKED_TINT = Color4.create(1, 1, 1, 0.35)

let pickSelectorOpen = false

const pickButton = () => {
    const pick = activePick((id) => getOwned(id), getEquipped())
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { bottom: BOTTOM_BUTTON_Y, left: 0 },
                height: BOTTOM_BUTTON_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 10, right: 14 },
                borderRadius: 8,
                borderWidth: 2,
                borderColor: pickSelectorOpen ? BANK_GOLD : Color4.Clear()
            }}
            uiBackground={{ color: STEP_BUTTON_COLOR }}
            onMouseDown={() => {
                if (pick === null) return
                pickSelectorOpen = !pickSelectorOpen
                if (pickSelectorOpen) {
                    mapOpen = false
                    inventoryOpen = false
                }
            }}
        >
            <UiEntity
                uiTransform={{ width: 32, height: 32, margin: { right: 8 } }}
                uiBackground={iconBackground((pick && PICK_ICONS[pick.id]) ?? ICON_PICK_IRON, pick === null ? LOCKED_TINT : Color4.White())}
            />
            <Label
                value={pick?.label ?? 'No pick'}
                fontSize={18}
                color={pick === null ? MUTED_COLOR : Color4.White()}
                textAlign="middle-left"
                textWrap="nowrap"
                uiTransform={{ height: BOTTOM_BUTTON_HEIGHT }}
            />
        </UiEntity>
    )
}

const pickRow = (item: ShopItem, inUse: boolean) => {
    const owned = getOwned(item.id) > 0
    return (
        <UiEntity
            key={item.id}
            uiTransform={{
                width: PICK_ROW_WIDTH,
                height: PICK_ROW_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 8, right: 10 },
                margin: { top: 6 },
                borderRadius: 8,
                borderWidth: 2,
                borderColor: inUse ? BANK_GOLD : BANK_TRIM
            }}
            uiBackground={{ color: inUse ? BANK_TRIM : BANK_WOOD }}
            onMouseDown={() => {
                if (!owned) return
                if (!inUse) sendEquip(item.id)
                pickSelectorOpen = false
            }}
        >
            <UiEntity
                uiTransform={{ width: PICK_ROW_ICON, height: PICK_ROW_ICON, margin: { right: 10 }, flexShrink: 0 }}
                uiBackground={iconBackground(PICK_ICONS[item.id] ?? ICON_PICK_IRON, owned ? Color4.White() : LOCKED_TINT)}
            />
            <Label
                value={item.label}
                fontSize={17}
                color={owned ? BANK_CREAM : MUTED_COLOR}
                textAlign="middle-left"
                textWrap="nowrap"
                uiTransform={{ flexGrow: 1, height: PICK_ROW_HEIGHT }}
            />
            {owned ? null : (
                <UiEntity
                    uiTransform={{ width: 24, height: 24, flexShrink: 0 }}
                    uiBackground={iconBackground(ICON_LOCK, LOCKED_TINT)}
                />
            )}
        </UiEntity>
    )
}

const pickSelector = () => {
    if (!pickSelectorOpen) return null
    const inUse = activePick((id) => getOwned(id), getEquipped())?.id ?? ''
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { bottom: BOTTOM_BUTTON_Y + BOTTOM_BUTTON_HEIGHT + BOTTOM_BUTTON_GAP, left: 0 },
                flexDirection: 'column',
                padding: { left: 8, right: 8, bottom: 8, top: 2 },
                borderRadius: 10,
                borderWidth: 2,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <BitmapText value="Manual Tool" fontSize={22} color={BANK_GOLD_LIGHT} uiTransform={{ margin: { top: 6, bottom: 2, left: 2 } }} />
            {PICKS.map((item) => pickRow(item, item.id === inUse))}
        </UiEntity>
    )
}

// --- Objective tracker --------------------------------------------------------------------
//
// On the right edge of the screen: a bell, a title and two short lines saying the one thing
// that matters now (see ui/objective.ts). Hidden when there is nothing to say. Alerts wear the
// warning colour; objectives the bank's gold.

const OBJECTIVE_TOP = '30vh'
const OBJECTIVE_WIDTH = 348
const OBJECTIVE_ICON_SIZE = 28
const OBJECTIVE_BAR_HEIGHT = 8

const objectiveTracker = () => {
    const objective: Objective | null = getObjective()
    if (objective === null) return null

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: OBJECTIVE_TOP, right: HUD_MARGIN },
                width: OBJECTIVE_WIDTH,
                flexDirection: 'column',
                padding: { left: 14, right: 14, top: 10, bottom: 12 },
                borderRadius: PANEL_RADIUS,
                borderWidth: 2,
                borderColor: objective.alert ? SHORT_COLOR : BANK_TRIM
            }}
            uiBackground={{ color: HUD_BACKGROUND }}
        >
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 4 } }}>
                <UiEntity
                    uiTransform={{ width: OBJECTIVE_ICON_SIZE, height: OBJECTIVE_ICON_SIZE, margin: { right: 8 }, flexShrink: 0 }}
                    uiBackground={iconBackground(ICON_NOTIFICATION)}
                />
                <BitmapText value={objective.title} fontSize={20} color={objective.alert ? STORAGE_FULL_COLOR : BANK_GOLD_LIGHT} />
            </UiEntity>
            <Label
                value={objective.message}
                fontSize={17}
                color={Color4.White()}
                textAlign="middle-left"
                textWrap="nowrap"
                uiTransform={{ height: 24 }}
            />
            {objective.detail !== '' ? (
                <Label
                    value={objective.detail}
                    fontSize={15}
                    color={MUTED_COLOR}
                    textAlign="middle-left"
                    textWrap="nowrap"
                    uiTransform={{ height: 20 }}
                />
            ) : null}
            {objective.progress !== null ? (
                <UiEntity
                    uiTransform={{ width: '100%', height: OBJECTIVE_BAR_HEIGHT, margin: { top: 6 }, borderRadius: 4 }}
                    uiBackground={{ color: MINING_TRACK_COLOR }}
                >
                    <UiEntity
                        uiTransform={{ width: percent(Math.min(1, objective.progress)), height: '100%', borderRadius: 4 }}
                        uiBackground={{ color: MINING_FILL_COLOR }}
                    />
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}

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
        {/* the tracker and the debug box sit outside main-container so they anchor to the screen
            edge. They come first because later siblings draw on top: an open panel covers them. */}
        {objectiveTracker()}
        {DEBUG_RESET_PROGRESS || DEBUG_ADD_COINS || DEBUG_ADD_ORE ? debugBox() : null}
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
            {pickButton()}
            {mapButton()}
            {inventoryButton()}
            {DEBUG_SERVER_STATUS ? serverStatus() : null}
            {/* The panels go last so they draw over the HUD and the bottom buttons: on mobile
                they are tall enough to reach both. */}
            {mapOpen ? mapPanel() : null}
            {inventoryOpen ? inventoryPanel() : null}
            {!mapOpen && !inventoryOpen && isBankPanelOpen() ? bankPanel() : null}
            {!mapOpen && !inventoryOpen && isStorePanelOpen() ? storePanel() : null}
            {!mapOpen && !inventoryOpen && isLandOfficePanelOpen() ? landOfficePanel() : null}
            {!mapOpen && !inventoryOpen && isMulePanelOpen() && getMuleCount() > 0 ? mulePanel() : null}
            {pickSelector()}
        </UiEntity>
        {welcomeOverlay()}
        {introScreen()}
    </UiEntity>
)
