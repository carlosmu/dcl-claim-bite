import { AvatarBase, engine, PlayerIdentityData, UiCanvasInformation } from '@dcl/sdk/ecs'
import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button, Input } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { isMobile } from '@dcl/sdk/platform'
import { copyToClipboard } from '~system/RestrictedActions'
import { getCoins, getOre } from './shared/state/wallet'
import { changeSellCoins, closeBankPanel, commitSellOre, getSellAmount, getSellCoins, getSellOreDraft, getSellOreInputGeneration, isBankPanelOpen, maxSellCoins, sellSelectedOre, setSellCoins, typeSellOre } from './bank/bank'
import {
    getCarryCapacity,
    getMuleCount,
    getMuleFuelHours,
    getMarketPlayers,
    getRateHistory,
    getSyncedRate,
    sendDebugCoins,
    sendDebugOre,
    sendDebugReset,
    sendAdminMaintenance,
    sendEquip,
    sendSellHome
} from './net/economy-link'
import { canSpinSlot, closeCasinoPanel, getSlotBet, getSlotMessage, getSlotReels, getSlotTagline, isCasinoPanelOpen, isSlotInfoOpen, isSlotSpinning, setSlotBet, spinSlot, toggleSlotInfo } from './casino/casino'
import { SLOT_BETS, SLOT_MAX_BET, SLOT_SYMBOLS, threeBellsPay, TWO_HORSESHOES_PAY } from './shared/economy/slots'
import { getJackpot } from './shared/net/casino-sync'
import { buyItem, closeStorePanel, currentPrice, homeBuyback, listPrice, getSelectedProduct, isStorePanelOpen, selectProduct, whyUnavailable } from './shop/shop'
import { closeMulePanel, isMulePanelOpen } from './mule/mule'
import { closeLandOfficePanel, getSelectedProperty, isLandOfficePanelOpen, selectProperty } from './land-office/land-office'
import {
    canClaimReward,
    claimReward,
    closeClaimOfficePanel,
    getRewardClaimError,
    getRewardStatus,
    isClaimOfficePanelOpen,
    toggleClaimOfficeFromButton
} from './claim-office/claim-office'
import { RewardCampaign, rewardCampaignsAt } from './shared/rewards'
import {
    buyTailorItem,
    canBuyTailorItem,
    closeTailorShopPanel,
    getSelectedTailorItem,
    isTailorItemOwned,
    isTailorShopPanelOpen,
    selectTailorItem
} from './tailor-shop/tailor-shop'
import {
    canSendNote,
    clearMyNotes,
    closeOwnerCard,
    deleteMyNote,
    getMyNotes,
    getNoteDraft,
    getNoteStatus,
    getOpenOwner,
    getOpenOwnerName,
    getOwnerCard,
    isOwnCard,
    isOwnerCardOpen,
    sendNote,
    setNoteDraft
} from './land-office/owner-card'
import { ownerHasFace } from './land-office/properties'
import { Note, NOTE_MAX_CHARS, NOTE_MAX_KEPT } from './shared/notes'
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
    MULE_MAX_COUNT,
    MULE_ORE_PER_HOUR,
    RATE_BASE,
    socialBonus
} from './shared/economy/constants'
import { getActiveMiners } from './shared/net/social-sync'
import { getTownTitles } from './shared/net/town-titles-sync'
import { TitleId } from './shared/titles'
import { getDurability, getEquipped, getOwned } from './shared/state/inventory'
import { getServerTick, isServerOnline } from './net/server-link'
import { getDeployStamp, getDeployStampFailure, getDeployStampUtc } from './net/deploy-stamp'
import { getMiningStatus, getRingPulse, showMoveCloserHint } from './mining/rocks'
import { setupRollingCounters, shownCoins, shownOre } from './ui/rolling-counter'
import { getOrePopup, setupOrePopup } from './ui/ore-popup'
import { DEBUG_ADD_COINS, DEBUG_ADD_ORE, DEBUG_RESET_PROGRESS, DEBUG_SERVER_STATUS, DEBUG_SHOW_MULE_ALERTS } from './shared/debug-flags'
import { claimCompensation, closeCompensation, CompensationOffer, getCompensation, isClaimingCompensation } from './ui/compensation'
import { canEscapeMaintenance, closeServerOutdated, didRejoinFail, getRejoinReason, getUpdateScreen, isMaintenanceOn, isRejoining, rejoinWorld } from './ui/server-outdated'
import { isAdmin } from './shared/admins'
import { getCampaignAdmin, getCampaignStatus, getWinnersCopied, onCampaignMilestone, sendAdminCampaignWinners } from './net/campaign-link'
import { getPlayer } from '@dcl/sdk/players'
import { isLocalPreview } from './shared/local-preview'
import { quotedRate, secondsToRecover } from './shared/state/market'
import { getLanguage, itemBenefit, itemName, rewardText, t, upper } from './i18n'
import { flagIcon, LANGUAGE_LIST_WIDTH, languageColumns } from './ui/language-selector'
import { BitmapText } from './ui/bitmap-text'
import { introScreen } from './ui/intro-screen'
import { giveFeedback, reportBug } from './playtest'
import { welcomeOverlay } from './ui/welcome-overlay'
import { canShowBlockingScreen, isPlaying } from './world/game-phase'
import { getMusicStep, getSfxStep, VOLUME_STEPS } from './world/volume'
import { isTrackEnabled, TRACKS } from './world/music'
import { pickMusicStep, pickSfxStep, pickTrackEnabled } from './net/sound-link'
import { clearObjectiveHistory, dismissObjective, getObjectiveClock, getObjectives, getObjectiveHistory, Objective, PastObjective, setupObjective, SOCIAL_BONUS_ID, CREDITS_ID, MULE_AWAY_ID } from './ui/objective'

export function setupUi() {
    setupRollingCounters()
    setupOrePopup()
    setupObjective()
    // Completing a day of the credits quest shows where it stands: the Claim Office, on Credits.
    onCampaignMilestone(openCreditsRewards)

    // No screen inset: the SDK's default ('device') pulls the whole UI in by the phone's safe
    // margins. The game is landscape and everything sits in the centred column, where no notch
    // or corner reaches, so those margins only shrank the UI for nothing.
    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080, screenInset: 'none' })
}

const PANEL_WIDTH = 500

// Everything this scene draws lives inside one centred column: full screen height, but only
// 45% of its width.
//
// The narrowness is the point, not a layout accident. The left and right edges of the screen
// belong to the explorer's own interface — chat, minimap, the emote wheel — and anything we
// pin out there sits on top of it. Keeping to the middle band means the scene never has to
// guess where the client put its own UI this version.
//
// So nothing here is positioned against the SCREEN. An absolute child with `top`/`left`
// anchors to this column, which is what makes the HUD land inside the safe band.
const MAIN_CONTAINER_WIDTH = '45%'

// The big panels (bank, store, rig, inventory) were laid out for the old 40% desktop column:
// 40% of 1920 = 768. On mobile the SDK swaps the 16:9 virtual screen for 1600x720, which shrinks the
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
// Icons come from one atlas, HD_icons.png, an 8x8 grid named like a spreadsheet: columns are
// lettered A–H from the left, rows numbered 1–8 from the top, so B3 is column B, row 3. The old
// UI_01 is its top-left quarter (A–D, rows 1–4) and the old UI_02 its top-right (E–H, rows 1–4).
// Many cells are not used yet; the A–D ones are mapped below anyway.
const ATLAS = 'assets/images/HD_icons.png'
const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 8

const HUD_MARGIN = 16
const HUD_HEIGHT = 64
/** Breathing room above and below the segments, so the captions don't touch the pill's top edge. */
const HUD_PADDING_Y = 8
const HUD_PILL_HEIGHT = HUD_HEIGHT + HUD_PADDING_Y * 2
/** On mobile an empty line shows above the plank — the image's transparent top margin, it seems,
 *  the UVs not trimming it there. The plank starts this far above the screen's edge instead, so
 *  that strip is off screen, and its padding takes the same back so the contents stay put. */
const HUD_MOBILE_BLEED = 12

function hudBleed(): number {
    return isMobile() ? HUD_MOBILE_BLEED : 0
}
const HUD_ICON_SIZE = HUD_HEIGHT - 8
const HUD_CAPTION_SIZE = 18
const HUD_VALUE_SIZE = 28
const HUD_BACKGROUND = Color4.create(0.07, 0.08, 0.1, 0.92)
/** The HUD's colour, fully opaque: the four bottom buttons. */
const BOTTOM_BUTTON_COLOR = Color4.create(HUD_BACKGROUND.r, HUD_BACKGROUND.g, HUD_BACKGROUND.b, 1)
const HUD_DIVIDER = Color4.create(1, 1, 1, 0.14)
const HUD_UNIT_SIZE = 13
/** The segment captions (Ore, Coins, Rate): white, to read on the wooden plank. */
const HUD_CAPTION_COLOR = Color4.White()
// The wooden plank behind the HUD, nine-sliced: the frame and the bottom rivets keep their
// shape while the middle stretches to the pill's width. The HUD hangs from the top of the
// screen, so only the middle and bottom rows of slices are used: the UVs leave out the image's
// top strip (its top edge and rivets) and there is no top slice.
const HUD_BG_IMAGE = 'assets/images/hud_bg.png'
/** Share of the image's height the top row of slices takes, and that the UVs leave out. */
const HUD_BG_EDGE = 0.1
const HUD_BG_SLICES = { top: 0, bottom: HUD_BG_EDGE, left: HUD_BG_EDGE, right: HUD_BG_EDGE }
// Bottom-left, top-left, top-right, bottom-right; v runs bottom-up, so the top is 1 - edge.
const HUD_BG_UVS = [0, 0, 0, 1 - HUD_BG_EDGE, 1, 1 - HUD_BG_EDGE, 1, 0]

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
// The "storage full" badge under the bar: white on red, its red flashing between two shades so
// it catches the eye on the wood without ever dropping out of sight. Taller than the unit line
// it stands in, overflowing it evenly, so the segment does not shift when it appears.
const STORAGE_FULL_BADGE_COLOR = Color4.create(0.85, 0.12, 0.1, 1)
const STORAGE_FULL_BADGE_DIM_COLOR = Color4.create(0.45, 0.05, 0.04, 1)
const STORAGE_FULL_BADGE_BLINK_SECONDS = 0.5
const STORAGE_FULL_BADGE_SIZE = 15
const STORAGE_FULL_BADGE_HEIGHT = 24
const STORAGE_FULL_BADGE_PADDING = 10
const STORAGE_FULL_BADGE_BORDER = 1
/** How far below the unit line's centre the badge sits. */
const STORAGE_FULL_BADGE_DROP = 10

/**
 * UVs for one cell of the atlas, addressed like a spreadsheet: column 1 is the left, row 1 is
 * the TOP. The v axis runs bottom-up in the texture, which is why the row is flipped here
 * rather than at every call site.
 *
 * The four corners go bottom-left, top-left, top-right, bottom-right.
 */
function atlasCell(column: number, row: number, src: string = ATLAS, columns: number = ATLAS_COLUMNS, rows: number = ATLAS_ROWS): Icon {
    const w = 1 / columns
    const h = 1 / rows
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
const ICON_SOUND = atlasCell(2, 3) // B3 — speaker
const ICON_LOCK = atlasCell(3, 3) // C3
const ICON_TIMER = atlasCell(4, 3) // D3
const ICON_FORBIDDEN = atlasCell(1, 4) // A4 — skull / prohibited
const ICON_SHERIFF = atlasCell(2, 4) // B4
const ICON_MAP = atlasCell(3, 4) // C4
const ICON_NOTIFICATION = atlasCell(4, 4) // D4 — bell
const ICON_CREDITS = atlasCell(1, 5) // A5 — Marketplace Credits

// Columns E–H: what was UI_02.png.
const ICON_WAGON = atlasCell(5, 1) // E1
const ICON_CABIN = atlasCell(6, 1) // F1
const ICON_HOUSE_HOME = atlasCell(7, 1) // G1
const ICON_RANCH = atlasCell(8, 1) // H1
const ICON_INVENTORY = atlasCell(5, 2) // E2
const ICON_HORSE = atlasCell(6, 2) // F2
const ICON_REVOLVER = atlasCell(7, 2) // G2
const ICON_DYNAMITE = atlasCell(8, 2) // H2
const ICON_RATE = atlasCell(5, 3) // E3
const ICON_GIFT = atlasCell(7, 4) // G4 — gift box
const ICON_FEEDBACK = atlasCell(8, 4) // H4 — speech bubble with stars

// Small icons: an 8x8 grid, named like the other atlases (letter = column, number = row).
const SMALL_ICONS_ATLAS = 'assets/images/Small_icons.png'
const SMALL_ICONS_GRID = 8
const smallIcon = (column: number, row: number): Icon => atlasCell(column, row, SMALL_ICONS_ATLAS, SMALL_ICONS_GRID, SMALL_ICONS_GRID)

const ICON_COPY = smallIcon(1, 1) // A1
const ICON_COPIED = smallIcon(2, 1) // B1
const ICON_CHECKED = smallIcon(2, 1) // B1 — green tick
const ICON_BULLET = smallIcon(3, 1) // C1

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
const hudUnitLine = (value: string, color: Color4, width?: number, align: 'middle-center' | 'middle-left' = 'middle-center') => (
    <Label
        value={value}
        fontSize={HUD_UNIT_SIZE}
        color={color}
        textAlign={align}
        textWrap="nowrap"
        uiTransform={{ width, height: HUD_UNIT_SIZE + 2 }}
    />
)

const hudSegment = (icon: Icon, caption: string, value: string, color: Color4) => (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
        {hudIcon(icon)}
        <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center' }}>
            <BitmapText value={caption} fontSize={HUD_CAPTION_SIZE} color={HUD_CAPTION_COLOR} />
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
                <BitmapText value={t('hud.ore')} fontSize={HUD_CAPTION_SIZE} color={HUD_CAPTION_COLOR} uiTransform={{ margin: { left: ORE_BAR_TEXT_INSET } }} />
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
                {full ? storageFullBadge() : hudUnitLine('', STORAGE_FULL_COLOR, ORE_BAR_WIDTH)}
            </UiEntity>
        </UiEntity>
    )
}

/** Stands in the ore segment's unit line while the storage is full; its text starts where "Ore" and the amount do. */
const storageFullBadge = () => {
    const bright = Math.floor(uiClock / STORAGE_FULL_BADGE_BLINK_SECONDS) % 2 === 0
    return (
        <UiEntity uiTransform={{ width: ORE_BAR_WIDTH, height: HUD_UNIT_SIZE + 2, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
            <UiEntity
                uiTransform={{
                    height: STORAGE_FULL_BADGE_HEIGHT,
                    flexShrink: 0,
                    margin: { left: ORE_BAR_TEXT_INSET - STORAGE_FULL_BADGE_PADDING - STORAGE_FULL_BADGE_BORDER, top: STORAGE_FULL_BADGE_DROP * 2 },
                    padding: { left: STORAGE_FULL_BADGE_PADDING, right: STORAGE_FULL_BADGE_PADDING },
                    borderRadius: STORAGE_FULL_BADGE_HEIGHT / 2,
                    borderWidth: STORAGE_FULL_BADGE_BORDER,
                    borderColor: Color4.White(),
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                uiBackground={{ color: bright ? STORAGE_FULL_BADGE_COLOR : STORAGE_FULL_BADGE_DIM_COLOR }}
            >
                <Label value={t('hud.storageFull')} fontSize={STORAGE_FULL_BADGE_SIZE} color={Color4.White()} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: STORAGE_FULL_BADGE_HEIGHT }} />
            </UiEntity>
        </UiEntity>
    )
}

/** Ore Price: the town's selling rate as a word, the same verdict the bank shows. */
const rateSegment = () => {
    const rate = quotedRate(getSyncedRate())
    return (
        <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGrow: 1, flexShrink: 0 }}>
            {hudIcon(ICON_RATE)}
            <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
                <BitmapText value={t('hud.orePrice')} fontSize={HUD_CAPTION_SIZE} color={HUD_CAPTION_COLOR} />
                <UiEntity uiTransform={{ height: HUD_VALUE_SIZE, flexDirection: 'row', alignItems: 'center' }}>
                    <BitmapText value={priceVerdict(rate).word} fontSize={HUD_VALUE_SIZE} color={priceVerdict(rate).color} />
                </UiEntity>
                {hudUnitLine('', MUTED_COLOR, undefined, 'middle-left')}
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
                // Flush with the top of the screen: the plank hangs from it.
                position: { top: -hudBleed() },
                width: '100%',
                flexDirection: 'row',
                justifyContent: 'center'
            }}
        >
        <UiEntity
            uiTransform={{
                width: '100%',
                height: HUD_PILL_HEIGHT + hudBleed(),
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 18, right: 22, top: HUD_PADDING_Y + hudBleed(), bottom: HUD_PADDING_Y }
            }}
            uiBackground={{ texture: { src: HUD_BG_IMAGE }, textureMode: 'nine-slices', textureSlices: HUD_BG_SLICES, uvs: HUD_BG_UVS }}
        >
            {oreSegment()}
            {hudDivider()}
            {hudSegment(ICON_COINS, t('hud.coins'), `${shownCoins()}`, COIN_COLOR)}
            {hudDivider()}
            {rateSegment()}
        </UiEntity>
        {/* The language selector is not here but in languageLayer(), drawn last over everything. */}
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
 * How long until the rate is back at the base if nobody sells and the crowd stays as it is.
 * An estimate: it assumes nobody sells in the meantime.
 */
function recoveryText(rate: number): string {
    const seconds = secondsToRecover(rate, getMarketPlayers())
    if (seconds <= 0) return t('bank.atEquilibrium', { rate: RATE_BASE })
    const minutes = Math.ceil(seconds / 60)
    return t('bank.backToEquilibrium', { rate: RATE_BASE, minutes })
}

// A plain reading of the rate, so the number does not have to be interpreted: five equal
// bands of the 10–12 range, best first. The best is the resting state, so it is what players
// see most. Judged in whole tenths, the way the rate is quoted, so 10.4 is exactly best and
// never a float's hair over.
const PRICE_BEST_MAX_TENTHS = 104
const PRICE_GOOD_MAX_TENTHS = 108
const PRICE_FAIR_MAX_TENTHS = 112
const PRICE_LOW_MAX_TENTHS = 116
const PRICE_BEST_COLOR = Color4.create(0.42, 0.8, 0.36, 1)
const PRICE_GOOD_COLOR = Color4.create(0.7, 0.85, 0.3, 1)
const PRICE_FAIR_COLOR = Color4.create(0.96, 0.82, 0.25, 1)
const PRICE_LOW_COLOR = Color4.create(0.95, 0.56, 0.24, 1)
const PRICE_BAD_COLOR = Color4.create(0.9, 0.33, 0.28, 1)

function priceVerdict(rate: number): { word: string; pill: string; color: Color4 } {
    const tenths = Math.round(rate * 10)
    if (tenths <= PRICE_BEST_MAX_TENTHS) return { word: t('price.best'), pill: t('price.bestPill'), color: PRICE_BEST_COLOR }
    if (tenths <= PRICE_GOOD_MAX_TENTHS) return { word: t('price.good'), pill: t('price.goodPill'), color: PRICE_GOOD_COLOR }
    if (tenths <= PRICE_FAIR_MAX_TENTHS) return { word: t('price.fair'), pill: t('price.fairPill'), color: PRICE_FAIR_COLOR }
    if (tenths <= PRICE_LOW_MAX_TENTHS) return { word: t('price.low'), pill: t('price.lowPill'), color: PRICE_LOW_COLOR }
    return { word: t('price.bad'), pill: t('price.badPill'), color: PRICE_BAD_COLOR }
}

// A small pill beside the recovery note, under the chart: smaller than the rate itself, coloured so it scans at a glance.
const priceVerdictPill = (rate: number) => {
    const verdict = priceVerdict(rate)
    return (
        <Label
            value={verdict.pill}
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
    layout: { width?: number | `${number}%`; height?: number; grow?: number; marginRight?: number; joined?: 'left' | 'right' } = {}
) => (
    <UiEntity
        uiTransform={{
            width: layout.width ?? '100%',
            ...(layout.height !== undefined ? { height: layout.height } : {}),
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
    // What the player is typing into the amount box, if anything.
    const oreDraft = getSellOreDraft()
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
                    <BitmapText value={t('bank.title')} fontSize={60} color={BANK_GOLD_LIGHT} />
                    <Label value={t('bank.subtitle')} fontSize={18} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ height: 24 }} />
                </UiEntity>
            </UiEntity>

            {/* Your ore on the left, the town's rate beside it: both stretch to the taller one. */}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: BANK_ROW_GAP } }}>
                {bankSection(
                    t('bank.youHave'),
                    bankAmount(ICON_ORE, ore, t('unit.oreCaps'), BANK_CREAM),
                    { width: 200, joined: 'left' }
                )}

                {bankSection(
                    t('bank.townRate'),
                    [
                        <UiEntity key="rate" uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center' }}>
                            <BitmapText value={t('bank.rateLine', { rate: formatRate(rate) })} fontSize={34} color={BANK_CREAM} />
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
                    t('bank.youReceive'),
                    bankAmount(ICON_COINS, payout, payout === 1 ? t('unit.coinCaps') : t('unit.coinsCaps'), COIN_COLOR),
                    { width: 200, joined: 'left' }
                )}

                {bankSection(
                    t('bank.sellAmount'),
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
                                {/* Tapping the amount lets the player type it. The input covers the box
                                    and stays empty until they type, so the bitmap amount shows through. */}
                                {oreDraft === null ? (
                                    <BitmapText value={t('bank.oreAmount', { amount })} fontSize={42} color={BANK_GOLD_LIGHT} align="center" />
                                ) : null}
                                <Input
                                    key={`ore-input-${getSellOreInputGeneration()}`}
                                    value={oreDraft ?? ''}
                                    // Every prop but value must stay the same while typing: changing one
                                    // re-sends the whole input with its stale value and eats the keystroke.
                                    placeholder=""
                                    fontSize={42}
                                    color={BANK_GOLD_LIGHT}
                                    textAlign="middle-center"
                                    uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
                                    uiBackground={{ color: Color4.Clear() }}
                                    onChange={typeSellOre}
                                    onSubmit={commitSellOre}
                                />
                            </UiEntity>
                            {bankButton('+10', () => changeSellCoins(1), { width: 96, height: 60 }, 36, BANK_STEP_COLOR, BANK_CREAM)}
                        </UiEntity>,
                        // The one place the minimum is stated: under the amount, quiet, always there.
                        <Label
                            key="minimum"
                            value={t('bank.minimum', { rate: formatRate(rate) })}
                            fontSize={15}
                            color={BANK_HINT}
                            textAlign="middle-center"
                            uiTransform={{ width: '100%', height: 20, margin: { top: 4 } }}
                        />,
                        <UiEntity key="quick" uiTransform={{ width: '100%', height: 52, flexDirection: 'row', justifyContent: 'space-between', margin: { top: 6 } }}>
                            {/* A share of the most the bag sells for, each always the same: 1/4 and 1/2
                                are figures, read the same in every language; MAX is translated. */}
                            {bankButton('1/4', () => setSellCoins(Math.floor(maxSellCoins() / 4)), { width: '32%', height: 50 }, 30, BANK_STEP_COLOR, BANK_CREAM)}
                            {bankButton('1/2', () => setSellCoins(Math.floor(maxSellCoins() / 2)), { width: '32%', height: 50 }, 30, BANK_STEP_COLOR, BANK_CREAM)}
                            {bankButton(t('bank.max'), () => setSellCoins(maxSellCoins()), { width: '32%', height: 50 }, 30, BANK_STEP_COLOR, BANK_CREAM)}
                        </UiEntity>
                    ],
                    { width: 0, grow: 1, joined: 'right' }
                )}
            </UiEntity>

            <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} />
            {bankButton(
                canSell ? t('bank.sellOre', { amount }) : t('bank.sell'),
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

// Coins owed to the player for something that went wrong (server/compensations.ts), in the bank's
// dress and signed by whoever owes them: The Bank or the Slot Machine. The button credits them; once it says CREDITED the screen can be closed, for good.
const compensationPanel = (offer: CompensationOffer) => {
    const claiming = isClaimingCompensation()
    const label = offer.claimed ? t('comp.credited') : claiming ? t('comp.crediting') : t('comp.claim', { coins: offer.coins })
    const live = !offer.claimed && !claiming
    const casino = offer.kind === 'casino'
    const sender = casino
        ? { icon: SLOT_SYMBOL_ICONS.bell, title: t('slots.title'), caption: t('comp.casinoCaption'), heading: t('comp.casinoHeading') }
        : { icon: ICON_BANK, title: t('bank.title'), caption: t('comp.bankCaption'), heading: t('comp.bankHeading') }
    const apology = casino
        ? t('comp.casinoApology', { date: offer.date, coins: offer.coins })
        : t('comp.bankApology', { date: offer.date, coins: offer.coins })

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
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
            <UiEntity uiTransform={{ width: '100%', height: 96, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                {bankIcon(sender.icon, 72)}
                <UiEntity uiTransform={{ flexDirection: 'column', alignItems: 'center' }}>
                    <BitmapText value={sender.title} fontSize={60} color={BANK_GOLD_LIGHT} />
                    <Label value={sender.caption} fontSize={18} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ height: 24 }} />
                </UiEntity>
            </UiEntity>

            {bankSection(sender.heading, [
                <Label
                    key="text"
                    value={apology}
                    fontSize={20}
                    color={BANK_CREAM}
                    textAlign="middle-left"
                    textWrap="wrap"
                    uiTransform={{ width: '100%', minHeight: 60, margin: { top: 4, bottom: 8 } }}
                />,
                <UiEntity key="amount" uiTransform={{ width: '100%', height: 80, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                    {bankIcon(ICON_COINS, 56)}
                    <BitmapText value={t('unit.coinsAmountCaps', { coins: offer.coins })} fontSize={52} color={COIN_COLOR} />
                </UiEntity>
            ])}

            <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} />
            {bankButton(
                label,
                live ? claimCompensation : () => {},
                { width: '100%', height: 72 },
                44,
                live ? BANK_GOLD : DISABLED_COLOR,
                live ? BANK_INK : MUTED_COLOR
            )}
            {offer.claimed ? (
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
                    onMouseDown={closeCompensation}
                />
            ) : null}
        </UiEntity>
    )
}

// The update screens (ui/server-outdated.ts), in the bank's dress. "Maintenance": an admin is about
// to deploy and nothing is saved, so the player waits; it cannot be closed. "Rejoin": the player
// is on an old version, and rejoining the world loads the current one.
//
// Rejoining differs by platform. On mobile the REJOIN button reconnects to the world. The desktop
// explorer refuses that ("You are already in ..."), and only a full restart of the client is sure
// to load the new version (deploy-scene skill: a scene reload keeps the cached one), so on desktop
// the screen lists the steps instead of offering a button.
const desktopRejoinSteps = () => [t('update.step1'), t('update.step2'), t('update.step3')]
/** The screen's paragraph: room for three wrapped lines. Each step gets a line of its own. */
const UPDATE_PARAGRAPH_HEIGHT = 84
const UPDATE_STEP_HEIGHT = 32

const updatePanel = (screen: 'maintenance' | 'rejoin') => {
    const rejoining = isRejoining()
    const desktop = !isMobile()
    const maintenance = screen === 'maintenance'
    const lost = !maintenance && getRejoinReason() === 'lost'
    // Up a minute and still waiting: the way out shows anyway, in case the new version's notice never arrives.
    const offerRejoin = !maintenance || canEscapeMaintenance()
    const why = maintenance
        ? t('update.whyMaintenance')
        : lost
          ? t('update.whyLost')
          : t('update.whyNewVersion')
    const what = !offerRejoin
        ? desktop
            ? t('update.waitDesktop')
            : t('update.waitMobile')
        : desktop
          ? t('update.toPlay')
          : didRejoinFail()
            ? t('update.rejoinFailed')
            : t('update.rejoinToPlay')
    // One Label per line: a Label does not grow to fit text with line breaks, so the steps would overlap.
    const steps = offerRejoin && desktop ? desktopRejoinSteps() : []
    const showRejoin = offerRejoin && !desktop
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
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
            <UiEntity uiTransform={{ width: '100%', height: 124, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <BitmapText value={maintenance ? t('update.updating') : lost ? t('update.reconnect') : t('update.newVersion')} fontSize={60} color={BANK_GOLD_LIGHT} />
                <Label value={maintenance ? t('update.backSoon') : lost ? t('update.stoppedAnswering') : t('update.wasUpdated')} fontSize={18} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ height: 24, margin: { top: 18 } }} />
            </UiEntity>

            {bankSection(!offerRejoin ? t('update.pleaseWait') : desktop ? t('update.howToRejoin') : t('update.pleaseRejoin'), [
                <Label
                    key="text"
                    value={`${why} ${what}`}
                    fontSize={20}
                    color={BANK_CREAM}
                    textAlign="top-left"
                    textWrap="wrap"
                    uiTransform={{ width: '100%', height: UPDATE_PARAGRAPH_HEIGHT, margin: { top: 4 } }}
                />,
                ...steps.map((step) => (
                    <Label
                        key={step}
                        value={step}
                        fontSize={22}
                        color={BANK_GOLD_LIGHT}
                        textAlign="middle-left"
                        textWrap="nowrap"
                        uiTransform={{ width: '100%', height: UPDATE_STEP_HEIGHT, margin: { left: 12 } }}
                    />
                )),
                steps.length > 0 ? (
                    <Label
                        key="safe"
                        value={t('update.progressSafe')}
                        fontSize={18}
                        color={BANK_CAPTION}
                        textAlign="middle-left"
                        uiTransform={{ width: '100%', height: UPDATE_STEP_HEIGHT, margin: { top: 6, bottom: 8 } }}
                    />
                ) : (
                    <UiEntity key="gap" uiTransform={{ width: '100%', height: 8 }} />
                )
            ])}

            {showRejoin ? <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} /> : null}
            {!showRejoin
                ? null
                : bankButton(
                      rejoining ? t('update.rejoining') : t('update.rejoin'),
                      rejoining ? () => {} : rejoinWorld,
                      { width: '100%', height: 72 },
                      44,
                      rejoining ? DISABLED_COLOR : BANK_GOLD,
                      rejoining ? MUTED_COLOR : BANK_INK
                  )}
            {maintenance && amAdmin() ? <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} /> : null}
            {maintenance && amAdmin()
                ? bankButton('END MAINTENANCE', () => sendAdminMaintenance(false), { width: '100%', height: 56 }, 28, STEP_BUTTON_COLOR, Color4.White())
                : null}
            {maintenance ? null : (
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
                    onMouseDown={closeServerOutdated}
                />
            )}
        </UiEntity>
    )
}

// --- Admin: maintenance before a deploy ---------------------------------------------------
//
// Only for the wallets in shared/admins.ts (the server checks again), in the bug-report menu. Two
// taps, like the reset tool: the first arms it for a few seconds, the second sends it.

const MAINTENANCE_CONFIRM_SECONDS = 4
let maintenanceArmedUntil = 0
let myAddressForAdmin = ''

function amAdmin(): boolean {
    if (myAddressForAdmin === '') myAddressForAdmin = (getPlayer()?.userId ?? '').toLowerCase()
    return myAddressForAdmin !== '' && isAdmin(myAddressForAdmin)
}

/** In the bug-report menu, under REPORT A BUG. Stays open on the first tap so the second can confirm. */
const adminMaintenanceRow = () => {
    if (!amAdmin() || isMaintenanceOn()) return null
    const armed = uiClock < maintenanceArmedUntil
    return (
        <UiEntity
            key="maintenance"
            uiTransform={{
                width: '100%',
                height: FEEDBACK_MENU_ROW_HEIGHT,
                margin: { top: FEEDBACK_MENU_GAP },
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 2,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: armed ? MAGENTA : STEP_BUTTON_COLOR }}
            onMouseDown={() => {
                if (!armed) {
                    maintenanceArmedUntil = uiClock + MAINTENANCE_CONFIRM_SECONDS
                    return
                }
                maintenanceArmedUntil = 0
                feedbackMenuOpen = false
                sendAdminMaintenance(true)
            }}
        >
            <BitmapText value={armed ? 'TAP AGAIN' : 'MAINTENANCE'} fontSize={22} color={Color4.White()} />
        </UiEntity>
    )
}

// --- Admin: Marketplace Credits campaign (server/credits-campaign.ts) ---------------------
//
// Under MAINTENANCE, for admins only: the campaign's figures from the server, and a button that
// copies the winners (wallets that finished day 2) as CSV. Start, end and the soft cap are edited
// at decentraland.org/storage, scene key `credits-1-config`.

/** How long the button says COPIED after the winners land on the clipboard. */
const WINNERS_COPIED_MS = 3000

const adminCampaignRow = () => {
    const campaign = getCampaignAdmin()
    if (!amAdmin() || campaign === null) return null
    const known = campaign.reserved >= 0
    const summary = `Credits ${campaign.open ? 'OPEN' : 'closed'} · ${known ? `${campaign.reserved} reserved · ${campaign.claimed}/${campaign.softCap} won` : 'reading...'}`
    const copied = getWinnersCopied()
    const justCopied = Date.now() - copied.at < WINNERS_COPIED_MS
    return (
        <UiEntity key="campaign" uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: FEEDBACK_MENU_GAP } }}>
            <Label value={summary} fontSize={14} color={MUTED_COLOR} textAlign="middle-center" uiTransform={{ width: '100%', height: 20 }} />
            <UiEntity
                uiTransform={{
                    width: '100%',
                    height: FEEDBACK_MENU_ROW_HEIGHT,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: BANK_TRIM
                }}
                uiBackground={{ color: STEP_BUTTON_COLOR }}
                onMouseDown={() => sendAdminCampaignWinners()}
            >
                <UiEntity uiTransform={{ width: 28, height: 28, margin: { right: 8 }, flexShrink: 0 }} uiBackground={iconBackground(ICON_CREDITS)} />
                <BitmapText value={justCopied ? `COPIED ${copied.count}` : 'COPY WINNERS'} fontSize={22} color={Color4.White()} />
            </UiEntity>
        </UiEntity>
    )
}

const TILE_COLOR =Color4.create(0.16, 0.16, 0.18, 1)
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
const STORE_CARDS_PER_PAGE = 5
const STORE_CARD_ICON = 42
const STORE_DETAIL_ICON = 130
/** A detail's picture when it takes half the pane (Detail.bigIcon): fits half of the narrowest panel. */
const STORE_DETAIL_BIG_ICON = 190
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

/** "1 COIN" / "1,000 COINS". */
function coinsCaps(amount: number): string {
    return amount === 1 ? t('slots.oneCoin') : t('unit.coinsAmountCaps', { coins: withCommas(amount) })
}

/** 1000 → "1,000". */
function withCommas(value: number): string {
    return `${Math.round(value)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A pick's durability as rocks left of rocks it starts with: "173 / 200". */
function durabilityText(pick: ShopItem): string {
    return `${getDurability(pick.id)} / ${pick.durability ?? 0}`
}

/** Red once a pick is down to its last tenth, so a break does not come out of nowhere. */
function durabilityColor(pick: ShopItem, normal: Color4): Color4 {
    return getDurability(pick.id) <= (pick.durability ?? 0) * 0.1 ? SHORT_COLOR : normal
}

// What the detail panel says about each pick, beyond the catalogue's numbers.
const PICK_COPY: Record<string, { readonly description: string; readonly benefits: string[] }> = {
    pick: {
        get description() { return t('pick.basic.description') },
        get benefits() { return [t('pick.basic.benefit1'), t('pick.basic.benefit2')] }
    },
    'steel-pick': {
        get description() { return t('pick.steel.description') },
        get benefits() { return [t('pick.steel.benefit1'), t('pick.steel.benefit2')] }
    },
    'miners-pick': {
        get description() { return t('pick.master.description') },
        get benefits() { return [t('pick.master.benefit1'), t('pick.master.benefit2')] }
    }
}

// --- Products ---

type ProductKey = ShopItemId | 'fuel' | 'storage' | 'horse' | 'revolver' | 'dynamite' | `reward:${string}` | 'credits'

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

// Getters, not plain text: the objects are compared by identity, and the text follows the language.
const STATUS_EQUIPPED: Status = { get text() { return t('status.equipped') }, color: PRICE_GOOD_COLOR }
const STATUS_LOCKED: Status = { get text() { return t('status.locked') }, color: MUTED_COLOR }
const STATUS_BUY: Status = { get text() { return t('status.buy') }, color: BANK_GOLD_LIGHT }
const STATUS_UPGRADE: Status = { get text() { return t('status.upgrade') }, color: BANK_GOLD_LIGHT }
const STATUS_SOON: Status = { get text() { return t('status.comingSoon') }, color: MUTED_COLOR }

function ownedStatus(count: number): Status {
    return { text: count > 1 ? t('status.ownedCount', { count }) : t('status.owned'), color: BANK_CREAM }
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
        title: itemName(pick),
        icon: PICK_ICONS[pick.id] ?? ICON_PICK_IRON,
        hint: pick.price > 0 ? t('store.coinsPrice', { price: pick.price }) : t('store.free'),
        status: pickStatus(pick),
        muted: false
    }))
    const mule = itemsOf('mule')[0]
    const nextStorage = nextTier('storage', (id) => getOwned(id))
    return [
        ...picks,
        {
            key: 'mule',
            title: itemName(mule),
            icon: ICON_MULE,
            hint: t('store.coinsPrice', { price: mule.price }),
            status: mules > 0 ? ownedStatus(mules) : STATUS_BUY,
            muted: false
        },
        { key: 'fuel', title: t('store.fuel'), icon: ICON_FUEL, hint: t('store.coinsPerGallon', { price: FUEL_PRICE_PER_GALLON }), status: mules > 0 ? null : STATUS_LOCKED, muted: false },
        { key: 'storage', title: t('store.storage'), icon: ICON_WAREHOUSE, hint: nextStorage !== null ? t('store.coinsPrice', { price: nextStorage.price }) : t('store.maxLevel'), status: null, muted: false },
        { key: 'dynamite', title: t('store.dynamite'), icon: ICON_DYNAMITE, hint: '', status: STATUS_SOON, muted: true },
        { key: 'horse', title: t('store.horse'), icon: ICON_HORSE, hint: '', status: STATUS_SOON, muted: true },
        { key: 'revolver', title: t('store.revolver'), icon: ICON_REVOLVER, hint: '', status: STATUS_SOON, muted: true }
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
            <BitmapText value={upper(product.title)} fontSize={19} color={product.muted ? MUTED_COLOR : BANK_CREAM} />
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

/** 'danger' is live like 'buy', but red: for what gives something up, like selling a home. */
type Action = { label: string; kind: 'buy' | 'equip' | 'equipped' | 'off' | 'danger'; onClick?: () => void }

const storeActionButton = (action: Action) => {
    const live = action.kind === 'buy' || action.kind === 'equip' || action.kind === 'danger'
    const background = action.kind === 'equipped' ? EQUIPPED_COLOR : action.kind === 'danger' ? MAP_CLOSE_COLOR : live ? BANK_GOLD : DISABLED_COLOR
    const text = action.kind === 'equipped' ? EQUIPPED_TEXT : action.kind === 'danger' ? Color4.White() : live ? BANK_INK : MUTED_COLOR
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
function priceStat(price: number | null, label: string = t('store.price')): ReactEcs.JSX.Element {
    if (price === null) return detailStat(label, '-', MUTED_COLOR)
    if (price === 0) return detailStat(label, t('store.freeCaps'), COIN_COLOR)
    return (
        <UiEntity key={label} uiTransform={{ flexDirection: 'column', margin: { bottom: 10 } }}>
            <Label value={label} fontSize={14} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 20 }} />
            {coinAmount(price, getCoins() >= price ? COIN_COLOR : SHORT_COLOR, 28)}
        </UiEntity>
    )
}

/** The buy action for an item: live when it can be bought, off (price still shown above) when not. */
function buyAction(item: ShopItem, label: string = t('action.buy')): Action {
    const why = whyUnavailable(item)
    if (why !== null) return { label: t('action.locked'), kind: 'off' }
    return { label, kind: buyBlocker(item) === null ? 'buy' : 'off', onClick: () => buyItem(item.id) }
}

/** The pieces of one product's detail: what it is, its numbers, and what you can do. */
type Detail = {
    title: string
    description: string
    icon: Icon
    stats: ReactEcs.JSX.Element[]
    notes: ReactEcs.JSX.Element[]
    actions: ReactEcs.JSX.Element[]
    /** Two halves: a big picture on the left, the stats and notes on the right. */
    bigIcon?: boolean
    /** A layout of its own in place of the icon, stats and notes (the Credits tab). */
    body?: ReactEcs.JSX.Element
    /** A quiet line under the action, centred. */
    footnote?: string
}

function pickDetail(item: ShopItem): Detail {
    const copy = PICK_COPY[item.id]
    const status = pickStatus(item)
    let action: Action
    if (status === STATUS_EQUIPPED) action = { label: t('action.equipped'), kind: 'equipped' }
    else if (getOwned(item.id) > 0) action = { label: t('action.equip'), kind: 'equip', onClick: () => sendEquip(item.id) }
    else if (item.starter === true) action = { label: t('action.locked'), kind: 'off' }
    else action = buyAction(item)

    const notes = copy.benefits.map((benefit) => detailNote(`• ${benefit}`))
    if (getOwned(item.id) <= 0 && item.starter === true) notes.push(detailNote(t('store.freeFromMayor'), BANK_CAPTION))
    else if (getOwned(item.id) <= 0 && item.requires !== undefined && getOwned(item.requires) <= 0) {
        notes.push(detailNote(t('store.requires', { item: itemName(findItem(item.requires)) }), SHORT_COLOR))
    }
    return {
        title: itemName(item),
        description: copy.description,
        icon: PICK_ICONS[item.id] ?? ICON_PICK_IRON,
        stats: [
            priceStat(item.price),
            detailStat(t('store.breaksRockIn'), t('store.hitsCaps', { hits: item.hitsPerRock ?? 0 }), BANK_CREAM),
            // Owned: what is left. Not owned: what a new one lasts.
            getOwned(item.id) > 0
                ? detailStat(t('store.durability'), t('store.rocksCaps', { rocks: durabilityText(item) }), durabilityColor(item, BANK_CREAM))
                : detailStat(t('store.lasts'), t('store.rocksCaps', { rocks: item.durability ?? 0 }), BANK_CREAM)
        ],
        notes,
        actions: [storeActionButton(action)]
    }
}

function muleDetail(): Detail {
    const mule = itemsOf('mule')[0]
    const mules = getMuleCount()
    return {
        title: itemName(mule),
        description: t('mule.description'),
        icon: ICON_MULE,
        stats: [priceStat(mule.price), detailStat(t('mule.produces'), t('mule.perDayCaps', { ore: 200 }), BANK_CREAM)],
        notes: [
            detailNote(`• ${t('mule.note.storage')}`),
            detailNote(`• ${t('mule.note.fuel')}`),
            detailNote(
                mules >= MULE_MAX_COUNT ? t('mule.ownMax', { count: mules }) : mules > 0 ? t('mule.own', { count: mules }) : t('mule.ownNone'),
                BANK_CAPTION
            )
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
            <BitmapText value={upper(itemName(item))} fontSize={24} color={BANK_CREAM} uiTransform={{ width: 170 }} />
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
                <BitmapText value={t('action.buy')} fontSize={22} color={live ? BANK_INK : MUTED_COLOR} />
            </UiEntity>
        </UiEntity>
    )
}

// The store sells fuel as a resource: gallons and their price. How long they keep the rigs
// running is the M.U.L.E. panel's business.
function fuelDetail(): Detail {
    const mules = getMuleCount()
    const description = t('fuel.description')
    if (mules <= 0) {
        return {
            title: t('store.fuel'),
            description,
            icon: ICON_FUEL,
            stats: [detailStat(t('store.price'), t('fuel.pricePerGallonCaps', { price: FUEL_PRICE_PER_GALLON }), BANK_CREAM)],
            notes: [detailNote(t('fuel.requiresMule'), SHORT_COLOR)],
            actions: [storeActionButton({ label: t('action.locked'), kind: 'off' })]
        }
    }
    return {
        title: t('store.fuel'),
        description,
        icon: ICON_FUEL,
        stats: [
            detailStat(t('store.price'), t('fuel.pricePerGallonCaps', { price: FUEL_PRICE_PER_GALLON }), BANK_CREAM),
            detailStat(t('fuel.inTank'), t('fuel.tankGallonsCaps', { now: Math.floor(fuelGallonsNow()), tank: fuelTankGallons(mules) }), BANK_CREAM)
        ],
        notes: [detailNote(t('fuel.rule'), BANK_CAPTION)],
        actions: itemsOf('fuel').map(fuelOption)
    }
}

function storageDetail(): Detail {
    const next = nextTier('storage', (id) => getOwned(id))
    const stats = [detailStat(t('storage.current'), t('storage.oreCaps', { ore: withCommas(getCarryCapacity()) }), BANK_CREAM)]
    if (next !== null) stats.push(detailStat(t('storage.nextUpgrade'), t('storage.oreCaps', { ore: withCommas(next.storage ?? 0) }), BANK_CREAM), priceStat(next.price))
    return {
        title: next !== null ? itemName(next) : t('store.storage'),
        description: t('storage.description'),
        icon: ICON_WAREHOUSE,
        stats,
        notes: [detailNote(t('storage.storedNow', { ore: withCommas(getOre()) }), BANK_CAPTION)],
        actions: [storeActionButton(next === null ? { label: t('action.maxCapacity'), kind: 'off' } : buyAction(next))]
    }
}

function comingSoonDetail(title: string, icon: Icon): Detail {
    return {
        title,
        description: t('store.onItsWay'),
        icon,
        stats: [],
        notes: [],
        actions: [storeActionButton({ label: t('action.comingSoon'), kind: 'off' })]
    }
}

function detailFor(key: ProductKey): Detail {
    if (key === 'mule') return muleDetail()
    if (key === 'fuel') return fuelDetail()
    if (key === 'storage') return storageDetail()
    if (key === 'horse') return comingSoonDetail(t('store.horse'), ICON_HORSE)
    if (key === 'revolver') return comingSoonDetail(t('store.revolver'), ICON_REVOLVER)
    if (key === 'dynamite') return comingSoonDetail(t('store.dynamite'), ICON_DYNAMITE)
    const pick = findItem(key as ShopItemId)
    return pick !== null && pick.line === 'pick' ? pickDetail(pick) : pickDetail(PICKS[0])
}

const storeDetail = (detail: Detail, besideList: boolean = true) => (
    <UiEntity
        uiTransform={{
            flexGrow: 1,
            width: 0,
            flexDirection: 'column',
            padding: detail.body !== undefined ? 14 : 18,
            margin: { left: besideList ? 12 : 0 },
            borderRadius: PANEL_RADIUS,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <BitmapText value={upper(detail.title)} fontSize={40} color={BANK_GOLD_LIGHT} />
        <Label value={detail.description} fontSize={16} color={BANK_CAPTION} textAlign="middle-left" uiTransform={{ height: 26 }} />
        {detail.body !== undefined ? (
            detail.body
        ) : detail.bigIcon === true ? (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: 12 } }}>
                {/* Against the text, not centred in its half: centred left a gap as wide as the pane allows. */}
                <UiEntity uiTransform={{ width: '50%', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <UiEntity
                        uiTransform={{ width: STORE_DETAIL_BIG_ICON, height: STORE_DETAIL_BIG_ICON, flexShrink: 0 }}
                        uiBackground={iconBackground(detail.icon)}
                    />
                </UiEntity>
                <UiEntity uiTransform={{ width: '50%', flexDirection: 'column', padding: { left: 18 } }}>
                    {detail.stats}
                    {detail.notes}
                </UiEntity>
            </UiEntity>
        ) : (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', margin: { top: 12 } }}>
                <UiEntity
                    uiTransform={{ width: STORE_DETAIL_ICON, height: STORE_DETAIL_ICON, margin: { right: 18 }, flexShrink: 0 }}
                    uiBackground={iconBackground(detail.icon)}
                />
                <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'column' }}>{detail.stats}</UiEntity>
            </UiEntity>
        )}
        {detail.bigIcon === true || detail.body !== undefined ? null : (
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: 6 } }}>{detail.notes}</UiEntity>
        )}
        {/* The action sits at the bottom, however much the product above has to say. */}
        <UiEntity uiTransform={{ flexGrow: 1 }} />
        {detail.actions}
        {detail.footnote !== undefined ? (
            <Label value={detail.footnote} fontSize={14} color={BANK_CAPTION} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: 22, margin: { top: 6 } }} />
        ) : null}
    </UiEntity>
)

// The store's shelves: tools are what you dig with by hand (picks, dynamite), upgrades grow the
// operation (rigs, their fuel, storage), gear is the rest of a westerner's kit (horse, revolver).
type StoreTab = 'tools' | 'upgrades' | 'gear'

const STORE_TABS: { id: StoreTab; readonly label: string }[] = [
    { id: 'tools', get label() { return t('tab.tools') } },
    { id: 'upgrades', get label() { return t('tab.upgrades') } },
    { id: 'gear', get label() { return t('tab.gear') } }
]

function storeTabOf(key: string): StoreTab {
    if (key === 'fuel' || key === 'storage' || key === 'mule') return 'upgrades'
    if (key === 'horse' || key === 'revolver') return 'gear'
    return 'tools'
}

const storePanel = () => {
    const key = selectedProductKey()
    // The tab open is the selected card's, so a tab is opened by selecting a card on it: the pick in
    // use for Tools, the first card for the rest.
    const tab = storeTabOf(key)
    const all = storeProducts()
    const openTab = (target: StoreTab) => {
        if (target === tab) return
        const pickInUse = activePick((id) => getOwned(id), getEquipped())?.id
        const first = all.find((product) => storeTabOf(product.key) === target)
        if (first !== undefined) selectProduct(target === 'tools' && pickInUse !== undefined ? pickInUse : first.key)
    }
    const tabs = STORE_TABS.map((storeTab) => tabButton(storeTab.id, storeTab.label, storeTab.id === tab, () => openTab(storeTab.id)))
    const products = all.filter((product) => storeTabOf(product.key) === tab)
    return counterPanel(t('store.title'), closeStorePanel, products, key, selectProduct, detailFor(key), tabs)
}

/**
 * The frame the store and the Land Office share: title, purse, close, cards on the left, detail on
 * the right. With tabs, the cards and the detail stand in the box under them.
 */
/** The player's coins, under a panel's title: on mobile the panel covers the HUD that shows them. */
const coinPurse = () => (
    <UiEntity
        uiTransform={{ height: 44, flexDirection: 'row', alignItems: 'center', flexShrink: 0, padding: { left: 8, right: 14 }, margin: { top: 6 }, borderRadius: 22 }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <UiEntity uiTransform={{ width: 34, height: 34, margin: { right: 8 } }} uiBackground={iconBackground(ICON_COINS)} />
        <BitmapText value={t('unit.coinsAmountCaps', { coins: withCommas(getCoins()) })} fontSize={26} color={COIN_COLOR} />
    </UiEntity>
)

const counterPanel = (
    title: string,
    onClose: () => void,
    products: Product[],
    key: string,
    onSelect: (key: string) => void,
    detail: Detail,
    tabs?: ReactEcs.JSX.Element[],
    /** The purse under the title: off where nothing is sold (the Claim Office). */
    showCoins: boolean = true,
    /** The cards' column: narrower where the cards say little (the Claim Office). */
    listWidth: number = STORE_LIST_WIDTH
) => {
    const content = counterContent(products, key, onSelect, detail, listWidth)
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
                {showCoins ? coinPurse() : null}
                <Button
                    value="X"
                    fontSize={30}
                    color={Color4.White()}
                    uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                    uiBackground={{ color: MAP_CLOSE_COLOR }}
                    onMouseDown={onClose}
                />
            </UiEntity>

            {tabs !== undefined ? tabbedBox(tabs, content, true) : content}
        </UiEntity>
    )
}

/** Cards on the left, a page at a time, and the selected one's detail on the right. No cards: the
 *  detail alone, as tall as a page of cards so switching tabs does not resize the panel. */
const counterContent = (products: Product[], key: string, onSelect: (key: string) => void, detail: Detail, listWidth: number) => {
    if (products.length === 0) {
        return (
            <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row', minHeight: STORE_CARDS_PER_PAGE * (STORE_CARD_HEIGHT + STORE_CARD_GAP) }}>
                {storeDetail(detail, false)}
            </UiEntity>
        )
    }
    // The page is wherever the selected card is, so a page turn selects that page's first card and
    // the panel always opens on the page of what it shows.
    const pages = Math.ceil(products.length / STORE_CARDS_PER_PAGE)
    const page = Math.floor(Math.max(0, products.findIndex((product) => product.key === key)) / STORE_CARDS_PER_PAGE)
    const firstCard = page * STORE_CARDS_PER_PAGE
    const turnTo = (target: number) => onSelect(products[target * STORE_CARDS_PER_PAGE].key)
    return (
        // On mobile, fills what the header leaves, so the detail's action sits at the bottom of the screen.
        <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'row' }}>
            <UiEntity uiTransform={{ width: listWidth, flexShrink: 0, flexDirection: 'column' }}>
                {/* As tall as a full page, so the arrows stay put on a shorter one. */}
                <UiEntity uiTransform={{ width: '100%', height: STORE_CARDS_PER_PAGE * (STORE_CARD_HEIGHT + STORE_CARD_GAP), flexShrink: 0, flexDirection: 'column' }}>
                    {products.slice(firstCard, firstCard + STORE_CARDS_PER_PAGE).map((product) => storeCard(product, product.key === key, onSelect))}
                </UiEntity>
                {pages > 1 ? (
                    <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {pageButton('<', page > 0, () => turnTo(page - 1))}
                        <Label value={`${page + 1}/${pages}`} fontSize={16} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ width: 60, height: 44 }} />
                        {pageButton('>', page < pages - 1, () => turnTo(page + 1))}
                    </UiEntity>
                ) : null}
            </UiEntity>
            {storeDetail(detail)}
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

const STATUS_ACTIVE: Status = { get text() { return t('status.active') }, color: PRICE_GOOD_COLOR }
const STATUS_PREVIOUS: Status = { get text() { return t('status.previous') }, color: MUTED_COLOR }

/** The home the player lives in: the best property owned. */
function activeHome(): ShopItem | null {
    return ownedTier('housing', (id) => getOwned(id))
}

function propertyStatus(item: ShopItem): Status {
    if (item.id === activeHome()?.id) return STATUS_ACTIVE
    if (getOwned(item.id) > 0) return STATUS_PREVIOUS
    return whyUnavailable(item) === null ? STATUS_UPGRADE : STATUS_LOCKED
}

function landOfficeProducts(): Product[] {
    return itemsOf('housing').map((item) => ({
        key: item.id,
        title: itemName(item),
        icon: PROPERTY_ICONS[item.id] ?? ICON_WAGON,
        hint: listPrice(item) > 0 ? t('store.coinsPrice', { price: withCommas(listPrice(item)) }) : t('store.free'),
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

/** The home the WARNING screen is about to sell, or null while it is shut. */
let sellWarningFor: ShopItemId | null = null

/** Sell to the bank, in red so it never reads as a purchase: it only opens the WARNING screen. */
function sellHomeAction(offer: { item: ShopItem; coins: number }): Action {
    return { label: t('land.sellToBank'), kind: 'danger', onClick: () => (sellWarningFor = offer.item.id) }
}

/**
 * Over the Land Office: what selling the home means, spelled out, before anything is sold.
 * CANCEL is the gold one, the easy way out; selling takes the red button.
 */
const sellWarningPanel = () => {
    const offer = homeBuyback()
    // Sold, moved up, or the office closed: the screen has nothing left to ask.
    if (offer === null || offer.item.id !== sellWarningFor || !isLandOfficePanelOpen()) {
        sellWarningFor = null
        return null
    }
    const below = itemName(findItem(offer.item.requires!))
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                width: '100%',
                minWidth: PANEL_MIN_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: MAP_CLOSE_COLOR
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <UiEntity uiTransform={{ width: '100%', height: 96, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <BitmapText value={t('land.warningTitle')} fontSize={64} color={STORAGE_FULL_COLOR} />
                <Label value={t('land.title')} fontSize={18} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ height: 24 }} />
            </UiEntity>

            {bankSection(t('land.warningHeading', { home: itemName(offer.item) }), [
                <Label
                    key="text"
                    value={t('land.warningText', { home: itemName(offer.item), below })}
                    fontSize={20}
                    color={BANK_CREAM}
                    textAlign="middle-left"
                    textWrap="wrap"
                    uiTransform={{ width: '100%', minHeight: 90, margin: { top: 4, bottom: 8 } }}
                />,
                <UiEntity key="amount" uiTransform={{ width: '100%', height: 80, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                    {bankIcon(ICON_COINS, 56)}
                    <BitmapText value={t('unit.coinsAmountCaps', { coins: withCommas(offer.coins) })} fontSize={52} color={COIN_COLOR} />
                </UiEntity>
            ])}

            <UiEntity uiTransform={{ width: '100%', height: BANK_BUTTON_GAP }} />
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between' }}>
                {bankButton(t('land.warningCancel'), () => (sellWarningFor = null), { width: '48%', height: 72 }, 40, BANK_GOLD, BANK_INK)}
                {bankButton(
                    t('land.warningSell'),
                    () => {
                        sellWarningFor = null
                        sendSellHome(offer.item.id)
                    },
                    { width: '48%', height: 72 },
                    40,
                    MAP_CLOSE_COLOR,
                    Color4.White()
                )}
            </UiEntity>
        </UiEntity>
    )
}

function propertyDetail(item: ShopItem): Detail {
    const owned = getOwned(item.id) > 0
    const active = item.id === activeHome()?.id
    const offer = active ? homeBuyback() : null
    let action: Action
    if (offer !== null) action = sellHomeAction(offer)
    else if (active) action = { label: t('action.active'), kind: 'equipped' }
    else if (owned) action = { label: t('action.previous'), kind: 'off' }
    // A new home replaces the old one: the player moves up, they do not end up with two.
    else action = buyAction(item, t('action.upgrade'))

    const notes: ReactEcs.JSX.Element[] = []
    if (active) {
        notes.push(detailNote(t('land.currentHome'), PRICE_GOOD_COLOR))
        if (offer !== null) notes.push(detailNote(t('land.sellHint', { coins: withCommas(offer.coins) }), BANK_CAPTION))
    } else if (owned) notes.push(detailNote(t('land.movedUp'), BANK_CAPTION))
    else if (item.requires !== undefined && getOwned(item.requires) <= 0) notes.push(detailNote(t('store.requires', { item: itemName(findItem(item.requires)) }), SHORT_COLOR))
    return {
        title: itemName(item),
        description: itemBenefit(item),
        icon: PROPERTY_ICONS[item.id] ?? ICON_WAGON,
        stats: [priceStat(listPrice(item))],
        notes,
        actions: [storeActionButton(action)]
    }
}

const landOfficePanel = () => {
    const key = selectedPropertyKey()
    return counterPanel(t('land.title'), closeLandOfficePanel, landOfficeProducts(), key, selectProperty, propertyDetail(findItem(key)!))
}

// --- Claim Office -----------------------------------------------------------------------
//
// The Land Office's layout with one card per reward campaign (shared/rewards.ts): its quest as a
// checklist, and a Claim that comes alive once every step is met. The server checks them again
// and asks the Rewards service; only its yes turns the button to Claimed.

const GIFT_DONE_COLOR = PRICE_GOOD_COLOR
const GIFT_TODO_COLOR = BANK_CREAM

const rewardKey = (campaign: RewardCampaign): ProductKey => `reward:${campaign.id}`

const CLAIM_CAMPAIGNS = rewardCampaignsAt('claim')

/** The card picked in Collectibles: the first campaign until the player picks another. */
let selectedRewardId = CLAIM_CAMPAIGNS[0].id

function selectedReward(): RewardCampaign {
    return CLAIM_CAMPAIGNS.find((campaign) => campaign.id === selectedRewardId) ?? CLAIM_CAMPAIGNS[0]
}

/** Atlas icons for the items without a thumbnail of their own, by campaign id. */
const REWARD_ICONS: Record<string, Icon> = {
    'claim-bite-mining': ICON_ORE
}

/** The item's thumbnail when one is set, else its atlas icon, else the gift box. */
function giftIcon(campaign: RewardCampaign): Icon {
    if (campaign.thumbnail !== '') return { src: campaign.thumbnail, uvs: [0, 0, 0, 1, 1, 1, 1, 0] }
    return REWARD_ICONS[campaign.id] ?? ICON_GIFT
}

/** No "Locked" while the quest is under way: the card's Quest x/3 already says where it stands. */
function giftCardStatus(campaign: RewardCampaign): Status | null {
    if (getRewardStatus(campaign.id).claimed) return { text: t('status.claimed'), color: PRICE_GOOD_COLOR }
    return canClaimReward(campaign.id) ? { text: t('status.readyToClaim'), color: BANK_GOLD_LIGHT } : null
}

const CREDITS_KEY: ProductKey = 'credits'
/** The cards' column, a quarter narrower than the store's: the detail gets the room. */
const CLAIM_LIST_WIDTH = Math.round(STORE_LIST_WIDTH * 0.75)

// Collectibles are the wearables; Credits is a placeholder for now.
type ClaimTab = 'collectibles' | 'credits'
const CLAIM_TABS: { id: ClaimTab; readonly label: string }[] = [
    { id: 'collectibles', get label() { return t('tab.collectibles') } },
    { id: 'credits', get label() { return t('tab.credits') } }
]
let claimTab: ClaimTab = 'collectibles'

function claimOfficeProducts(): Product[] {
    // Quest x/3 while under way; Ready to claim / Claimed take its place after.
    return CLAIM_CAMPAIGNS.map((campaign) => {
        const status = giftCardStatus(campaign)
        const hint = status === null ? t('claim.questProgress', { done: giftStepsDone(campaign), total: campaign.steps.length }) : ''
        return { key: rewardKey(campaign), title: rewardText(campaign, 'cardTitle'), icon: giftIcon(campaign), hint, status, muted: false }
    })
}

// The Marketplace Credits campaign (shared/credits-campaign.ts): the server counts and decides, this
// only shows where the player stands. Nothing to press: the claim happens by itself on day 2's last rock.

/** The tracker's More info: the Claim Office, on its Credits tab, from anywhere. */
function openCreditsRewards(): void {
    claimTab = 'credits'
    if (!isClaimOfficePanelOpen()) toggleClaimOfficeFromButton()
}

/** "2d 5h", "5h 20m" or "12m": time left to something. */
function creditsCountdown(ms: number): string {
    const minutes = Math.max(1, Math.ceil(ms / 60000))
    const hours = Math.floor(minutes / 60)
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

// The Credits tab's own layout: the reward on the left (35%), one card per day on the right (65%).
const CREDITS_REWARD_ICON = 96
const CREDITS_DAY_CHECK = 26
const CREDITS_DAY_DONE_BACKGROUND = Color4.create(0.2, 0.32, 0.1, 0.55)
const CREDITS_DAY_DONE_BORDER = Color4.create(0.45, 0.6, 0.2, 1)
const CREDITS_DAY_BACKGROUND = Color4.create(0, 0, 0, 0.22)

/** "opens in 5h" to "Opens in 5h": the second line of a card starts a sentence. */
function capitalised(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/** One day of the quest: a checkbox, what to do in large text, and where it stands in a second line. */
const creditsDayCard = (done: boolean, label: string, status: string, statusColor: Color4, first: boolean) => (
    <UiEntity
        key={label}
        uiTransform={{
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 10, right: 10, top: 8, bottom: 8 },
            margin: { top: first ? 0 : 8 },
            borderRadius: 8,
            borderWidth: 2,
            borderColor: done ? CREDITS_DAY_DONE_BORDER : BANK_TRIM
        }}
        uiBackground={{ color: done ? CREDITS_DAY_DONE_BACKGROUND : CREDITS_DAY_BACKGROUND }}
    >
        <UiEntity
            uiTransform={{ width: CREDITS_DAY_CHECK, height: CREDITS_DAY_CHECK, margin: { right: 10 }, flexShrink: 0 }}
            uiBackground={iconBackground(done ? ICON_CHECKED : ICON_BULLET)}
        />
        <UiEntity uiTransform={{ flexGrow: 1, width: 0, flexDirection: 'column' }}>
            <Label value={label} fontSize={20} color={done ? GIFT_DONE_COLOR : BANK_CREAM} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 28 }} />
            <Label value={status} fontSize={16} color={statusColor} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 22 }} />
        </UiEntity>
    </UiEntity>
)

function creditsDetail(): Detail {
    const campaign = getCampaignStatus()
    if (campaign === null) {
        return {
            title: t('tab.credits'),
            description: t('claim.creditsSoon'),
            icon: ICON_CREDITS,
            stats: [],
            notes: [],
            actions: [storeActionButton({ label: t('action.comingSoon'), kind: 'off' })]
        }
    }
    const { phase, goal, credits } = campaign
    const now = Date.now()
    const rocks = t('obj.creditsRocks', { rocks: phase === 'soon' ? 0 : campaign.rocks, goal })
    const completed = t('claim.creditsCompleted')
    // Not started yet: the same layout, counting down to the start instead of the end.
    const soon = phase === 'soon'

    // Day 1: done once reserved; counting while on it; too late on the campaign's last day.
    const day1Done = phase === 'reserved' || phase === 'day2' || phase === 'claimed'
    const day1Status = day1Done ? completed : phase === 'late' ? t('claim.creditsLate') : rocks
    const day1Color = day1Done ? GIFT_DONE_COLOR : phase === 'late' ? SHORT_COLOR : BANK_GOLD_LIGHT

    // Day 2: when it opens, then the count, then done.
    const day2Done = phase === 'claimed'
    let day2Status = t('claim.creditsLaterDay')
    if (day2Done) day2Status = completed
    else if (phase === 'day2') day2Status = rocks
    else if (phase === 'reserved') day2Status = capitalised(t('claim.creditsOpensIn', { time: creditsCountdown(campaign.nextDayAt - now) }))
    const day2Color = day2Done ? GIFT_DONE_COLOR : BANK_GOLD_LIGHT

    const body = (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', margin: { top: 10 } }}>
            <UiEntity uiTransform={{ width: '35%', flexDirection: 'column', alignItems: 'center', padding: { right: 12 } }}>
                <UiEntity uiTransform={{ width: CREDITS_REWARD_ICON, height: CREDITS_REWARD_ICON, flexShrink: 0 }} uiBackground={iconBackground(ICON_CREDITS)} />
                <BitmapText value={t('claim.creditsAmount', { credits })} fontSize={34} color={BANK_GOLD_LIGHT} />
                <UiEntity uiTransform={{ width: '80%', height: 2, margin: { top: 8, bottom: 6 } }} uiBackground={{ color: BANK_TRIM }} />
                <Label value={t(soon ? 'claim.creditsStarts' : 'claim.creditsEnds')} fontSize={14} color={BANK_CAPTION} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: 20 }} />
                <BitmapText value={creditsCountdown((soon ? campaign.startsAt : campaign.endsAt) - now)} fontSize={24} color={BANK_CREAM} />
            </UiEntity>
            <UiEntity uiTransform={{ width: '65%', flexDirection: 'column' }}>
                {creditsDayCard(day1Done, t('claim.creditsDay1', { goal }), day1Status, day1Color, true)}
                {creditsDayCard(day2Done, t('claim.creditsDay2', { goal }), day2Status, day2Color, false)}
            </UiEntity>
        </UiEntity>
    )

    let action: Action
    if (phase === 'claimed') action = { label: t('action.claimed'), kind: 'equipped' }
    else if (phase === 'reserved') action = { label: t('action.reserved'), kind: 'off' }
    else if (phase === 'late') action = { label: t('action.locked'), kind: 'off' }
    else if (soon) action = { label: t('action.comingSoon'), kind: 'off' }
    else action = { label: t('action.inProgress'), kind: 'off' }

    return {
        title: t('claim.creditsName'),
        description: t('claim.creditsDesc', { credits }),
        icon: ICON_CREDITS,
        stats: [],
        notes: [],
        actions: [storeActionButton(action)],
        body,
        footnote: t('claim.creditsOnce')
    }
}

/** How many of the quest's steps are done. */
function giftStepsDone(campaign: RewardCampaign): number {
    const done = getRewardStatus(campaign.id).done
    return campaign.steps.filter((step) => done.includes(step)).length
}

/** A reward has no price: the stat is the quest's progress, green once complete. */
function giftQuestStat(campaign: RewardCampaign): ReactEcs.JSX.Element {
    const done = giftStepsDone(campaign)
    const total = campaign.steps.length
    return detailStat(t('claim.quest'), done === total ? t('claim.complete') : `${done}/${total}`, done === total ? GIFT_DONE_COLOR : BANK_GOLD_LIGHT)
}

const GIFT_MARK_SIZE = 18
const giftRequirement = (done: boolean, text: string) => (
    <UiEntity key={text} uiTransform={{ flexDirection: 'row', alignItems: 'center', height: 24 }}>
        <UiEntity
            uiTransform={{ width: GIFT_MARK_SIZE, height: GIFT_MARK_SIZE, margin: { right: 6 }, flexShrink: 0 }}
            uiBackground={iconBackground(done ? ICON_CHECKED : ICON_BULLET)}
        />
        <Label value={text} fontSize={16} color={done ? GIFT_DONE_COLOR : GIFT_TODO_COLOR} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 24 }} />
    </UiEntity>
)

function giftDetail(campaign: RewardCampaign): Detail {
    const gift = getRewardStatus(campaign.id)
    let action: Action
    if (gift.claimed) action = { label: t('action.claimed'), kind: 'equipped' }
    else if (gift.claiming) action = { label: t('action.claiming'), kind: 'off' }
    else if (canClaimReward(campaign.id)) action = { label: t('action.claim'), kind: 'buy', onClick: () => claimReward(campaign.id) }
    else action = { label: t('action.locked'), kind: 'off' }

    const notes = gift.claimed
        ? [
              // The Rewards service mints it on chain when gas allows: it can take a while to show up.
              detailNote(t('reward.onItsWay'), PRICE_GOOD_COLOR),
              detailNote(t('reward.fewMinutes'), BANK_CAPTION),
              detailNote(t('reward.pressI'), BANK_CAPTION)
          ]
        : campaign.steps.map((step) => giftRequirement(gift.done.includes(step), t(`rewardStep.${step}`)))
    const error = getRewardClaimError(campaign.id)
    if (error !== '') notes.push(detailNote(error, SHORT_COLOR))
    return {
        title: rewardText(campaign, 'name'),
        description: rewardText(campaign, 'description'),
        icon: giftIcon(campaign),
        stats: [giftQuestStat(campaign)],
        notes,
        actions: [storeActionButton(action)],
        bigIcon: true
    }
}

const claimOfficePanel = () => {
    const tabs = CLAIM_TABS.map((tab) => tabButton(tab.id, tab.label, tab.id === claimTab, () => (claimTab = tab.id)))
    const credits = claimTab === 'credits'
    const reward = selectedReward()
    return counterPanel(
        t('claim.title'),
        closeClaimOfficePanel,
        // Credits is one campaign: its detail alone, without a list of one card.
        credits ? [] : claimOfficeProducts(),
        credits ? CREDITS_KEY : rewardKey(reward),
        (key) => {
            const picked = CLAIM_CAMPAIGNS.find((campaign) => rewardKey(campaign) === key)
            if (picked !== undefined) selectedRewardId = picked.id
        },
        credits ? creditsDetail() : giftDetail(reward),
        tabs,
        false,
        CLAIM_LIST_WIDTH
    )
}

// --- Tailor Shop ------------------------------------------------------------------------
//
// The store's layout selling wearables and emotes for coins: one card per Rewards campaign at the
// Tailor Shop (shared/rewards.ts). Bought once each, through the same claim as the Claim Office:
// the server takes the coins and asks the Rewards service. Coming Soon until the item is ready.

const TAILOR_CAMPAIGNS = rewardCampaignsAt('tailor')

function tailorItemOf(key: string): RewardCampaign | undefined {
    return TAILOR_CAMPAIGNS.find((campaign) => rewardKey(campaign) === key)
}

function tailorCardStatus(campaign: RewardCampaign): Status | null {
    if (campaign.comingSoon) return STATUS_SOON
    if (isTailorItemOwned(campaign.id)) return { text: t('status.owned'), color: PRICE_GOOD_COLOR }
    return null
}

function tailorProducts(): Product[] {
    return TAILOR_CAMPAIGNS.map((campaign) => ({
        key: rewardKey(campaign),
        title: rewardText(campaign, 'cardTitle'),
        icon: giftIcon(campaign),
        hint: campaign.comingSoon || isTailorItemOwned(campaign.id) ? '' : t('store.coinsPrice', { price: withCommas(campaign.price) }),
        status: tailorCardStatus(campaign),
        muted: campaign.comingSoon
    }))
}

function tailorDetail(campaign: RewardCampaign): Detail {
    const status = getRewardStatus(campaign.id)
    let action: Action
    if (campaign.comingSoon) action = { label: t('action.comingSoon'), kind: 'off' }
    else if (status.claimed) action = { label: t('action.owned'), kind: 'equipped' }
    else if (status.claiming) action = { label: t('action.buying'), kind: 'off' }
    else action = { label: t('action.buy'), kind: canBuyTailorItem(campaign.id) ? 'buy' : 'off', onClick: () => buyTailorItem(campaign.id) }

    const notes: ReactEcs.JSX.Element[] = []
    if (status.claimed) {
        // Minted on chain by the Rewards service when gas allows: it can take a while to show up.
        notes.push(detailNote(t('reward.onItsWay'), PRICE_GOOD_COLOR))
        notes.push(detailNote(t('reward.fewMinutes'), BANK_CAPTION))
        notes.push(detailNote(t('reward.pressI'), BANK_CAPTION))
    }
    const error = getRewardClaimError(campaign.id)
    if (error !== '') notes.push(detailNote(error, SHORT_COLOR))
    return {
        title: rewardText(campaign, 'name'),
        description: rewardText(campaign, 'description'),
        icon: giftIcon(campaign),
        stats: campaign.comingSoon ? [] : [priceStat(campaign.price)],
        notes,
        actions: [storeActionButton(action)],
        bigIcon: true
    }
}

const tailorShopPanel = () => {
    const item = tailorItemOf(`reward:${getSelectedTailorItem()}`) ?? TAILOR_CAMPAIGNS[0]
    return counterPanel(
        t('tailor.title'),
        closeTailorShopPanel,
        tailorProducts(),
        rewardKey(item),
        (key) => {
            const picked = tailorItemOf(key)
            if (picked !== undefined) selectTailorItem(picked.id)
        },
        tailorDetail(item),
        undefined,
        true,
        CLAIM_LIST_WIDTH
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
        {DEBUG_SERVER_STATUS ? serverStatus() : null}
        {DEBUG_SERVER_STATUS ? deployStamp() : null}
    </UiEntity>
)

// --- Mining bar ------------------------------------------------------------------------
//
// Sits right under the HUD, and only while the player is actually at a rock (§6: nothing
// permanent on screen but the HUD). Local by nature: it is drawn from this client's own swing
// count, so nobody else sees it.
//
// The wording carries the rule that the bar is the payout: no ore until it fills.
//
// Under the bar, the Social Bonus the next rock would pay at the crowd mining now. The player
// counts themselves even before the server has seen their first swing, so being alone reads +0
// rather than flickering.

const MINING_BAR_WIDTH = 320
const MINING_BAR_HEIGHT = 14
const MINING_PANEL_TOP = HUD_MARGIN + HUD_PILL_HEIGHT + 10
const MINING_PANEL_DROP = '10vh'
const MINING_FILL_COLOR = Color4.create(1, 198 / 255, 0, 1)
const MINING_TRACK_COLOR = Color4.create(0.12, 0.1, 0.06, 1)
/** The Social Bonus, on the mining panel and under the ore popup. */
const SOCIAL_BONUS_COLOR = Color4.create(0.55, 0.9, 0.45, 1)
// A blocked panel (full storage) flashes red on the UI clock, so the player notices the swings
// have stopped paying instead of hammering on.
const MINING_BLOCKED_COLOR = Color4.create(0.75, 0.1, 0.08, 0.95)
const MINING_BLOCKED_BLINK_SECONDS = 0.4
/** The toast under the mining panel while the player moves at a rock. */
const MINING_WARNING_COLOR = Color4.create(1, 0.35, 0.3, 1)

// While the ring lies under a rock the player is near but not mining, a nudge where the mining
// panel will appear once they step in. It jumps between 1 and 1.1, no transition, in step with
// the ring: big while the ring is in the upper half of its swell. UI has no scale, so the text
// and the padding grow instead.
const HINT_MAX_SCALE = 1.1

const moveCloserHint = () => {
    if (!showMoveCloserHint() || isOrePopupShowing()) return null
    const k = getRingPulse() >= 0.5 ? HINT_MAX_SCALE : 1
    return (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: MINING_PANEL_TOP }, margin: { top: MINING_PANEL_DROP }, width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
            <UiEntity
                uiTransform={{ padding: { left: 18 * k, right: 18 * k, top: 8 * k, bottom: 8 * k }, borderRadius: PANEL_RADIUS, borderWidth: 2, borderColor: MINING_FILL_COLOR }}
                uiBackground={{ color: HUD_BACKGROUND }}
            >
                <Label value={t('mining.moveCloser')} fontSize={18 * k} color={Color4.White()} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: 26 * k }} />
            </UiEntity>
        </UiEntity>
    )
}

const miningBar = () => {
    const status = getMiningStatus()
    if (status === null || isOrePopupShowing()) return null

    const progress = status.needed > 0 ? Math.min(1, status.hits / status.needed) : 0
    const left = Math.max(0, status.needed - status.hits)
    const bonus = socialBonus(Math.max(1, getActiveMiners()))
    const caption =
        status.blocked !== ''
            ? status.blocked
            : left === 1
              ? t('mining.keepMiningOne')
              : t('mining.keepMining', { left })
    const blocked = status.blocked !== ''
    const blinkOn = blocked && Math.floor(uiClock / MINING_BLOCKED_BLINK_SECONDS) % 2 === 0

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: MINING_PANEL_TOP },
                // A further 10vh down, clear of the HUD; the units do not add, so it is a margin.
                margin: { top: MINING_PANEL_DROP },
                width: '100%',
                flexDirection: 'column',
                alignItems: 'center'
            }}
        >
            <UiEntity
                uiTransform={{
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: { left: 18, right: 18, top: 10, bottom: 12 },
                    borderRadius: PANEL_RADIUS,
                    borderWidth: 2,
                    borderColor: blocked ? Color4.White() : MINING_FILL_COLOR
                }}
                uiBackground={{ color: blinkOn ? MINING_BLOCKED_COLOR : HUD_BACKGROUND }}
            >
                <Label
                    value={caption}
                    fontSize={18}
                    color={Color4.White()}
                    textAlign="middle-center"
                    textWrap="nowrap"
                    uiTransform={{ height: 26, margin: { bottom: blocked ? 0 : 8 } }}
                />
                {/* The bar is the payout: it has to be visibly unfinished for the caption below
                    to mean anything. Blocked, the caption is the whole message: no bar, no bonus. */}
                {blocked ? null : (
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
                )}
                {/* The mayor's practice rocks pay no bonus, so they show none. */}
                {blocked || status.practice ? null : (
                    <Label
                        value={t('mining.socialBonus', { bonus })}
                        fontSize={16}
                        color={bonus > 0 ? SOCIAL_BONUS_COLOR : MUTED_COLOR}
                        textAlign="middle-center"
                        textWrap="nowrap"
                        uiTransform={{ height: 22, margin: { top: 6 } }}
                    />
                )}
            </UiEntity>
            {/* Moving while mining: a toast of its own under the panel, which stays as it is,
                so the two never take turns. */}
            {!blocked && status.warning !== '' ? (
                <UiEntity
                    uiTransform={{
                        margin: { top: 8 },
                        padding: { left: 16, right: 16, top: 6, bottom: 6 },
                        borderRadius: PANEL_RADIUS,
                        borderWidth: 2,
                        borderColor: MINING_WARNING_COLOR
                    }}
                    uiBackground={{ color: HUD_BACKGROUND }}
                >
                    <Label value={status.warning} fontSize={16} color={MINING_WARNING_COLOR} textAlign="middle-center" textWrap="nowrap" uiTransform={{ height: 22 }} />
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}

// --- The "+10 Ore" popup -----------------------------------------------------------------
//
// Centred, rising a little and fading: the payout of a finished rock. Small and quiet, since it
// shows several times a minute: two badges, no icons or effects. In the mining panel's place,
// which (with the move-closer hint) gives way to it while it shows.
//
// The first badge is the rock's base ore, all gold; the Social Bonus follows just under it, a
// size smaller and all green, once the server has said.

const POPUP_FADE_STEPS = 4
const POPUP_ORE_FONT_SIZE = 34
const POPUP_BONUS_FONT_SIZE = 24
/** Between the two badges. */
const POPUP_GAP = 4
const POPUP_RADIUS = 8
const POPUP_BORDER = 1
/** The badges' backgrounds, at full opacity of the popup: dark enough to read over anything. */
const POPUP_BACKGROUND_ALPHA = 0.82
const POPUP_ORE_BACKGROUND = Color4.fromHexString('#1C1714FF')
const POPUP_ORE_BORDER = Color4.fromHexString('#C99535FF')
const POPUP_ORE_TEXT = Color4.fromHexString('#FFCC45FF')
const POPUP_BONUS_BACKGROUND = Color4.fromHexString('#17451CFF')
const POPUP_BONUS_BORDER = Color4.fromHexString('#579B36FF')
const POPUP_BONUS_TEXT = Color4.fromHexString('#B5FF72FF')
/** How far it rises while it shows, in pixels, ending in the mining panel's place. */
const POPUP_RISE_PX = 48

/** A colour at the popup's opacity, times its own. */
const faded = (color: Color4, alpha: number) => Color4.create(color.r, color.g, color.b, color.a * alpha)

/** One badge: a rounded box with a fine border, holding its text. */
const popupBadge = (key: string, fontSize: number, background: Color4, border: Color4, alpha: number, value: string, color: Color4) => (
    <UiEntity
        key={key}
        uiTransform={{
            flexDirection: 'row',
            alignItems: 'center',
            flexShrink: 0,
            padding: { left: Math.round(fontSize * 0.45), right: Math.round(fontSize * 0.45), top: Math.round(fontSize * 0.2), bottom: Math.round(fontSize * 0.2) },
            borderRadius: POPUP_RADIUS,
            borderWidth: POPUP_BORDER,
            borderColor: faded(border, alpha)
        }}
        uiBackground={{ color: faded(background, alpha * POPUP_BACKGROUND_ALPHA) }}
    >
        <BitmapText value={value} fontSize={fontSize} color={faded(color, alpha)} />
    </UiEntity>
)

const orePopup = () => {
    const popup = getOrePopup()
    if (popup === null) return null

    // Fades in, holds, fades out (ore-popup.ts sets the timing). In a few steps rather than every
    // frame: the fade recolours every glyph, and doing that each frame stalled mobile until the
    // scene errored.
    const alpha = Math.ceil(popup.fade * POPUP_FADE_STEPS) / POPUP_FADE_STEPS
    const rise = Math.round(POPUP_RISE_PX * (1 - popup.progress))

    // Where the mining panel and the move-closer hint sit, which give it the place while it shows
    // (see isOrePopupShowing). Ore on top, the Social Bonus just under it, starting a little lower
    // and rising into place.
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: MINING_PANEL_TOP },
                margin: { top: MINING_PANEL_DROP },
                width: '100%',
                flexDirection: 'column',
                alignItems: 'center'
            }}
        >
            <UiEntity uiTransform={{ width: '100%', flexShrink: 0, flexDirection: 'column', alignItems: 'center', position: { top: rise } }}>
                {popupBadge('ore', POPUP_ORE_FONT_SIZE, POPUP_ORE_BACKGROUND, POPUP_ORE_BORDER, alpha, t('popup.ore', { amount: popup.amount }), POPUP_ORE_TEXT)}
                {popup.bonus > 0 ? (
                    <UiEntity key="bonus" uiTransform={{ margin: { top: POPUP_GAP }, flexShrink: 0 }}>
                        {popupBadge('bonus-badge', POPUP_BONUS_FONT_SIZE, POPUP_BONUS_BACKGROUND, POPUP_BONUS_BORDER, alpha, t('popup.socialBonus', { bonus: popup.bonus }), POPUP_BONUS_TEXT)}
                    </UiEntity>
                ) : null}
            </UiEntity>
        </UiEntity>
    )
}

/** While the reward shows, it has the mining panel's place: the panel and the hint wait. */
const isOrePopupShowing = () => getOrePopup() !== null

/** Drawn inside the debug box, under its buttons. */
const serverStatus = () => {
    const online = isServerOnline()
    return (
        <Label
            value={online ? `server tick: ${getServerTick()}` : 'server: offline'}
            fontSize={18}
            color={online ? SERVER_ONLINE_COLOR : SERVER_OFFLINE_COLOR}
            textAlign="middle-left"
            uiTransform={{ height: SERVER_LABEL_HEIGHT, margin: { top: 6 } }}
        />
    )
}

/** Under the server status; only once deployed, never in preview. */
const deployStamp = () => {
    const stamp = getDeployStamp()
    if (stamp === undefined) return null
    return <Label value={`deploy: ${stamp}`} fontSize={14} color={MUTED_COLOR} textAlign="middle-left" uiTransform={{ height: 18 }} />
}

function fuelLeftText(): string {
    const hours = getMuleFuelHours()
    if (getMuleCount() <= 0) return t('fuelLeft.noMule')
    if (hours <= 0) return t('fuelLeft.empty')
    if (hours < 1) return t('time.minutes', { n: Math.ceil(hours * 60) })
    if (hours < 24) return t('time.hours', { n: Math.floor(hours) })
    return t('time.daysHours', { d: Math.floor(hours / 24), h: Math.floor(hours % 24) })
}

/** What the rigs are doing right now, by the same rules the server settles them with. */
function muleStatus(): { running: boolean; reason: string } {
    if (getMuleFuelHours() <= 0) return { running: false, reason: t('muleStatus.noFuel') }
    if (getOre() >= getCarryCapacity()) return { running: false, reason: t('muleStatus.storageFull') }
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
    if (hours < 1) return t('time.minutes', { n: Math.max(1, Math.ceil(hours * 60)) })
    if (hours < 24) return t('time.hours', { n: Math.floor(hours) })
    return t('time.daysHours', { d: Math.floor(hours / 24), h: Math.floor(hours % 24) })
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
            <BitmapText value={upper(stat.value)} fontSize={22} color={stat.color ?? BANK_CREAM} />
            {stat.unit !== undefined ? (
                <BitmapText value={upper(stat.unit)} fontSize={15} color={stat.color ?? BANK_CREAM} uiTransform={{ margin: { left: 6 } }} />
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
            <BitmapText value={upper(title)} fontSize={22} color={BANK_GOLD_LIGHT} />
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
            <BitmapText value={mules === 1 ? t('item.mule') : t('mule.pluralCaps')} fontSize={22} color={BANK_CREAM} uiTransform={{ margin: { left: 10, bottom: 6 } }} />
        </UiEntity>,
        muleStat(
            status.running
                ? { caption: t('mulePanel.status'), value: t('mulePanel.running'), color: PRICE_GOOD_COLOR, dot: { color: PRICE_GOOD_COLOR, pulse: true } }
                : { caption: t('mulePanel.status'), value: t('mulePanel.paused'), color: SHORT_COLOR, note: status.reason, dot: { color: SHORT_COLOR, pulse: false } }
        ),
        muleStat({ caption: t('mulePanel.totalOutput'), value: t('mulePanel.orePerDay', { ore: withCommas(MULE_ORE_PER_HOUR * 24 * mules) }) }),
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
        muleStat({ caption: t('mulePanel.fuelInTank'), value: `${Math.floor(gallons)} / ${tank}`, unit: t('mulePanel.gallons'), color: low ? SHORT_COLOR : COIN_COLOR }),
        muleBar('fuel-bar', blinkOff ? 0 : share, low ? SHORT_COLOR : COIN_COLOR, low && !blinkOff ? SHORT_COLOR : BANK_CAPTION),
        muleStat({ caption: t('mulePanel.fuelLeft'), value: fuelLeftText(), color: gallons > 0 ? BANK_CREAM : SHORT_COLOR }),
        muleStat({ caption: t('mulePanel.fuelUse'), value: fuelUse === 1 ? t('mulePanel.gallonPerDay') : t('mulePanel.gallonsPerDay', { n: fuelUse }) }),
        // Empty outranks low: only one of the two is a real state at a time.
        DEBUG_SHOW_MULE_ALERTS || gallons <= 0
            ? muleAlert('fuel-empty', t('mulePanel.alertOutOfFuel'))
            : null,
        DEBUG_SHOW_MULE_ALERTS || (low && gallons > 0)
            ? muleAlert('fuel-low', t('mulePanel.alertFuelLow'), COIN_COLOR)
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
    const fullInCaption = t('mulePanel.storageFullIn')
    let fullIn: MuleStat = { caption: fullInCaption, value: t('mulePanel.fullNow'), color: SHORT_COLOR }
    if (ore < capacity) {
        const hours = (capacity - ore) / perHour
        if (perHour <= 0 || fuelHours <= 0) fullIn = { caption: fullInCaption, value: '-', color: MUTED_COLOR, note: t('mulePanel.notFilling') }
        else if (fuelHours < hours) fullIn = { caption: fullInCaption, value: '-', color: MUTED_COLOR, note: t('mulePanel.fuelFirst') }
        else fullIn = { caption: fullInCaption, value: durationText(hours) }
    }

    return [
        muleStat({ caption: t('mulePanel.storedOre'), value: `${withCommas(ore)} / ${withCommas(capacity)}` }),
        muleBar('storage-bar', capacity > 0 ? ore / capacity : 0, ore >= capacity ? SHORT_COLOR : ORE_COLOR),
        muleStat(fullIn),
        // At the top tier there is nothing to upgrade to, so it only says so.
        muleStat(
            next === null
                ? { caption: t('mulePanel.capacity'), value: t('mulePanel.max'), color: BANK_GOLD_LIGHT }
                : { caption: t('storage.nextUpgrade'), value: t('mulePanel.oreAmount', { ore: withCommas(next.storage ?? 0) }) }
        ),
        DEBUG_SHOW_MULE_ALERTS || ore >= capacity
            ? muleAlert('storage-full', t('mulePanel.alertStorageFull'))
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
            <BitmapText value={t('item.mule')} fontSize={46} color={BANK_GOLD_LIGHT} />
            <Label value={t('mulePanel.subtitle')} fontSize={16} color={BANK_CAPTION} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: 22 }} />
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
            {muleColumn(t('mulePanel.fleet'), ICON_MULE, fleetColumn(), false)}
            {muleColumn(t('store.fuel'), ICON_FUEL, fuelColumn(), false)}
            {muleColumn(t('store.storage'), ICON_WAREHOUSE, storageColumn(), true)}
        </UiEntity>
        <Label
            value={t('mulePanel.footer')}
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

// The General Store's grouping: tools are the picks, upgrades grow the operation (rigs, fuel,
// storage). Land is where the player lives, bought at the Land & Claim Office.
type InventoryTab = 'all' | 'tools' | 'upgrades' | 'land'

const INVENTORY_TABS: { id: InventoryTab; readonly label: string }[] = [
    { id: 'all', get label() { return t('tab.all') } },
    { id: 'tools', get label() { return t('tab.tools') } },
    { id: 'upgrades', get label() { return t('tab.upgrades') } },
    { id: 'land', get label() { return t('tab.land') } }
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
            title: itemName(pick),
            icon: PICK_ICONS[pick.id] ?? ICON_PICK_IRON,
            status: t('inv.hitsPerRock', { hits: pick.hitsPerRock ?? 0 }),
            equipped,
            details: [
                t('inv.hitsPerRock', { hits: pick.hitsPerRock ?? 0 }),
                t('inv.durabilityLeft', { rocks: durabilityText(pick) }),
                equipped ? t('inv.currentlyEquipped') : t('inv.switchPicks')
            ]
        })
    }

    const mules = getMuleCount()
    if (mules > 0) {
        entries.push({
            key: 'mule',
            tab: 'upgrades',
            title: t('item.mule'),
            icon: ICON_MULE,
            status: `x${mules}`,
            equipped: false,
            details: [
                t('inv.owned', { count: mules }),
                t('inv.produces', { ore: withCommas(MULE_ORE_PER_HOUR * 24 * mules) }),
                t('inv.fuelLeft', { left: fuelLeftText() })
            ]
        })
    }

    const storage = tierLevel('storage')
    const nextStorage = nextTier('storage', (id) => getOwned(id))
    entries.push({
        key: 'storage',
        tab: 'upgrades',
        title: t('store.storage'),
        icon: ICON_WAREHOUSE,
        status: t('inv.level', { level: storage.level }),
        equipped: false,
        details: [
            t('inv.levelHolds', { level: storage.level, ore: withCommas(getCarryCapacity()) }),
            t('inv.storedNow', { ore: withCommas(getOre()) }),
            nextStorage === null ? t('store.maxLevel') : t('inv.nextAtStore', { item: itemName(nextStorage) })
        ]
    })

    // The home lived in carries the green tag, the way the pick in use does.
    const home = activeHome()
    for (const property of itemsOf('housing')) {
        if (getOwned(property.id) <= 0) continue
        const active = property.id === home?.id
        entries.push({
            key: property.id,
            tab: 'land',
            title: itemName(property),
            icon: PROPERTY_ICONS[property.id] ?? ICON_WAGON,
            status: itemBenefit(property),
            equipped: active,
            badge: t('status.active'),
            details: [
                itemBenefit(property),
                property.startsOwned === true ? t('inv.yoursFromStart') : t('inv.boughtFor', { coins: withCommas(property.price) }),
                active ? t('land.currentHome') : t('land.movedUp')
            ]
        })
    }

    if (mules > 0) {
        const gallons = Math.floor(fuelGallonsNow())
        entries.push({
            key: 'fuel',
            tab: 'upgrades',
            title: t('store.fuel'),
            icon: ICON_FUEL,
            status: t('inv.gal', { n: gallons }),
            equipped: false,
            details: [
                t('inv.gallonsInTank', { now: gallons, tank: fuelTankGallons(mules) }),
                getMuleFuelHours() <= 0 ? t('inv.tankEmpty') : t('inv.lasts', { left: fuelLeftText() })
            ]
        })
    }

    return entries
}

// Folder tabs, as the inventory and the store use: rounded on top, square at the foot, standing on
// a box that holds what the tab shows. The open tab has the box's fill and no line under it, so it
// reads as part of the box; the others are darker and closed off by the box's top edge.
const TAB_RADIUS = 10
const TAB_BORDER = 2
const TAB_GAP = 6
const TAB_BODY_PADDING = 12
/** Room between the tabs and what the box holds. */
const TAB_BODY_PADDING_TOP = 30
/** The box and the open tab: a step lighter than the cards on it. */
const TAB_BODY_COLOR = BANK_STEP_COLOR
const TAB_IDLE_COLOR = BANK_WOOD

const tabButton = (key: string, label: string, active: boolean, onPress: () => void) => (
    <UiEntity
        key={key}
        uiTransform={{
            height: INVENTORY_TAB_HEIGHT,
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: { topLeft: TAB_RADIUS, topRight: TAB_RADIUS, bottomLeft: 0, bottomRight: 0 },
            borderWidth: { top: TAB_BORDER, left: TAB_BORDER, right: TAB_BORDER, bottom: active ? 0 : TAB_BORDER },
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: active ? TAB_BODY_COLOR : TAB_IDLE_COLOR }}
        onMouseDown={onPress}
    >
        <BitmapText value={label} fontSize={20} color={active ? BANK_GOLD_LIGHT : BANK_CAPTION} />
    </UiEntity>
)

/** The bit of the box's top edge between two tabs. */
const tabGap = (key: string) => (
    <UiEntity
        key={key}
        uiTransform={{
            width: TAB_GAP,
            height: INVENTORY_TAB_HEIGHT,
            flexShrink: 0,
            borderWidth: { top: 0, left: 0, right: 0, bottom: TAB_BORDER },
            borderColor: BANK_TRIM
        }}
    />
)

/**
 * A row of tabs on top of the box that holds what they show. The tabs span the box's whole width,
 * so their feet and the gaps between them make up its top edge.
 */
const tabbedBox = (tabs: ReactEcs.JSX.Element[], body: ReactEcs.JSX.Element | ReactEcs.JSX.Element[], grow: boolean = false) => (
    <UiEntity uiTransform={{ width: '100%', flexDirection: 'column', ...(grow ? { flexGrow: 1 } : {}) }}>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexShrink: 0 }}>
            {tabs.flatMap((tab, index) => (index === 0 ? [tab] : [tabGap(`tab-gap-${index}`), tab]))}
        </UiEntity>
        <UiEntity
            uiTransform={{
                width: '100%',
                flexDirection: 'column',
                ...(grow ? { flexGrow: 1 } : {}),
                padding: { top: TAB_BODY_PADDING_TOP, left: TAB_BODY_PADDING, right: TAB_BODY_PADDING, bottom: TAB_BODY_PADDING },
                borderRadius: { topLeft: 0, topRight: 0, bottomLeft: PANEL_RADIUS, bottomRight: PANEL_RADIUS },
                borderWidth: { top: 0, left: TAB_BORDER, right: TAB_BORDER, bottom: TAB_BORDER },
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: TAB_BODY_COLOR }}
        >
            {body}
        </UiEntity>
    </UiEntity>
)

const inventoryTabButton = (tab: { id: InventoryTab; label: string }) =>
    tabButton(tab.id, tab.label, tab.id === inventoryTab, () => {
        inventoryTab = tab.id
    })

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
                    value={entry.badge ?? t('status.equipped')}
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
            <BitmapText value={upper(entry.title)} fontSize={28} color={BANK_GOLD_LIGHT} uiTransform={{ margin: { bottom: 4 } }} />
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
            <BitmapText value={t('inv.title')} fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 12 } }} />
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
            {/* The box is the grid's width plus its own padding and sides, so the grid fits it exactly. */}
            <UiEntity uiTransform={{ width: INVENTORY_GRID_WIDTH + 2 * (TAB_BODY_PADDING + TAB_BORDER), flexDirection: 'column' }}>
                {tabbedBox(INVENTORY_TABS.map(inventoryTabButton), [
                    shown.length === 0 ? (
                        <Label
                            key="empty"
                            value={noPick ? t('inv.emptyNoPick') : t('inv.empty')}
                            fontSize={18}
                            color={BANK_CAPTION}
                            textAlign="middle-center"
                            uiTransform={{ width: '100%', height: INVENTORY_CARD_HEIGHT }}
                        />
                    ) : (
                        <UiEntity key="grid" uiTransform={{ width: INVENTORY_GRID_WIDTH, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                            {shown.map(inventoryCard)}
                        </UiEntity>
                    ),
                    ...(selected !== null ? [<UiEntity key="detail">{inventoryDetail(selected)}</UiEntity>] : [])
                ])}
            </UiEntity>
        </UiEntity>
    )
}

// Dressed like the Map button next to it: an icon alone, no label. The last piece of the dock.
const inventoryButton = () => (
    <UiEntity
        uiTransform={{
            width: bottomButtonWidth(),
            height: BOTTOM_PANEL_HEIGHT,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: inventoryOpen ? BANK_GOLD : BANK_TRIM,
            flexDirection: 'row',
            alignItems: 'center',
            // The icon is alone, so centred.
            justifyContent: 'center'
        }}
        uiBackground={{ color: BOTTOM_BUTTON_COLOR }}
        onMouseDown={() => {
            inventoryOpen = !inventoryOpen
            if (inventoryOpen) {
                notificationsOpen = false
                soundOpen = false
                townBoardOpen = false
                feedbackMenuOpen = false
                mapOpen = false
                pickSelectorOpen = false
                muleDropdownOpen = false
            }
        }}
    >
        <UiEntity uiTransform={bottomButtonIcon()} uiBackground={iconBackground(ICON_INVENTORY)} />
    </UiEntity>
)

// --- Map ----------------------------------------------------------------------------------

const MAP_IMAGE = 'assets/images/map.png'
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
            width: bottomButtonWidth(),
            height: BOTTOM_PANEL_HEIGHT,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: mapOpen ? BANK_GOLD : BANK_TRIM,
            flexDirection: 'row',
            alignItems: 'center',
            // The icon is alone, so centred.
            justifyContent: 'center'
        }}
        uiBackground={{ color: BOTTOM_BUTTON_COLOR }}
        onMouseDown={() => {
            mapOpen = !mapOpen
            if (mapOpen) {
                notificationsOpen = false
                soundOpen = false
                townBoardOpen = false
                feedbackMenuOpen = false
                inventoryOpen = false
                pickSelectorOpen = false
                muleDropdownOpen = false
            }
        }}
    >
        <UiEntity uiTransform={bottomButtonIcon()} uiBackground={iconBackground(ICON_MAP)} />
    </UiEntity>
)

// --- Bottom buttons -----------------------------------------------------------------------
//
// One dock at the bottom of the column, as wide as the HUD above it, four pieces in a row: two
// status panels — the pick in hand and the M.U.L.E. fleet, each opening its own dropdown above it —
// then Map and Inventory. Map and Inventory keep their width; the two panels share what is left,
// so the dock grows and shrinks with the column, and longer translations fit.

const BOTTOM_BUTTON_Y = 28
const BOTTOM_BUTTON_HEIGHT = 44
const BOTTOM_BUTTON_GAP = 8

// The icons match the HUD's at the top. Map and Stuff are their icon alone on every platform:
// a label didn't always fit ("Stuff" wrapped its last letter), and the mobile column has no
// room for one anyway.
const BOTTOM_BUTTON_WIDTH = 64
const BOTTOM_PANEL_HEIGHT = 64
const BOTTOM_PANEL_ICON = HUD_ICON_SIZE
const BOTTOM_PANEL_BAR_HEIGHT = 4

function bottomButtonWidth(): number {
    return BOTTOM_BUTTON_WIDTH
}

/** Map and Stuff's icon: the HUD's size, alone in its button. */
function bottomButtonIcon() {
    return { width: BOTTOM_PANEL_ICON, height: BOTTOM_PANEL_ICON, flexShrink: 0 }
}

function bottomButtonFont(): number {
    return isMobile() ? 16 : 18
}

/** The dock's share of the column (the HUD's width), centred: 80% of the HUD on desktop, 90% on
 *  mobile, where the column is narrower and the tool and M.U.L.E. names need the room. */
function dockWidth(): `${number}%` {
    return isMobile() ? '90%' : '80%'
}
/** Half of what the dock leaves free, so it stays centred. */
function dockLeft(): `${number}%` {
    return isMobile() ? '5%' : '10%'
}

/**
 * The dock's layout, dockWidth() of the column, centred: the pick slot, the M.U.L.E. slot (the two share what
 * is left, equally), then Map and Inventory at their own width. The dropdowns open above it, in a
 * box of their own (dockDropdowns).
 */
const dockRow = (
    key: string,
    bottom: number,
    height: number,
    pick: ReactEcs.JSX.Element | null,
    mule: ReactEcs.JSX.Element | null,
    map: ReactEcs.JSX.Element | null,
    inventory: ReactEcs.JSX.Element | null
) => (
    <UiEntity
        key={key}
        uiTransform={{ positionType: 'absolute', position: { bottom, left: dockLeft() }, width: dockWidth(), height, flexDirection: 'row' }}
    >
        <UiEntity uiTransform={{ width: 0, flexGrow: 1, height: '100%' }}>{pick}</UiEntity>
        <UiEntity uiTransform={{ width: 0, flexGrow: 1, height: '100%', margin: { left: BOTTOM_BUTTON_GAP } }}>{mule}</UiEntity>
        <UiEntity uiTransform={{ width: bottomButtonWidth(), flexShrink: 0, height: '100%', margin: { left: BOTTOM_BUTTON_GAP } }}>{map}</UiEntity>
        <UiEntity uiTransform={{ width: bottomButtonWidth(), flexShrink: 0, height: '100%', margin: { left: BOTTOM_BUTTON_GAP } }}>{inventory}</UiEntity>
    </UiEntity>
)

/** The four buttons, at the bottom of the column. */
const dock = () => dockRow('dock', BOTTOM_BUTTON_Y, BOTTOM_PANEL_HEIGHT, pickButton(), muleButton(), mapButton(), inventoryButton())

/**
 * The open dropdown, if any, over the dock: a box as wide as the dock, from the top of its buttons
 * to the top of the column. Late in the tree, so a dropdown draws over the panels.
 *
 * Every dropdown lies wholly inside this box: one hung outside its parent's rect (a box of no height,
 * or a slot narrower than itself) could not be tapped on mobile. The box has no listener, so it
 * takes no click from what is behind it (build-ui skill: only a listener or pointerFilter 'block'
 * captures input). The pick's opens from its button's left edge; the M.U.L.E.'s from its button's
 * right edge, leftwards, since the dock's middle is too close to the right for a whole dropdown.
 */
const dockDropdowns = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { bottom: BOTTOM_BUTTON_Y + BOTTOM_PANEL_HEIGHT, top: 0, left: dockLeft() },
            width: dockWidth()
        }}
    >
        {pickSelector()}
        {muleDropdown()}
    </UiEntity>
)

/** From the dock's right edge to the M.U.L.E. button's: Map and Inventory with their gaps. */
const DOCK_MULE_RIGHT = 2 * BOTTOM_BUTTON_WIDTH + 2 * BOTTOM_BUTTON_GAP

type BottomPanel = {
    key: string
    open: boolean
    onToggle: () => void
    icon: Icon
    iconTint?: Color4
    title: string
    /** A status dot before the title. */
    dot?: { color: Color4; pulse: boolean }
    value: string
    valueColor: Color4
    /** The bar over the value; null leaves the value alone under the title. */
    bar: { share: number; color: Color4 } | null
}

/** Icon, a title, a thin bar under it and the figure it stands for. Tapping it toggles its dropdown. */
const bottomPanel = (panel: BottomPanel) => (
    <UiEntity
        key={panel.key}
        uiTransform={{
            // Its dock slot's: the column's width shared with the other panel (see dockRow).
            width: '100%',
            height: BOTTOM_PANEL_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 8, right: 10 },
            borderRadius: 8,
            borderWidth: 2,
            borderColor: panel.open ? BANK_GOLD : BANK_TRIM
        }}
        uiBackground={{ color: BOTTOM_BUTTON_COLOR }}
        onMouseDown={panel.onToggle}
    >
        <UiEntity
            uiTransform={{ width: BOTTOM_PANEL_ICON, height: BOTTOM_PANEL_ICON, margin: { right: 8 }, flexShrink: 0 }}
            uiBackground={iconBackground(panel.icon, panel.iconTint)}
        />
        {/* Two fixed bands, so the title sits at the same height on every panel: the title in
            the top 60%, the bar or the Not Owned line in the bottom 40%, meeting at the line between the two bands. */}
        <UiEntity uiTransform={{ width: 0, flexGrow: 1, height: '100%', flexDirection: 'column' }}>
            <UiEntity uiTransform={{ width: '100%', height: '60%', flexDirection: 'column', justifyContent: 'flex-end' }}>
                {/* The dot and the title centred on each other, the pair at the bottom of the band. */}
                <UiEntity uiTransform={{ height: 22, flexDirection: 'row', alignItems: 'center' }}>
                    {panel.dot !== undefined ? statusDot(panel.dot) : null}
                    <Label value={panel.title} fontSize={bottomButtonFont()} color={Color4.White()} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 22 }} />
                </UiEntity>
            </UiEntity>
            <UiEntity uiTransform={{ width: '100%', height: '40%', flexDirection: 'column', justifyContent: 'flex-start' }}>
                {/* The bar spans the whole text column, framed in yellow so the empty part still
                    reads as track. The figures live in the dropdowns; without a bar the line says why. */}
                {panel.bar !== null ? (
                    <UiEntity
                        uiTransform={{
                            width: '100%',
                            height: BOTTOM_PANEL_BAR_HEIGHT,
                            margin: { top: 5 },
                            borderRadius: BOTTOM_PANEL_BAR_HEIGHT / 2,
                            borderWidth: 1,
                            borderColor: COIN_COLOR
                        }}
                        uiBackground={{ color: MULE_BAR_TRACK }}
                    >
                        <UiEntity
                            uiTransform={{ width: percent(Math.max(0, Math.min(1, panel.bar.share))), height: '100%', borderRadius: BOTTOM_PANEL_BAR_HEIGHT / 2 }}
                            uiBackground={{ color: panel.bar.color }}
                        />
                    </UiEntity>
                ) : (
                    <Label value={panel.value} fontSize={12} color={panel.valueColor} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '100%', height: 14 }} />
                )}
            </UiEntity>
        </UiEntity>
    </UiEntity>
)

// The game's red close button, a size down to suit a dropdown.
const DROPDOWN_CLOSE_SIZE = 30

/** The frame both dropdowns share: wood, a gold title with the red close button, then their rows.
 *  Just above the dock, at `at` (see dockDropdowns). */
const dropdown = (at: { left: number } | { right: number }, title: string, onClose: () => void, children: ReactEcs.JSX.Element[]) => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { bottom: 0, ...at },
            margin: { bottom: BOTTOM_BUTTON_GAP },
            flexDirection: 'column',
            padding: { left: 8, right: 8, bottom: 8, top: 2 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD_DARK }}
    >
        {/* As wide as the rows under it: the frame has no width of its own, so a 100% here does
            not resolve on every client and the X ended up beside the title instead of at the edge. */}
        <UiEntity uiTransform={{ width: PICK_ROW_WIDTH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { top: 6, bottom: 2 } }}>
            <BitmapText value={title} fontSize={22} color={BANK_GOLD_LIGHT} uiTransform={{ margin: { left: 2 } }} />
            <Button
                value="X"
                fontSize={20}
                color={Color4.White()}
                uiTransform={{ width: DROPDOWN_CLOSE_SIZE, height: DROPDOWN_CLOSE_SIZE, borderRadius: 8, flexShrink: 0 }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={onClose}
            />
        </UiEntity>
        {children}
    </UiEntity>
)

/** One wooden card inside a dropdown, as wide as a pick row. */
const dropdownCard = (key: string, rows: ReactEcs.JSX.Element[]) => (
    <UiEntity
        key={key}
        uiTransform={{
            width: PICK_ROW_WIDTH,
            flexDirection: 'column',
            padding: { left: 12, right: 12, top: 6, bottom: 6 },
            margin: { top: 6 },
            borderRadius: 8,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        {rows}
    </UiEntity>
)

/** A line of text in a dropdown card. `lines` above 1 wraps it inside the card instead of spilling past it. */
const dropdownLine = (key: string, text: string, fontSize: number, color: Color4, lines: number = 1) => (
    <Label
        key={key}
        value={text}
        fontSize={fontSize}
        color={color}
        textAlign={lines > 1 ? 'top-left' : 'middle-left'}
        textWrap={lines > 1 ? 'wrap' : 'nowrap'}
        uiTransform={{ width: '100%', height: lines > 1 ? lines * (fontSize + 4) + 4 : fontSize + 8 }}
    />
)

// --- Pick selector ------------------------------------------------------------------------
//
// The pick in hand, as a panel: icon, name, and a bar of the rocks it has left. Tapping it
// opens a short list of every pick above it — the one in use highlighted, the owned ones
// selectable, the rest locked. Choosing is a request, answered by the wallet, so the highlight
// moves when the server agrees.

/** The dropdowns' width: the pick rows, the cards and the title row. 30% wider than at first (260),
 *  for the longer translations. */
const PICK_ROW_WIDTH = Math.round(260 * 1.3)
const PICK_ROW_HEIGHT = 48
const PICK_ROW_ICON = 36
const LOCKED_TINT = Color4.create(1, 1, 1, 0.35)

let pickSelectorOpen = false

function closePickSelector() {
    pickSelectorOpen = false
}

const pickButton = () => {
    const pick = activePick((id) => getOwned(id), getEquipped())
    const max = pick?.durability ?? 0
    return bottomPanel({
        key: 'pick-panel',
        open: pickSelectorOpen,
        onToggle: () => {
            pickSelectorOpen = !pickSelectorOpen
            if (pickSelectorOpen) {
                mapOpen = false
                inventoryOpen = false
                muleDropdownOpen = false
            }
        },
        icon: (pick && PICK_ICONS[pick.id]) ?? ICON_PICK_IRON,
        iconTint: pick === null ? LOCKED_TINT : Color4.White(),
        title: pick === null ? t('dock.manualTool') : itemName(pick),
        value: pick === null ? t('dock.notOwned') : durabilityText(pick),
        valueColor: pick === null ? MUTED_COLOR : durabilityColor(pick, BANK_CREAM),
        bar: pick === null ? null : { share: max > 0 ? getDurability(pick.id) / max : 0, color: durabilityColor(pick, BANK_GOLD) }
    })
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
                value={itemName(item)}
                fontSize={17}
                color={owned ? BANK_CREAM : MUTED_COLOR}
                textAlign="middle-left"
                textWrap="nowrap"
                uiTransform={{ flexGrow: 1, height: PICK_ROW_HEIGHT }}
            />
            {owned ? (
                <Label
                    value={durabilityText(item)}
                    fontSize={13}
                    color={durabilityColor(item, BANK_CAPTION)}
                    textAlign="middle-right"
                    textWrap="nowrap"
                    uiTransform={{ height: PICK_ROW_HEIGHT, flexShrink: 0 }}
                />
            ) : (
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
    const pick = activePick((id) => getOwned(id), getEquipped())
    // No pick at all: say so, and where the free one comes from, like the M.U.L.E. dropdown does.
    if (pick === null) {
        return dropdown({ left: 0 }, t('dock.manualTool'), closePickSelector, [
            dropdownCard('pick-card', [
                dropdownLine('state', t('dock.notOwned'), 17, MUTED_COLOR),
                dropdownLine('hint', t('dock.claimWelcomePick'), 14, BANK_CAPTION, 2)
            ])
        ])
    }
    return dropdown({ left: 0 }, t('dock.manualTool'), closePickSelector, PICKS.map((item) => pickRow(item, item.id === pick.id)))
}

// --- M.U.L.E. summary ---------------------------------------------------------------------
//
// Next to the pick: the fleet at a glance — fuel in the tank, as a bar — and a dropdown with
// how many rigs, what they are doing and how long the fuel lasts. Only a summary: the full
// panel, storage included, stays at the rigs themselves.

let muleDropdownOpen = false

function closeMuleDropdown() {
    muleDropdownOpen = false
}

// Running is fine, a full storage only waits on a sale, an empty tank stops everything.
const MULE_WARNING_COLOR = PRICE_FAIR_COLOR

type MuleHudState = { label: string; color: Color4; pulse: boolean; running: boolean }

/** The rigs' state in the dropdown's words, from the same rules as the full panel. */
function muleHudState(): MuleHudState {
    const status = muleStatus()
    if (status.running) return { label: t('mulePanel.running'), color: PRICE_GOOD_COLOR, pulse: true, running: true }
    if (getMuleFuelHours() <= 0) return { label: t('dock.noFuel'), color: SHORT_COLOR, pulse: false, running: false }
    return { label: t('dock.storageFull'), color: MULE_WARNING_COLOR, pulse: false, running: false }
}

/** The tank as a share, and its colour: gold while there is plenty, amber when low, red when dry. */
function muleFuel(): { gallons: number; tank: number; share: number; color: Color4 } {
    const gallons = fuelGallonsNow()
    const tank = fuelTankGallons(getMuleCount())
    const share = tank > 0 ? gallons / tank : 0
    const color = gallons <= 0 ? SHORT_COLOR : share < FUEL_LOW_SHARE ? MULE_WARNING_COLOR : COIN_COLOR
    return { gallons, tank, share, color }
}

const muleButton = () => {
    const mules = getMuleCount()
    const onToggle = () => {
        muleDropdownOpen = !muleDropdownOpen
        if (muleDropdownOpen) {
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
        }
    }
    if (mules <= 0) {
        return bottomPanel({
            key: 'mule-panel',
            open: muleDropdownOpen,
            onToggle,
            icon: ICON_MULE,
            iconTint: LOCKED_TINT,
            title: t('item.mule'),
            value: t('dock.notOwned'),
            valueColor: MUTED_COLOR,
            bar: null
        })
    }
    const state = muleHudState()
    const fuel = muleFuel()
    return bottomPanel({
        key: 'mule-panel',
        open: muleDropdownOpen,
        onToggle,
        icon: ICON_MULE,
        title: t('item.mule'),
        dot: { color: state.color, pulse: state.pulse },
        value: `${Math.floor(fuel.gallons)} / ${fuel.tank}`,
        valueColor: fuel.color,
        bar: { share: fuel.share, color: fuel.color }
    })
}

const muleDropdown = () => {
    if (!muleDropdownOpen) return null
    const mules = getMuleCount()
    const rows: ReactEcs.JSX.Element[] = []
    if (mules <= 0) {
        rows.push(dropdownLine('state', t('dock.notOwned'), 17, MUTED_COLOR), dropdownLine('hint', t('dock.buyAtStore'), 14, BANK_CAPTION))
    } else {
        const state = muleHudState()
        const fuel = muleFuel()
        const hours = getMuleFuelHours()
        rows.push(
            dropdownLine('count', mules === 1 ? t('dock.oneMachine') : t('dock.machines', { count: mules }), 17, BANK_CREAM),
            <UiEntity key="state" uiTransform={{ height: 24, flexDirection: 'row', alignItems: 'center' }}>
                {statusDot({ color: state.color, pulse: state.pulse })}
                <Label value={state.label} fontSize={16} color={state.color} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 24 }} />
            </UiEntity>,
            ...(state.running ? [dropdownLine('output', t('dock.orePerHour', { ore: withCommas(Math.round(MULE_ORE_PER_HOUR * mules)) }), 15, BANK_CREAM)] : []),
            dropdownLine('fuel', t('inv.fuelLeft', { left: hours > 0 ? upper(durationText(hours)) : t('dock.empty') }), 15, fuel.gallons > 0 ? BANK_CREAM : SHORT_COLOR),
            <UiEntity key="fuel-bar" uiTransform={{ width: '100%', margin: { top: 4 } }}>
                {muleBar('hud-fuel-bar', fuel.share, fuel.color)}
            </UiEntity>,
            dropdownLine('hint', t('dock.oreToStorage'), 13, BANK_CAPTION)
        )
    }
    return dropdown({ right: DOCK_MULE_RIGHT }, t('item.mule'), closeMuleDropdown, [dropdownCard('mule-card', rows)])
}

// --- Objective tracker --------------------------------------------------------------------
//
// On the right edge of the screen: a stack of cards, each a bell, a title and two short lines
// saying something that matters now (see ui/objective.ts), the first on top. Each closes from its
// X. Hidden when there is nothing to say. Alerts wear the warning colour; objectives the bank's gold.

/** How far in from the screen's right edge the tracker and the rightmost corner button (Rewards) sit; more on mobile. */
const SCREEN_RIGHT_MARGIN = 32
const SCREEN_RIGHT_MARGIN_MOBILE = 48
function screenRightMargin(): number {
    return isMobile() ? SCREEN_RIGHT_MARGIN_MOBILE : SCREEN_RIGHT_MARGIN
}
/** From the left edge of the Town Board button to the right edge of Rewards: the five corner buttons above it. */
const OBJECTIVE_WIDTH = 5 * BOTTOM_BUTTON_WIDTH + 4 * BOTTOM_BUTTON_GAP
const OBJECTIVE_ICON_SIZE = 28
const OBJECTIVE_BAR_HEIGHT = 8
const OBJECTIVE_GAP = 8
/** Just under the HUD's bottom edge, the same gap as between the cards. */
const OBJECTIVE_TOP = HUD_PILL_HEIGHT + OBJECTIVE_GAP
/** The close button's tap area; the white circle drawn in its middle is smaller. */
const OBJECTIVE_CLOSE_SIZE = 32
const OBJECTIVE_CLOSE_CIRCLE_SIZE = 22
const OBJECTIVE_CLOSE_FONT_SIZE = 16
/** Pixels the X is moved inside its circle, to sit it in the middle by eye: + is down / right. */
const OBJECTIVE_CLOSE_X_NUDGE_Y = 1
const OBJECTIVE_CLOSE_X_NUDGE_X = 0
const OBJECTIVE_MORE_INFO_HEIGHT = 24

// The CREDIT REWARDS card stands out: a bright yellow border, and spinner.png turning behind it,
// spilling past its edges like a glow. The spinner is the card's sibling, drawn first, so the card
// covers its middle. The UI cannot rotate an entity, so the texture's UVs turn instead, about the
// image's centre; the corners that reach past the image clamp to its transparent edge.
// It only draws: no pointer events, and the card's own taps stay inside the card.
const CREDITS_BORDER_COLOR = Color4.create(1, 0.86, 0.1, 1)
const CREDITS_BORDER_WIDTH = 3
/** The HUD's background made opaque, so the glow behind never shows through the card. */
const CREDITS_BACKGROUND = Color4.create(HUD_BACKGROUND.r, HUD_BACKGROUND.g, HUD_BACKGROUND.b, 1)
const CREDITS_SPINNER_SRC = 'assets/images/spinner.png'
const CREDITS_SPINNER_TINT = Color4.create(1, 0.85, 0.3, 0.5)
/** Degrees per second. */
const CREDITS_SPINNER_SPEED = 20
/** The glow's side, a square centred on the card: how far it spills past it. */
const CREDITS_SPINNER_SIZE = 480

function creditsSpinnerUvs(): number[] {
    const angle = ((uiClock * CREDITS_SPINNER_SPEED) % 360) * (Math.PI / 180)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Bottom-left, top-left, top-right, bottom-right, like every other uvs here.
    const corners = [
        [-0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
        [0.5, -0.5]
    ]
    return corners.flatMap(([x, y]) => [0.5 + x * cos - y * sin, 0.5 + x * sin + y * cos])
}

const creditsSpinner = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: '50%', left: '50%' },
            margin: { top: -CREDITS_SPINNER_SIZE / 2, left: -CREDITS_SPINNER_SIZE / 2 },
            width: CREDITS_SPINNER_SIZE,
            height: CREDITS_SPINNER_SIZE
        }}
        uiBackground={{
            texture: { src: CREDITS_SPINNER_SRC, wrapMode: 'clamp' },
            textureMode: 'stretch',
            uvs: creditsSpinnerUvs(),
            color: CREDITS_SPINNER_TINT
        }}
    />
)

// Each kind of tracker card has one colour, worn by its title and its border. Ordinary cards keep
// the border faint (the colour at NOTIFY_SOFT_BORDER_ALPHA over the dark card); warnings and the
// Credits card keep it at full strength, so they stand out from the rest.
const NOTIFY_OBJECTIVE_COLOR = Color4.fromHexString('#F4C84BFF')
const NOTIFY_AWAY_COLOR = Color4.fromHexString('#8BB9E8FF')
/** Storage full, and every other alert: a pick broke, fuel ran low, a note, a price move, an upgrade. */
const NOTIFY_WARNING_COLOR = Color4.fromHexString('#FF7168FF')
const NOTIFY_SOCIAL_COLOR = Color4.fromHexString('#70D980FF')
const NOTIFY_SOFT_BORDER_ALPHA = 0.45

const softBorder = (color: Color4) => Color4.create(color.r, color.g, color.b, NOTIFY_SOFT_BORDER_ALPHA)

/** The title's colour and the border's, by kind. The Credits card keeps the look it had. */
const objectiveColors = (objective: Objective): { title: Color4; border: Color4 } => {
    if (objective.id === CREDITS_ID) return { title: BANK_GOLD_LIGHT, border: CREDITS_BORDER_COLOR }
    if (objective.id === SOCIAL_BONUS_ID) return { title: NOTIFY_SOCIAL_COLOR, border: softBorder(NOTIFY_SOCIAL_COLOR) }
    if (objective.id === MULE_AWAY_ID) return { title: NOTIFY_AWAY_COLOR, border: softBorder(NOTIFY_AWAY_COLOR) }
    if (objective.alert) return { title: NOTIFY_WARNING_COLOR, border: NOTIFY_WARNING_COLOR }
    return { title: NOTIFY_OBJECTIVE_COLOR, border: softBorder(NOTIFY_OBJECTIVE_COLOR) }
}

const objectiveTracker = () => {
    const objectives = getObjectives()
    if (objectives.length === 0) return null

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: OBJECTIVE_TOP, right: screenRightMargin() },
                width: OBJECTIVE_WIDTH,
                flexDirection: 'column'
            }}
        >
            {objectives.map(objectiveCard)}
        </UiEntity>
    )
}

const objectiveCard = (objective: Objective, index: number) => {
    const credits = objective.id === CREDITS_ID
    const marginTop = index === 0 ? 0 : OBJECTIVE_GAP
    const card = (
        <UiEntity
            key={objective.id}
            uiTransform={{
                width: '100%',
                flexDirection: 'column',
                margin: { top: credits ? 0 : marginTop },
                padding: { left: 14, right: 14, top: 10, bottom: 12 },
                borderRadius: PANEL_RADIUS,
                borderWidth: credits ? CREDITS_BORDER_WIDTH : 2,
                borderColor: objectiveColors(objective).border
            }}
            uiBackground={{ color: CREDITS_BACKGROUND }}
        >
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', margin: { bottom: 4 } }}>
                <UiEntity
                    uiTransform={{ width: OBJECTIVE_ICON_SIZE, height: OBJECTIVE_ICON_SIZE, margin: { right: 8 }, flexShrink: 0 }}
                    uiBackground={iconBackground(objective.id === CREDITS_ID ? ICON_CREDITS : ICON_NOTIFICATION)}
                />
                <BitmapText value={objective.title} fontSize={20} color={objectiveColors(objective).title} />
            </UiEntity>
            {/* A white circle with a black X, in the middle of a larger tap area inside the card. */}
            <UiEntity
                uiTransform={{
                    positionType: 'absolute',
                    position: { top: 6, right: 8 },
                    width: OBJECTIVE_CLOSE_SIZE,
                    height: OBJECTIVE_CLOSE_SIZE,
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                onMouseDown={() => dismissObjective(objective.id)}
            >
                <UiEntity
                    uiTransform={{
                        width: OBJECTIVE_CLOSE_CIRCLE_SIZE,
                        height: OBJECTIVE_CLOSE_CIRCLE_SIZE,
                        borderRadius: OBJECTIVE_CLOSE_CIRCLE_SIZE / 2,
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    uiBackground={{ color: Color4.White() }}
                >
                    <BitmapText
                        value="X"
                        fontSize={OBJECTIVE_CLOSE_FONT_SIZE}
                        color={Color4.Black()}
                        align="center"
                        uiTransform={{
                            positionType: 'absolute',
                            position: { top: OBJECTIVE_CLOSE_X_NUDGE_Y, left: OBJECTIVE_CLOSE_X_NUDGE_X },
                            width: OBJECTIVE_CLOSE_CIRCLE_SIZE,
                            height: OBJECTIVE_CLOSE_CIRCLE_SIZE,
                            padding: 0
                        }}
                    />
                </UiEntity>
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
            {objective.id === CREDITS_ID ? (
                // Inside the card, so the tap lands on mobile too: opens the Claim Office on its Credits tab.
                <UiEntity
                    uiTransform={{ height: OBJECTIVE_MORE_INFO_HEIGHT, margin: { top: 6 }, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }}
                    onMouseDown={openCreditsRewards}
                >
                    <Label value={`${t('obj.moreInfo')} ›`} fontSize={15} color={BANK_GOLD_LIGHT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: OBJECTIVE_MORE_INFO_HEIGHT }} />
                </UiEntity>
            ) : null}
        </UiEntity>
    )
    if (!credits) return card
    // The glow first, so the card is drawn over it.
    return (
        <UiEntity key={objective.id} uiTransform={{ width: '100%', flexDirection: 'column', margin: { top: marginTop } }}>
            {creditsSpinner()}
            {card}
        </UiEntity>
    )
}

// --- Owner card ---------------------------------------------------------------------------
//
// Clicking an owned property: who lives there and what they have, dressed like the
// notifications. At someone else's door, a note to leave; at your own, the notes left there,
// one at a time.

const OWNER_CARD_WIDTH = 600
const OWNER_PHOTO_SIZE = 132
const OWNER_STAT_ICON = 30
const OWNER_STAT_HEIGHT = 32
const OWNER_ONLINE_DOT = 12
const OWNER_NOTE_INPUT_HEIGHT = 48
const OWNER_PICTURE_FALLBACK = 'assets/images/fallback_profile_pic.png'

let ownerNotesPage = 0

/** "just now", "3 min ago", "2 h ago", "4 d ago", from a wall-clock moment. */
function noteAge(at: number): string {
    const seconds = Math.max(0, (Date.now() - at) / 1000)
    if (seconds < 60) return t('ago.justNow')
    if (seconds < 3600) return t('ago.minutes', { n: Math.floor(seconds / 60) })
    if (seconds < 86400) return t('ago.hours', { n: Math.floor(seconds / 3600) })
    return t('ago.days', { n: Math.floor(seconds / 86400) })
}

const ownerStat = (icon: Icon, text: string, color: Color4 = BANK_CREAM) => (
    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: OWNER_STAT_HEIGHT, margin: { bottom: 4 } }}>
        <UiEntity uiTransform={{ width: OWNER_STAT_ICON, height: OWNER_STAT_ICON, margin: { right: 10 }, flexShrink: 0 }} uiBackground={iconBackground(icon)} />
        <Label value={text} fontSize={18} color={color} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: OWNER_STAT_HEIGHT }} />
    </UiEntity>
)

const ownerStats = () => {
    const card = getOwnerCard()
    if (card === null) {
        return <Label value={t('owner.asking')} fontSize={18} color={BANK_CAPTION} textAlign="middle-left" uiTransform={{ height: OWNER_STAT_HEIGHT }} />
    }
    if (!card.found) {
        return <Label value={t('owner.nobody')} fontSize={18} color={BANK_CAPTION} textAlign="middle-left" uiTransform={{ height: OWNER_STAT_HEIGHT }} />
    }
    const property = findItem(card.property as ShopItemId)
    const pick = findItem(card.pick as ShopItemId)
    const storage = findItem(card.storage as ShopItemId)
    return (
        <UiEntity uiTransform={{ flexDirection: 'column' }}>
            <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center', height: OWNER_STAT_HEIGHT, margin: { bottom: 4 } }}>
                <UiEntity
                    uiTransform={{ width: OWNER_ONLINE_DOT, height: OWNER_ONLINE_DOT, borderRadius: OWNER_ONLINE_DOT / 2, margin: { left: 9, right: 19 } }}
                    uiBackground={{ color: card.online ? SERVER_ONLINE_COLOR : MUTED_COLOR }}
                />
                <Label value={card.online ? t('owner.inTown') : t('owner.away')} fontSize={18} color={card.online ? SERVER_ONLINE_COLOR : MUTED_COLOR} textAlign="middle-left" uiTransform={{ height: OWNER_STAT_HEIGHT }} />
            </UiEntity>
            {ownerStat(PROPERTY_ICONS[card.property] ?? ICON_HOUSE_HOME, itemName(property, t('owner.property')))}
            {ownerStat(PICK_ICONS[card.pick] ?? ICON_PICK_IRON, itemName(pick, t('owner.noPick')), pick !== null ? BANK_CREAM : MUTED_COLOR)}
            {ownerStat(ICON_MULE, card.mules > 0 ? t('owner.mules', { count: card.mules }) : t('owner.noMule'), card.mules > 0 ? BANK_CREAM : MUTED_COLOR)}
            {ownerStat(ICON_WAREHOUSE, itemName(storage, t('owner.basicStorage')))}
        </UiEntity>
    )
}

const leaveNoteSection = () => {
    const status = getNoteStatus()
    const draft = getNoteDraft()
    const ready = canSendNote()
    return (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
            <BitmapText value={t('owner.leaveNote')} fontSize={24} color={BANK_GOLD_LIGHT} uiTransform={{ margin: { bottom: 8 } }} />
            <Input
                placeholder={t('owner.sayHowdy', { name: getOpenOwnerName() })}
                value={draft}
                fontSize={18}
                color={BANK_CREAM}
                placeholderColor={MUTED_COLOR}
                uiTransform={{ width: '100%', height: OWNER_NOTE_INPUT_HEIGHT, borderRadius: 8, borderWidth: 2, borderColor: BANK_TRIM }}
                uiBackground={{ color: BANK_WOOD }}
                onChange={setNoteDraft}
                onSubmit={(value) => {
                    setNoteDraft(value)
                    sendNote()
                }}
            />
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { top: 8 } }}>
                <Label
                    value={status !== null ? status.text : `${draft.length}/${NOTE_MAX_CHARS}`}
                    fontSize={15}
                    color={status === null ? BANK_CAPTION : status.ok ? PRICE_GOOD_COLOR : SHORT_COLOR}
                    textAlign="middle-left"
                    textWrap="nowrap"
                    uiTransform={{ height: 44 }}
                />
                <UiEntity
                    uiTransform={{ width: 140, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 2, borderColor: BANK_TRIM }}
                    uiBackground={{ color: ready ? BANK_GOLD : DISABLED_COLOR }}
                    onMouseDown={sendNote}
                >
                    <BitmapText value={t('owner.send')} fontSize={24} color={ready ? BANK_INK : MUTED_COLOR} />
                </UiEntity>
            </UiEntity>
        </UiEntity>
    )
}

// No key: the one row stays and only its text changes from note to note. A key that changed with
// the note made a new row each time, and the old one could linger under it.
const ownerNoteRow = (note: Note) => (
    <UiEntity
        uiTransform={{
            width: '100%',
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: { left: 14, right: 14, top: 8, bottom: 10 },
            margin: { bottom: 8 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        {/* The note itself: who and when, then what it says. */}
        <UiEntity uiTransform={{ flexGrow: 1, flexShrink: 1, flexDirection: 'column' }}>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Label value={note.from} fontSize={17} color={BANK_GOLD_LIGHT} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 22 }} />
                <Label value={noteAge(note.at)} fontSize={13} color={BANK_CAPTION} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: 20 }} />
            </UiEntity>
            {/* Room for the longest note there can be. */}
            <Label value={note.text} fontSize={16} color={BANK_CREAM} textAlign="top-left" textWrap="wrap" uiTransform={{ width: '100%', height: 66 }} />
        </UiEntity>
        {/* Throws away this note only, from beside it at the top; inside the row, so it takes taps on mobile too. */}
        <UiEntity uiTransform={{ flexShrink: 0, margin: { left: 10 } }}>
            <Button
                value="X"
                fontSize={isMobile() ? 36 : 18}
                color={BANK_CREAM}
                uiTransform={{ width: isMobile() ? 64 : 32, height: isMobile() ? 64 : 32, borderRadius: 6, borderWidth: 2, borderColor: BANK_TRIM }}
                uiBackground={{ color: BANK_STEP_COLOR }}
                onMouseDown={() => deleteMyNote(note)}
            />
        </UiEntity>
    </UiEntity>
)

const pageButton = (label: string, enabled: boolean, onPress: () => void) => (
    <UiEntity
        uiTransform={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 2, borderColor: BANK_TRIM }}
        uiBackground={{ color: enabled ? BANK_STEP_COLOR : DISABLED_COLOR }}
        onMouseDown={() => {
            if (enabled) onPress()
        }}
    >
        <Label value={label} fontSize={20} color={enabled ? BANK_CREAM : MUTED_COLOR} textAlign="middle-center" />
    </UiEntity>
)

const myNotesSection = () => {
    const notes = getMyNotes()
    const pages = Math.max(1, notes.length)
    // A note the list no longer reaches (notes cleared) falls back.
    ownerNotesPage = Math.min(ownerNotesPage, pages - 1)
    const note = notes[ownerNotesPage]
    return (
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: 8 } }}>
                <BitmapText value={t('owner.notesAtDoor')} fontSize={24} color={BANK_GOLD_LIGHT} />
                {notes.length >= NOTE_MAX_KEPT ? (
                    <Label value={t('owner.mailboxFull')} fontSize={14} color={SHORT_COLOR} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: 24 }} />
                ) : null}
            </UiEntity>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
                {note === undefined ? (
                    <Label value={t('owner.noNotes')} fontSize={16} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ width: '100%', height: 60 }} />
                ) : (
                    ownerNoteRow(note)
                )}
            </UiEntity>
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { top: 4 } }}>
                {notes.length > 0 ? (
                    <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
                        {pageButton('<', ownerNotesPage > 0, () => (ownerNotesPage -= 1))}
                        <Label value={`${ownerNotesPage + 1}/${pages}`} fontSize={16} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ width: 60, height: 44 }} />
                        {pageButton('>', ownerNotesPage < pages - 1, () => (ownerNotesPage += 1))}
                    </UiEntity>
                ) : (
                    <UiEntity />
                )}
                <UiEntity
                    uiTransform={{ width: 280, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 2, borderColor: BANK_TRIM }}
                    uiBackground={{ color: notes.length > 0 ? BANK_GOLD : DISABLED_COLOR }}
                    onMouseDown={() => {
                        if (notes.length > 0) clearMyNotes()
                    }}
                >
                    <BitmapText value={t('owner.emptyMailbox')} fontSize={22} color={notes.length > 0 ? BANK_INK : MUTED_COLOR} />
                </UiEntity>
            </UiEntity>
        </UiEntity>
    )
}

const ownerCardPanel = () => {
    const owner = getOpenOwner()
    return (
        <UiEntity
            uiTransform={{
                width: OWNER_CARD_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <BitmapText value={t('owner.propertyOf')} fontSize={20} color={BANK_CAPTION} align="center" uiTransform={{ width: '100%' }} />
            <BitmapText value={upper(getOpenOwnerName())} fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 12 } }} />
            {/* Closed from the corner, like the other screens. */}
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={closeOwnerCard}
            />
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'flex-start', margin: { bottom: 16 } }}>
                <UiEntity
                    uiTransform={{ width: OWNER_PHOTO_SIZE, height: OWNER_PHOTO_SIZE, margin: { right: 20 }, flexShrink: 0, borderRadius: 10, borderWidth: 3, borderColor: BANK_TRIM }}
                    uiBackground={
                        ownerHasFace(owner)
                            ? { textureMode: 'stretch', avatarTexture: { userId: owner } }
                            : { textureMode: 'stretch', texture: { src: OWNER_PICTURE_FALLBACK } }
                    }
                />
                {ownerStats()}
            </UiEntity>
            <UiEntity uiTransform={{ width: '100%', height: 2, margin: { bottom: 12 } }} uiBackground={{ color: BANK_TRIM }} />
            {isOwnCard() ? myNotesSection() : leaveNoteSection()}
        </UiEntity>
    )
}

// --- Notifications ------------------------------------------------------------------------
//
// A bell in the screen's top-right corner, level with the HUD, opens the tracker's last few messages
// (ui/objective.ts keeps them), newest first, with a Clear that empties the list. Dressed like
// the inventory, and like it, one screen at a time: opening it closes the map and the inventory.

const NOTIFY_PANEL_WIDTH = 560
/** How far in from the screen's right edge Notifications (slot 0) sits: two buttons further in than
 *  Rewards (slot -2), which keeps screenRightMargin() to the edge, like the tracker below. */
function cornerButtonRight(): number {
    return screenRightMargin() + 2 * (BOTTOM_BUTTON_WIDTH + BOTTOM_BUTTON_GAP)
}

/** Town Board, Sound, Notifications, Feedback and Rewards: square icon buttons like Map and Inventory, side by
 *  side on the screen's top-right corner, Rewards (slot -2) at the edge. `slot` counts from the right. Centred
 *  on the HUD's height: the plank hangs from the top of the screen. */
const cornerButton = (slot: number, open: boolean, icon: Icon, onPress: () => void) => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: (HUD_PILL_HEIGHT - BOTTOM_PANEL_HEIGHT) / 2, right: cornerButtonRight() + slot * (bottomButtonWidth() + BOTTOM_BUTTON_GAP) },
            width: bottomButtonWidth(),
            height: BOTTOM_PANEL_HEIGHT,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: open ? BANK_GOLD : BANK_TRIM,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center'
        }}
        uiBackground={{ color: BOTTOM_BUTTON_COLOR }}
        onMouseDown={onPress}
    >
        <UiEntity uiTransform={bottomButtonIcon()} uiBackground={iconBackground(icon)} />
    </UiEntity>
)

let notificationsOpen = false

/** "just now", "3 min ago", "2 h ago". */
function timeAgo(at: number): string {
    const seconds = Math.max(0, getObjectiveClock() - at)
    if (seconds < 60) return t('ago.justNow')
    if (seconds < 3600) return t('ago.minutes', { n: Math.floor(seconds / 60) })
    return t('ago.hours', { n: Math.floor(seconds / 3600) })
}

const notificationsButton = () =>
    cornerButton(0, notificationsOpen, ICON_NOTIFICATION, () => {
        notificationsOpen = !notificationsOpen
        if (notificationsOpen) {
            soundOpen = false
            townBoardOpen = false
            feedbackMenuOpen = false
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
            muleDropdownOpen = false
        }
    })

const notificationRow = (entry: PastObjective, index: number) => (
    <UiEntity
        key={`${index}`}
        uiTransform={{
            width: '100%',
            flexDirection: 'column',
            padding: { left: 14, right: 14, top: 8, bottom: 10 },
            margin: { bottom: 8 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: objectiveColors(entry).border
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <BitmapText value={entry.title} fontSize={20} color={objectiveColors(entry).title} />
            <Label value={timeAgo(entry.at)} fontSize={13} color={BANK_CAPTION} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: 20 }} />
        </UiEntity>
        <Label value={entry.message} fontSize={16} color={BANK_CREAM} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 22 }} />
        {entry.detail !== '' ? (
            <Label value={entry.detail} fontSize={14} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ height: 20 }} />
        ) : null}
    </UiEntity>
)

const notificationsPanel = () => {
    const history = getObjectiveHistory()
    return (
        <UiEntity
            uiTransform={{
                width: NOTIFY_PANEL_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <BitmapText value={t('notify.title')} fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 12 } }} />
            {/* Closed from the corner, like the other screens. */}
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={() => {
                    notificationsOpen = false
                }}
            />
            {history.length === 0 ? (
                <Label value={t('notify.none')} fontSize={16} color={BANK_CAPTION} textAlign="middle-center" uiTransform={{ width: '100%', height: 60 }} />
            ) : (
                <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>{history.map(notificationRow)}</UiEntity>
            )}
            <UiEntity
                uiTransform={{
                    width: 160,
                    height: 44,
                    justifyContent: 'center',
                    alignItems: 'center',
                    margin: { top: 4 },
                    borderRadius: 8,
                    borderWidth: 2,
                    borderColor: BANK_TRIM
                }}
                uiBackground={{ color: history.length > 0 ? BANK_GOLD : DISABLED_COLOR }}
                onMouseDown={clearObjectiveHistory}
            >
                <BitmapText value={t('common.clear')} fontSize={24} color={history.length > 0 ? BANK_INK : MUTED_COLOR} />
            </UiEntity>
        </UiEntity>
    )
}

// --- Feedback ----------------------------------------------------------------------------
//
// Right of Notifications: a speech bubble that drops a two-choice menu under it, Give feedback
// or Report a bug. Either one closes the menu and opens the Scene Feedback panel straight on its
// question (src/playtest.ts), whenever the player wants, apart from the asks the game paces.

/** From the Town Board's left edge to Feedback's right edge: four corner buttons and the gaps between them. */
const FEEDBACK_MENU_WIDTH = 4 * BOTTOM_BUTTON_WIDTH + 3 * BOTTOM_BUTTON_GAP
const FEEDBACK_MENU_ROW_HEIGHT = 48
const FEEDBACK_MENU_GAP = 8

let feedbackMenuOpen = false

const feedbackButton = () =>
    cornerButton(-1, feedbackMenuOpen, ICON_FEEDBACK, () => {
        feedbackMenuOpen = !feedbackMenuOpen
        if (feedbackMenuOpen) {
            notificationsOpen = false
            soundOpen = false
            townBoardOpen = false
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
            muleDropdownOpen = false
        }
    })

const feedbackMenuRow = (label: string, first: boolean, onPress: () => void) => (
    <UiEntity
        key={label}
        uiTransform={{
            width: '100%',
            height: FEEDBACK_MENU_ROW_HEIGHT,
            margin: { top: first ? 0 : FEEDBACK_MENU_GAP },
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_GOLD }}
        onMouseDown={() => {
            feedbackMenuOpen = false
            onPress()
        }}
    >
        <BitmapText value={label} fontSize={22} color={BANK_INK} />
    </UiEntity>
)

/** Hangs under the button, its right edge level with the button's. */
const feedbackMenu = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: {
                top: (HUD_PILL_HEIGHT - BOTTOM_PANEL_HEIGHT) / 2 + BOTTOM_PANEL_HEIGHT + FEEDBACK_MENU_GAP,
                right: cornerButtonRight() - (bottomButtonWidth() + BOTTOM_BUTTON_GAP)
            },
            width: FEEDBACK_MENU_WIDTH,
            flexDirection: 'column',
            padding: 10,
            borderRadius: PANEL_RADIUS,
            borderWidth: 3,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD_DARK }}
    >
        {feedbackMenuRow(t('feedback.give'), true, giveFeedback)}
        {feedbackMenuRow(t('feedback.reportBug'), false, reportBug)}
        {adminMaintenanceRow()}
        {adminCampaignRow()}
        {feedbackMenuBuild()}
    </UiEntity>
)

/** How long the copy button shows the copied icon after a press. */
const BUILD_COPIED_MS = 1500
const BUILD_COPY_ICON_SIZE = 20
let buildCopiedAt = 0

/** The deploy's code and date under the two choices, so a bug report can say which build it was;
 *  the copy button beside it puts that line on the clipboard to paste into the report. */
const feedbackMenuBuild = () => {
    const failure = getDeployStampFailure()
    const build = getDeployStampUtc()
    const stamp = build ?? (isLocalPreview() ? 'Build local preview' : failure !== undefined ? `Build unknown (${failure})` : undefined)
    if (stamp === undefined) return null
    const copied = Date.now() - buildCopiedAt < BUILD_COPIED_MS
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: 22,
                margin: { top: FEEDBACK_MENU_GAP },
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center'
            }}
        >
            <Label value={stamp} fontSize={14} color={MUTED_COLOR} textAlign="middle-center" uiTransform={{ height: 18 }} />
            {build !== undefined ? (
                <UiEntity
                    uiTransform={{ width: BUILD_COPY_ICON_SIZE, height: BUILD_COPY_ICON_SIZE, margin: { left: 6 } }}
                    uiBackground={iconBackground(copied ? ICON_COPIED : ICON_COPY)}
                    onMouseDown={() => {
                        buildCopiedAt = Date.now()
                        void copyToClipboard({ text: build })
                    }}
                />
            ) : null}
        </UiEntity>
    )
}

// --- Rewards -----------------------------------------------------------------------------
//
// Right of Feedback, at the corner's edge: opens the Claim Office's panel from anywhere, the same
// screen the clerk shows. For now only a shortcut to it.

const rewardsButton = () =>
    cornerButton(-2, isClaimOfficePanelOpen(), ICON_GIFT, () => {
        toggleClaimOfficeFromButton()
        if (isClaimOfficePanelOpen()) {
            notificationsOpen = false
            soundOpen = false
            townBoardOpen = false
            feedbackMenuOpen = false
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
            muleDropdownOpen = false
        }
    })

// --- Language ----------------------------------------------------------------------------
//
// Outside the HUD, just left of it, at its height: the active language's flag and code. It drops
// the list of languages under it, the current one ticked, like Feedback drops its menu.
//
// A holder in a copy of the HUD's outer row (languageLayer), which is as wide as the plank: `right: '100%'` puts its right
// edge on the plank's left edge (less a gap), wherever the HUD is and however wide. It holds the
// button and, under it, the list, from the button's left edge rightwards, below the plank. The
// click lives on the button alone, so picking a language in the list does not toggle it again.

/** Half as wide again as the corner buttons, so the code fits beside the flag. */
const LANGUAGE_BUTTON_WIDTH = BOTTOM_BUTTON_WIDTH * 1.5
/** The title card's list (columns and padding) plus this one's frame. */
const LANGUAGE_MENU_BORDER = 3
const LANGUAGE_MENU_WIDTH = LANGUAGE_LIST_WIDTH + 2 * LANGUAGE_MENU_BORDER

/** The button's top in the HUD's outer row, which starts hudBleed() above the screen. */
function languageButtonTop(): number {
    return (HUD_PILL_HEIGHT - BOTTOM_PANEL_HEIGHT) / 2 + hudBleed()
}

let languageMenuOpen = false

/** The flag at half the corner icons' size, so the language's code fits beside it. */
const LANGUAGE_FLAG_SCALE = 0.5
const LANGUAGE_CODE_GAP = 6

function toggleLanguageMenu() {
    languageMenuOpen = !languageMenuOpen
    if (languageMenuOpen) {
        notificationsOpen = false
        soundOpen = false
        townBoardOpen = false
        feedbackMenuOpen = false
        mapOpen = false
        inventoryOpen = false
        pickSelectorOpen = false
        muleDropdownOpen = false
    }
}

/** The button and its list, left of the HUD. */
const languageSelector = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: languageButtonTop(), right: '100%' },
            margin: { right: BOTTOM_BUTTON_GAP },
            width: LANGUAGE_BUTTON_WIDTH,
            height: BOTTOM_PANEL_HEIGHT
        }}
    >
        {languageButton()}
        {languageMenu()}
    </UiEntity>
)

/**
 * A transparent copy of the HUD's outer row (same top, width and height), holding the selector
 * where the HUD would. Rendered last in main-container, so the selector and its list draw over
 * everything else in the game — mining bar, popups, panels: a player who cannot read the language
 * must always be able to reach it.
 */
const languageLayer = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: -hudBleed() },
            width: '100%',
            height: HUD_PILL_HEIGHT + hudBleed()
        }}
    >
        {languageSelector()}
    </UiEntity>
)

// cornerButton's frame, with a small flag and the code (EN, ES...) in place of its one big icon.
const languageButton = () => {
    const language = getLanguage()
    const flag = BOTTOM_PANEL_ICON * LANGUAGE_FLAG_SCALE
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: '100%',
                borderRadius: 8,
                borderWidth: 2,
                borderColor: languageMenuOpen ? BANK_GOLD : BANK_TRIM,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            uiBackground={{ color: BOTTOM_BUTTON_COLOR }}
            onMouseDown={toggleLanguageMenu}
        >
            <UiEntity uiTransform={{ width: flag, height: flag, flexShrink: 0 }} uiBackground={iconBackground(flagIcon(language))} />
            <Label
                value={language.toUpperCase()}
                fontSize={bottomButtonFont()}
                color={BANK_CREAM}
                textAlign="middle-left"
                textWrap="nowrap"
                uiTransform={{ height: BOTTOM_PANEL_HEIGHT, margin: { left: LANGUAGE_CODE_GAP } }}
            />
        </UiEntity>
    )
}

/** Hangs under the button, its left edge level with the button's, opening rightwards under the HUD. */
const languageMenu = () => {
    // Another corner screen opened since: the list gives way to it rather than wait under it.
    if (notificationsOpen || soundOpen || townBoardOpen || feedbackMenuOpen || mapOpen || inventoryOpen) languageMenuOpen = false
    if (!languageMenuOpen) return null
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: '100%', left: 0 },
                margin: { top: FEEDBACK_MENU_GAP },
                width: LANGUAGE_MENU_WIDTH,
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: 6,
                borderRadius: PANEL_RADIUS,
                borderWidth: LANGUAGE_MENU_BORDER,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            {languageColumns(() => {
                languageMenuOpen = false
            })}
        </UiEntity>
    )
}

// --- Sound -------------------------------------------------------------------------------
//
// Music and SFX volume side by side, each a bar of VOLUME_STEPS segments: tap one to set the level
// there, or step with - and +. Below them, the soundtrack's tracks to tick or untick. The button sits left of Notifications and opens like it.

const SOUND_SEGMENT_HEIGHT = 32
const SOUND_SEGMENT_GAP = 4
const SOUND_STEP_SIZE = 40
const SOUND_SEGMENT_OFF = Color4.create(0.23, 0.16, 0.1, 1)

let soundOpen = false

const soundButton = () =>
    cornerButton(1, soundOpen, ICON_SOUND, () => {
        soundOpen = !soundOpen
        if (soundOpen) {
            notificationsOpen = false
            townBoardOpen = false
            feedbackMenuOpen = false
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
            muleDropdownOpen = false
        }
    })

const soundStepButton = (label: string, enabled: boolean, onPress: () => void) => (
    <UiEntity
        uiTransform={{
            width: SOUND_STEP_SIZE,
            height: SOUND_STEP_SIZE,
            justifyContent: 'center',
            alignItems: 'center',
            flexShrink: 0,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: enabled ? BANK_GOLD : DISABLED_COLOR }}
        onMouseDown={() => {
            if (enabled) onPress()
        }}
    >
        <BitmapText value={label} fontSize={28} color={enabled ? BANK_INK : MUTED_COLOR} />
    </UiEntity>
)

const soundRow = (title: string, step: number, setStep: (step: number) => void) => (
    <UiEntity
        uiTransform={{
            width: '48%',
            flexDirection: 'column',
            padding: { left: 10, right: 10, top: 8, bottom: 12 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: 6 } }}>
            <BitmapText value={title} fontSize={22} color={BANK_GOLD_LIGHT} />
            <Label value={step === 0 ? t('sound.off') : `${step * (100 / VOLUME_STEPS)}%`} fontSize={16} color={BANK_CREAM} textAlign="middle-right" textWrap="nowrap" uiTransform={{ height: 22 }} />
        </UiEntity>
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {soundStepButton('-', step > 0, () => setStep(step - 1))}
            {/* The segments share whatever the - and + buttons leave. */}
            <UiEntity uiTransform={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center', margin: { left: SOUND_SEGMENT_GAP * 2, right: SOUND_SEGMENT_GAP * 2 } }}>
                {Array.from({ length: VOLUME_STEPS }, (_, i) => (
                    <UiEntity
                        key={`${title}-${i}`}
                        uiTransform={{
                            flexGrow: 1,
                            flexBasis: 0,
                            height: SOUND_SEGMENT_HEIGHT,
                            margin: { left: i === 0 ? 0 : SOUND_SEGMENT_GAP },
                            borderRadius: 4
                        }}
                        uiBackground={{ color: i < step ? BANK_GOLD : SOUND_SEGMENT_OFF }}
                        // Tapping the lit top segment turns it off, so the bar can reach zero.
                        onMouseDown={() => setStep(i + 1 === step ? i : i + 1)}
                    />
                ))}
            </UiEntity>
            {soundStepButton('+', step < VOLUME_STEPS, () => setStep(step + 1))}
        </UiEntity>
    </UiEntity>
)

// The soundtrack list is drawn 30% larger than the volume bars above it.
const SOUND_CHECKBOX_SIZE = 36

// One soundtrack row: the whole row is the tap target (it sits inside the panel, so it works on
// mobile), the box is filled while the track is in the playlist.
const soundtrackRow = (index: number) => {
    const enabled = isTrackEnabled(index)
    return (
        <UiEntity
            key={`track-${index}`}
            uiTransform={{ width: '100%', height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            onMouseDown={() => pickTrackEnabled(index, !enabled)}
        >
            <BitmapText value={TRACKS[index].title} fontSize={26} color={enabled ? BANK_CREAM : MUTED_COLOR} />
            <UiEntity
                uiTransform={{
                    width: SOUND_CHECKBOX_SIZE,
                    height: SOUND_CHECKBOX_SIZE,
                    flexShrink: 0,
                    justifyContent: 'center',
                    alignItems: 'center',
                    margin: { left: 16 },
                    borderRadius: 8,
                    borderWidth: 3,
                    borderColor: BANK_TRIM
                }}
                uiBackground={{ color: SOUND_SEGMENT_OFF }}
            >
                {enabled ? (
                    <UiEntity uiTransform={{ width: SOUND_CHECKBOX_SIZE - 16, height: SOUND_CHECKBOX_SIZE - 16, borderRadius: 4 }} uiBackground={{ color: BANK_GOLD }} />
                ) : null}
            </UiEntity>
        </UiEntity>
    )
}

const soundtrackSection = () => (
    <UiEntity
        uiTransform={{
            width: '100%',
            flexDirection: 'column',
            padding: { left: 18, right: 18, top: 10, bottom: 10 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
    >
        {/* The caption on the right heads the checkbox column, so it reads what a tick does. */}
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: 5 } }}>
            <BitmapText value={t('sound.soundtrack')} fontSize={29} color={BANK_GOLD_LIGHT} />
            <BitmapText value={t('sound.trackEnabled')} fontSize={20} color={BANK_CREAM} align="right" />
        </UiEntity>
        {TRACKS.map((_, index) => soundtrackRow(index))}
    </UiEntity>
)

const soundPanel = () => (
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
        <BitmapText value={t('sound.title')} fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 24 } }} />
        <Button
            value="X"
            fontSize={30}
            color={Color4.White()}
            uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
            uiBackground={{ color: MAP_CLOSE_COLOR }}
            onMouseDown={() => {
                soundOpen = false
            }}
        />
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 20 } }}>
            {soundRow(t('sound.music'), getMusicStep(), pickMusicStep)}
            {soundRow(t('sound.sfx'), getSfxStep(), pickSfxStep)}
        </UiEntity>
        {soundtrackSection()}
    </UiEntity>
)

// --- Town board ---------------------------------------------------------------------------
//
// One card at a time, stepped through with the arrows: a card per title that has a holder, and one
// for the newest property owners if there are any. The server decides all of it (server/titles.ts);
// this only draws what it last said. The button sits left of Sound.

const TOWN_BOARD_WIDTH = 680
const TOWN_CARD_HEIGHT = 330
const TOWN_ARROW_SIZE = 64
const TOWN_TITLE_PHOTO_SIZE = 170
const TOWN_OWNER_PHOTO_SIZE = 110
const TOWN_OWNER_WIDTH = 150
/** The Active Users card: rows of three names, as many as fit the card; the rest are counted. */
const TOWN_USERS_FONT = 14
const TOWN_USERS_ROW_HEIGHT = 22
const TOWN_USERS_MAX_ROWS = 10
const TOWN_USERS_NAME_CHARS = 18

let townBoardOpen = false
let townBoardPage = 0

const townBoardButton = () =>
    cornerButton(2, townBoardOpen, ICON_SHERIFF, () => {
        townBoardOpen = !townBoardOpen
        if (townBoardOpen) {
            townBoardPage = 0
            soundOpen = false
            notificationsOpen = false
            feedbackMenuOpen = false
            mapOpen = false
            inventoryOpen = false
            pickSelectorOpen = false
            muleDropdownOpen = false
        }
    })

const TOWN_TITLES: { id: TitleId; readonly title: string; readonly feat: string; value: (value: number) => string }[] = [
    { id: 'whale', get title() { return t('town.whale') }, get feat() { return t('town.whaleFeat') }, value: (value) => t('town.ore', { ore: withCommas(value) }) },
    { id: 'panic', get title() { return t('town.panic') }, get feat() { return t('town.panicFeat') }, value: (value) => t('town.orePerCoin', { rate: formatRate(value) }) },
    { id: 'active', get title() { return t('town.worker') }, get feat() { return t('town.workerFeat') }, value: (value) => t('town.ore', { ore: withCommas(value) }) },
    { id: 'baron', get title() { return t('town.baron') }, get feat() { return t('town.baronFeat') }, value: (value) => t('town.ore', { ore: withCommas(value) }) },
    { id: 'roller', get title() { return t('town.roller') }, get feat() { return t('town.rollerFeat') }, value: (value) => t('obj.coins', { coins: withCommas(value) }) }
]

const townPhoto = (address: string, size: number) => (
    <UiEntity
        uiTransform={{ width: size, height: size, flexShrink: 0, borderRadius: 10, borderWidth: 3, borderColor: BANK_TRIM }}
        uiBackground={
            ownerHasFace(address)
                ? { textureMode: 'stretch', avatarTexture: { userId: address } }
                : { textureMode: 'stretch', texture: { src: OWNER_PICTURE_FALLBACK } }
        }
    />
)

const townCardLine = (value: string, fontSize: number, color: Color4) => (
    <Label value={value} fontSize={fontSize} color={color} textAlign="middle-center" textWrap="nowrap" uiTransform={{ width: '100%', height: fontSize + 8 }} />
)

const townTitleCard = (title: string, address: string, name: string, description: string) => (
    <UiEntity key={title} uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <BitmapText value={title} fontSize={34} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 10 } }} />
        {townPhoto(address, TOWN_TITLE_PHOTO_SIZE)}
        <UiEntity uiTransform={{ width: '100%', height: 8 }} />
        {townCardLine(name, 22, BANK_CREAM)}
        {townCardLine(description, 16, BANK_CAPTION)}
    </UiEntity>
)

const townOwnersCard = (owners: readonly { kind: string; address: string; name: string }[]) => (
    <UiEntity key="owners" uiTransform={{ width: '100%', flexDirection: 'column', alignItems: 'center' }}>
        <BitmapText value={t('town.newOwners')} fontSize={34} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { bottom: 16 } }} />
        <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', justifyContent: 'center' }}>
            {owners.map((owner, index) => (
                <UiEntity key={`${index}`} uiTransform={{ width: TOWN_OWNER_WIDTH, flexDirection: 'column', alignItems: 'center' }}>
                    {townPhoto(owner.address, TOWN_OWNER_PHOTO_SIZE)}
                    <UiEntity uiTransform={{ width: '100%', height: 8 }} />
                    {townCardLine(owner.name, 16, BANK_CREAM)}
                    {townCardLine(itemName(findItem(owner.kind as ShopItemId), owner.kind), 16, BANK_GOLD_LIGHT)}
                </UiEntity>
            ))}
        </UiEntity>
    </UiEntity>
)

const townArrow = (label: string, onPress: () => void) => (
    <Button
        value={label}
        fontSize={34}
        color={BANK_INK}
        uiTransform={{ width: TOWN_ARROW_SIZE, height: TOWN_ARROW_SIZE, flexShrink: 0, borderRadius: 8 }}
        uiBackground={{ color: BANK_GOLD }}
        onMouseDown={onPress}
    />
)

/** Everyone in the scene now, as this client sees them: name, or a short address for a guest without one. */
function activeUserNames(): string[] {
    const names: string[] = []
    for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
        const address = identity.address
        if (address === '') continue
        const name = AvatarBase.getOrNull(entity)?.name ?? ''
        names.push(name !== '' ? name : `${address.slice(0, 6)}...${address.slice(-4)}`)
    }
    return names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

const townActiveUsersCard = () => {
    const names = activeUserNames()
    const fits = TOWN_USERS_MAX_ROWS * 3
    // With more than fit, the last slot says how many are left out.
    const shown = names.length > fits ? names.slice(0, fits - 1) : names
    const hidden = names.length - shown.length
    const cell = (value: string, key: string, color: Color4) => (
        <Label
            key={key}
            value={value.length > TOWN_USERS_NAME_CHARS ? `${value.slice(0, TOWN_USERS_NAME_CHARS - 1)}…` : value}
            fontSize={TOWN_USERS_FONT}
            color={color}
            textAlign="middle-left"
            textWrap="nowrap"
            uiTransform={{ width: '33%', height: TOWN_USERS_ROW_HEIGHT }}
        />
    )
    return (
        <UiEntity key="active-users" uiTransform={{ width: '100%', height: '100%', flexDirection: 'column', alignItems: 'center' }}>
            <BitmapText value={t('town.activeUsers')} fontSize={34} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%' }} />
            {townCardLine(t('town.activeUsersCount', { count: names.length }), 16, BANK_CAPTION)}
            <UiEntity uiTransform={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', margin: { top: 8 } }}>
                {shown.map((name, index) => cell(name, `${index}`, BANK_CREAM))}
                {hidden > 0 ? cell(t('town.more', { count: hidden }), 'more', BANK_CAPTION) : null}
            </UiEntity>
        </UiEntity>
    )
}

/** Only what has someone to show: a title nobody holds gets no card at all. */
function townBoardCards(): ReactEcs.JSX.Element[] {
    const board = getTownTitles()
    const cards: ReactEcs.JSX.Element[] = []
    for (const entry of TOWN_TITLES) {
        const holder = board?.titles.find((title) => title.id === entry.id)
        if (holder !== undefined) cards.push(townTitleCard(entry.title, holder.address, holder.name, `${entry.feat}: ${entry.value(holder.value)}`))
    }
    if (board !== null && board.owners.length > 0) cards.push(townOwnersCard(board.owners))
    // Always last, and always there: whoever is in the scene right now.
    cards.push(townActiveUsersCard())
    return cards
}

const townBoardPanel = () => {
    const cards = townBoardCards()
    // A card can go away while the board is open, so the page is kept in range here.
    const page = cards.length > 0 ? Math.min(townBoardPage, cards.length - 1) : 0
    const step = (by: number) => {
        townBoardPage = (page + by + cards.length) % cards.length
    }
    return (
        <UiEntity
            uiTransform={{
                width: TOWN_BOARD_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            <BitmapText value={t('town.title')} fontSize={40} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%' }} />
            {townCardLine(t('town.last7Days'), 16, BANK_CAPTION)}
            <Button
                value="X"
                fontSize={30}
                color={Color4.White()}
                uiTransform={{ positionType: 'absolute', position: { top: BANK_PANEL_PADDING, right: BANK_PANEL_PADDING }, width: 48, height: 48, borderRadius: PANEL_RADIUS }}
                uiBackground={{ color: MAP_CLOSE_COLOR }}
                onMouseDown={() => {
                    townBoardOpen = false
                }}
            />
            <UiEntity uiTransform={{ width: '100%', height: TOWN_CARD_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { top: 10 } }}>
                {cards.length > 1 ? townArrow('<', () => step(-1)) : <UiEntity uiTransform={{ width: TOWN_ARROW_SIZE, flexShrink: 0 }} />}
                <UiEntity
                    uiTransform={{
                        flexGrow: 1,
                        height: '100%',
                        margin: { left: 10, right: 10 },
                        padding: 12,
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        borderWidth: 2,
                        borderColor: BANK_TRIM
                    }}
                    uiBackground={{ color: BANK_WOOD }}
                >
                    {cards.length > 0 ? cards[page] : townCardLine(t('town.empty'), 16, BANK_CAPTION)}
                </UiEntity>
                {cards.length > 1 ? townArrow('>', () => step(1)) : <UiEntity uiTransform={{ width: TOWN_ARROW_SIZE, flexShrink: 0 }} />}
            </UiEntity>
            {cards.length > 1 ? townCardLine(`${page + 1} / ${cards.length}`, 16, BANK_CAPTION) : null}
        </UiEntity>
    )
}

// --- Casino ------------------------------------------------------------------------------
//
// The slot machine, in the bank's dress.

const SLOT_REEL_WIDTH = 140
const SLOT_REEL_HEIGHT = 120
const SLOT_REEL_ICON_SIZE = 100
const SLOT_PAY_ICON_SIZE = 26
/** The jackpot and pay boxes, side by side: as tall as the six pay rows need, so both end level. */
const SLOT_TABLES_HEIGHT = 206
const SLOT_INFO_BAR_HEIGHT = 96
/** Unfolded, the bar holds no pot and gives its room back, so the panel still fits a phone's 720. */
const SLOT_INFO_BAR_OPEN_HEIGHT = 48
const SLOT_JACKPOT_ROW_COLOR = Color4.create(0.88, 0.7, 0.32, 0.18)

// On mobile the machine fills the screen, over the HUD and the dock, like the store: 720 less its
// margins, with the purse and the unfolded tables in it too, so every piece is a size smaller.
const SLOT_MOBILE_REEL_HEIGHT = 96
const SLOT_MOBILE_REEL_ICON_SIZE = 80
const SLOT_MOBILE_PAY_ICON_SIZE = 22
/** Six pay rows of SLOT_MOBILE_PAY_ICON_SIZE, plus the caption and the box's padding. */
const SLOT_MOBILE_TABLES_HEIGHT = 178

/** Every size the machine changes between desktop and mobile. */
function slotLayout() {
    const mobile = isMobile()
    return {
        mobile,
        reelHeight: mobile ? SLOT_MOBILE_REEL_HEIGHT : SLOT_REEL_HEIGHT,
        reelIcon: mobile ? SLOT_MOBILE_REEL_ICON_SIZE : SLOT_REEL_ICON_SIZE,
        payIcon: mobile ? SLOT_MOBILE_PAY_ICON_SIZE : SLOT_PAY_ICON_SIZE,
        tablesHeight: mobile ? SLOT_MOBILE_TABLES_HEIGHT : SLOT_TABLES_HEIGHT,
        titleSize: mobile ? 40 : 52,
        taglineHeight: mobile ? 24 : 28,
        taglineGap: mobile ? 2 : 4,
        // Between blocks: on mobile the panel's space-between puts the room there instead.
        reelsGap: mobile ? 0 : 10,
        messageSize: mobile ? 32 : 40,
        messageGap: mobile ? 10 : 10,
        betHeight: mobile ? 52 : 60,
        betGap: mobile ? 0 : 24,
        spinGap: mobile ? 10 : 12,
        spinHeight: mobile ? 56 : 68,
        infoGap: mobile ? 0 : 12
    }
}

/** One of the machine's four blocks (title, reels, bets, info): kept whole, never squashed. */
const slotBlock = (key: string, ...children: (ReactEcs.JSX.Element | null)[]) => (
    <UiEntity key={key} uiTransform={{ width: '100%', flexShrink: 0, flexDirection: 'column', alignItems: 'center' }}>
        {children}
    </UiEntity>
)
/** Each reel's box changes colour with its symbol, picked to set the icon off. */
const SLOT_SYMBOL_BACKGROUNDS: Record<string, Color4> = {
    horseshoe: Color4.fromHexString('#2F5D3AFF'),
    spade: Color4.fromHexString('#C9A86AFF'),
    bell: Color4.fromHexString('#6E1F1FFF'),
    diamond: Color4.fromHexString('#1F3350FF'),
    heart: Color4.fromHexString('#F0DFC0FF')
}
const SLOT_SYMBOL_ICONS: Record<string, Icon> = {
    horseshoe: atlasCell(6, 3), // F3
    spade: atlasCell(7, 3), // G3
    bell: atlasCell(8, 3), // H3
    diamond: atlasCell(5, 4), // E4
    heart: atlasCell(6, 4) // F4
}

const slotReel = (reel: number, index: number) => (
    <UiEntity
        key={`${index}`}
        uiTransform={{
            width: SLOT_REEL_WIDTH,
            height: slotLayout().reelHeight,
            flexShrink: 0,
            justifyContent: 'center',
            alignItems: 'center',
            margin: { left: 6, right: 6 },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_GOLD
        }}
        uiBackground={{ color: SLOT_SYMBOL_BACKGROUNDS[SLOT_SYMBOLS[reel].id] }}
    >
        <UiEntity
            uiTransform={{ width: slotLayout().reelIcon, height: slotLayout().reelIcon }}
            uiBackground={iconBackground(SLOT_SYMBOL_ICONS[SLOT_SYMBOLS[reel].id])}
        />
    </UiEntity>
)

/** One row of the pay table: the symbol, the combination, and what it pays. */
const slotPayLine = (key: string, symbolId: string, combination: string, pays: string, highlighted: boolean = false) => (
    <UiEntity
        key={key}
        uiTransform={{
            width: '100%',
            height: slotLayout().payIcon,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            padding: { left: 6, right: 6 },
            borderRadius: 6
        }}
        uiBackground={highlighted ? { color: SLOT_JACKPOT_ROW_COLOR } : undefined}
    >
        <UiEntity
            uiTransform={{ width: slotLayout().payIcon, height: slotLayout().payIcon, flexShrink: 0, margin: { right: 8 } }}
            uiBackground={iconBackground(SLOT_SYMBOL_ICONS[symbolId])}
        />
        <Label value={combination} fontSize={16} color={BANK_CREAM} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: '46%', height: slotLayout().payIcon, flexShrink: 0 }} />
        <Label value={pays} fontSize={16} color={BANK_GOLD_LIGHT} textAlign="middle-right" textWrap="nowrap" uiTransform={{ flexGrow: 1, height: slotLayout().payIcon }} />
    </UiEntity>
)

/** Folds and unfolds the jackpot and pay boxes. The pot shows here only while they are folded away. */
const slotInfoBar = (jackpot: number) => (
    <UiEntity
        uiTransform={{
            width: '100%',
            height: isSlotInfoOpen() ? SLOT_INFO_BAR_OPEN_HEIGHT : SLOT_INFO_BAR_HEIGHT,
            flexShrink: 0,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: { left: 18, right: 18 },
            margin: { top: slotLayout().infoGap },
            borderRadius: 10,
            borderWidth: 2,
            borderColor: BANK_TRIM
        }}
        uiBackground={{ color: BANK_WOOD }}
        onMouseDown={toggleSlotInfo}
    >
        <UiEntity uiTransform={{ width: '55%', height: '100%', flexDirection: 'row', alignItems: 'center' }}>
            {isSlotInfoOpen() ? null : (
                <Label value={t('slots.jackpot')} fontSize={16} color={BANK_CAPTION} textAlign="middle-left" textWrap="nowrap" uiTransform={{ width: 90, height: '100%', flexShrink: 0 }} />
            )}
            {isSlotInfoOpen() ? null : (
                <BitmapText value={coinsCaps(jackpot)} fontSize={30} color={COIN_COLOR} />
            )}
        </UiEntity>
        <Label
            value={`${t('slots.howItPays')}  ${isSlotInfoOpen() ? '-' : '+'}`}
            fontSize={16}
            color={BANK_CREAM}
            textAlign="middle-right"
            textWrap="nowrap"
            uiTransform={{ width: '40%', height: '100%' }}
        />
    </UiEntity>
)

const casinoPanel = () => {
    const bet = getSlotBet()
    const canSpin = canSpinSlot()
    const jackpot = getJackpot()
    const bellsPay = withCommas(threeBellsPay(jackpot, bet))
    const jackpotHint =
        bet >= SLOT_MAX_BET
            ? t('slots.bellsPayMax', { coins: bellsPay })
            : t('slots.bellsPay', { coins: bellsPay, max: SLOT_MAX_BET })
    const layout = slotLayout()
    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                minWidth: PANEL_MIN_WIDTH,
                // On mobile, like the store: the full screen height, over the HUD (the purse under
                // the title stands in for it), and the four blocks spread out over it. On desktop
                // it fits its contents.
                ...(layout.mobile ? { flexGrow: 1, margin: { top: HUD_MARGIN, bottom: HUD_MARGIN }, justifyContent: 'space-between' } : {}),
                flexDirection: 'column',
                alignItems: 'center',
                padding: BANK_PANEL_PADDING,
                borderRadius: PANEL_RADIUS,
                borderWidth: 3,
                borderColor: BANK_TRIM
            }}
            uiBackground={{ color: BANK_WOOD_DARK }}
        >
            {slotBlock(
                'header',
                <BitmapText value={t('slots.title')} fontSize={layout.titleSize} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%' }} />,
                // flexShrink 0: shrunk to nothing, the reels drew over it.
                <Label
                    value={`<i>${getSlotTagline()}</i>`}
                    fontSize={20}
                    color={BANK_CREAM}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: layout.taglineHeight, flexShrink: 0, margin: { top: layout.taglineGap } }}
                />,
                // What there is to bet with, as in the store.
                coinPurse()
            )}

            {/* The machine: the reels, and what they just did. The message is not a button. */}
            {slotBlock(
                'machine',
                <UiEntity uiTransform={{ width: '100%', height: layout.reelHeight, flexShrink: 0, flexDirection: 'row', justifyContent: 'center', margin: { top: layout.reelsGap } }}>
                    {getSlotReels().map((reel, index) => slotReel(reel, index))}
                </UiEntity>,
                <BitmapText value={upper(getSlotMessage())} fontSize={layout.messageSize} color={BANK_GOLD_LIGHT} align="center" uiTransform={{ width: '100%', margin: { top: layout.messageGap } }} />
            )}

            {slotBlock(
                'bet',
                <UiEntity uiTransform={{ width: '100%', height: layout.betHeight, flexShrink: 0, flexDirection: 'row', justifyContent: 'space-between', margin: { top: layout.betGap } }}>
                    {SLOT_BETS.map((option) => (
                        <UiEntity key={`${option}`} uiTransform={{ width: '32%', height: layout.betHeight }}>
                            {bankButton(
                                coinsCaps(option),
                                () => setSlotBet(option),
                                { width: '100%', height: layout.betHeight },
                                30,
                                option === bet ? BANK_GOLD : BANK_STEP_COLOR,
                                option === bet ? BANK_INK : BANK_CREAM
                            )}
                        </UiEntity>
                    ))}
                </UiEntity>,
                <UiEntity uiTransform={{ width: '100%', height: layout.spinGap, flexShrink: 0 }} />,
                bankButton(
                    isSlotSpinning() ? t('slots.spinning') : getCoins() < bet ? t('slots.notEnough') : t('slots.spinFor', { bet }),
                    canSpin ? spinSlot : () => {},
                    { width: '100%', height: layout.spinHeight },
                    40,
                    canSpin ? BANK_GOLD : DISABLED_COLOR,
                    canSpin ? BANK_INK : MUTED_COLOR
                )
            )}

            {/* What is at stake, and what pays: folded away until asked for. */}
            {slotBlock(
                'info',
                slotInfoBar(jackpot),
                isSlotInfoOpen() ? (
                    <UiEntity uiTransform={{ width: '100%', flexShrink: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
                        {bankSection(
                            t('slots.jackpot'),
                            <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', justifyContent: 'center' }}>
                                <BitmapText
                                    value={coinsCaps(jackpot)}
                                    fontSize={42}
                                    color={COIN_COLOR}
                                    align="left"
                                    uiTransform={{ width: '100%', height: 44 }}
                                />
                                <Label
                                    value={t('slots.grows')}
                                    fontSize={16}
                                    color={BANK_CREAM}
                                    textAlign="middle-left"
                                    uiTransform={{ width: '100%', height: 22, flexShrink: 0 }}
                                />
                                <Label
                                    value={jackpotHint}
                                    fontSize={16}
                                    color={BANK_CAPTION}
                                    textAlign="middle-left"
                                    textWrap="wrap"
                                    uiTransform={{ width: '100%', height: 44, flexShrink: 0 }}
                                />
                            </UiEntity>,
                            { width: '49%', height: layout.tablesHeight }
                        )}
                        {bankSection(
                            t('slots.pays'),
                            [
                                slotPayLine('two', 'horseshoe', 'x2', `x${TWO_HORSESHOES_PAY}`),
                                ...SLOT_SYMBOLS.map((symbol) =>
                                    slotPayLine(
                                        symbol.id,
                                        symbol.id,
                                        'x3',
                                        symbol.id === 'bell' ? `x${symbol.pays} + ${t('slots.jackpot')}` : `x${symbol.pays}`,
                                        symbol.id === 'bell'
                                    )
                                )
                            ],
                            { width: '49%', height: layout.tablesHeight }
                        )}
                    </UiEntity>
                ) : null
            )}

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
                onMouseDown={closeCasinoPanel}
            />
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
        {notificationsButton()}
        {soundButton()}
        {townBoardButton()}
        {feedbackButton()}
        {rewardsButton()}
        {feedbackMenuOpen ? feedbackMenu() : null}
        {isLocalPreview() && (DEBUG_RESET_PROGRESS || DEBUG_ADD_COINS || DEBUG_ADD_ORE || DEBUG_SERVER_STATUS) ? debugBox() : null}
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
            {moveCloserHint()}
            {orePopup()}
            {dock()}
            {/* The panels go last so they draw over the HUD and the bottom buttons: on mobile
                they are tall enough to reach both. */}
            {mapOpen ? mapPanel() : null}
            {inventoryOpen ? inventoryPanel() : null}
            {notificationsOpen ? notificationsPanel() : null}
            {soundOpen ? soundPanel() : null}
            {townBoardOpen ? townBoardPanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isBankPanelOpen() ? bankPanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isStorePanelOpen() ? storePanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isLandOfficePanelOpen() ? landOfficePanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && sellWarningFor !== null ? sellWarningPanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isClaimOfficePanelOpen() ? claimOfficePanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isTailorShopPanelOpen() ? tailorShopPanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isMulePanelOpen() && getMuleCount() > 0 ? mulePanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isOwnerCardOpen() ? ownerCardPanel() : null}
            {!mapOpen && !inventoryOpen && !notificationsOpen && !soundOpen && !townBoardOpen && isCasinoPanelOpen() ? casinoPanel() : null}
            {dockDropdowns()}
            {/* Over every other panel: it waits for its button and nothing else. */}
            {/* Coins owed wait for play (world/game-phase.ts): never over the title card or the intro. */}
            {getCompensation() !== null && isPlaying() ? compensationPanel(getCompensation()!) : null}
            {/* Last of all: the language must always be reachable. */}
            {languageLayer()}
        </UiEntity>
        {welcomeOverlay()}
        {introScreen()}
        {/* Over everything, the title card included: nothing else here is saved any more, and a
            player stuck loading must still see RECONNECT. Centred and as wide as main-container.
            Not over the intro, though (world/game-phase.ts): it waits for play. */}
        {getUpdateScreen() !== null && canShowBlockingScreen() ? (
            <UiEntity
                uiTransform={{
                    positionType: 'absolute',
                    width: '100%',
                    height: '100%',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                <UiEntity uiTransform={{ width: MAIN_CONTAINER_WIDTH, height: '100%', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    {updatePanel(getUpdateScreen()!)}
                </UiEntity>
            </UiEntity>
        ) : null}
    </UiEntity>
)
