import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { engine, AudioSource, Transform } from "@dcl/sdk/ecs"
import { getCoins, getOre } from './shared/state/wallet'
import { isPlayerAtMine } from './mining/mine-proximity'
import { changeSellAmount, getSellAmount, isPlayerAtBank, sellSelectedOre, setSellAmount } from './bank/bank'
import { getCarryCapacity, getOrePerHit, getSyncedRate, quoteSaleForDisplay, sendSwing } from './net/economy-link'
import { buySelected, getSelectedItem, getSelectedItemId, isPlayerAtShop, selectItem } from './shop/shop'
import { bestPick, CATALOGUE, ShopItem } from './shared/economy/catalogue'
import { getOwned } from './shared/state/inventory'
import { playMineEmote } from './player/mine-emote'
import { getServerTick, isServerOnline } from './net/server-link'

// The mining tap. The swing itself is settled — H1-01 and H1-04 both `survived`, the second
// one thanks to the hit/miss sound and the flash below. What is new here is the payout: a
// swing now puts raw ore in the bag, and the HUD shows it.
//
// H1-01 deliberately showed no score. That experiment is closed, so the counter is no longer
// withheld — see design/01-find-the-fun/H1-04-sound-and-juice-lift-the-tap_survived.md
//
// The bar itself is contextual, per §6: it only exists while the player stands at the dig.
// The HUD is the one permanent thing on screen.

const SWEET_SPOT_START = 0.42
const SWEET_SPOT_END = 0.58
const SWEEP_PERIOD_SECONDS = 1.6
const FLASH_DURATION_SECONDS = 0.22
const PULSE_EXTRA_HEIGHT = 18 // px, on top of BAR_HEIGHT, during a hit flash

let elapsedSeconds = 0
let needlePos = 0 // 0..1 across the bar
let flashColor: 'hit' | 'miss' | null = null
let flashTimer = 0
let swingCount = 0

const HIT_SOUND_CLIP = 'assets/sounds/match.mp3'
const MISS_SOUND_CLIP = 'assets/sounds/fail.mp3'

let hitSoundEntity: ReturnType<typeof engine.addEntity> | null = null
let missSoundEntity: ReturnType<typeof engine.addEntity> | null = null

// Two hits in a row have to be heard twice. Toggling `playing` false->true inside one tick
// does not do that: the CRDT only ships the final state of the frame, so the renderer never
// sees a change and the clip is left alone, still playing. `AudioSource.playSound` replaces
// the whole component with currentTime 0, which always emits a PUT and so always retriggers.
function playSound(entity: ReturnType<typeof engine.addEntity> | null, clip: string) {
    if (entity === null) return
    AudioSource.playSound(entity, clip, true)
}

function updateNeedle(dt: number) {
    elapsedSeconds += dt
    const t = (elapsedSeconds % SWEEP_PERIOD_SECONDS) / SWEEP_PERIOD_SECONDS
    needlePos = t < 0.5 ? t * 2 : 2 - t * 2

    if (flashTimer > 0) {
        flashTimer -= dt
        if (flashTimer <= 0) flashColor = null
    }
}

function onSwing() {
    swingCount += 1
    const isHit = needlePos >= SWEET_SPOT_START && needlePos <= SWEET_SPOT_END
    const oreGained = isHit ? getOrePerHit() : 0

    // The ore is the server's to grant, so this only reports the swing. The flash, the sound
    // and the emote stay local and immediate: waiting a round trip to acknowledge a tap
    // would make the bar feel broken, and none of them touch a balance.
    sendSwing(isHit)
    flashColor = isHit ? 'hit' : 'miss'
    flashTimer = FLASH_DURATION_SECONDS
    playMineEmote()
    if (isHit) playSound(hitSoundEntity, HIT_SOUND_CLIP)
    else playSound(missSoundEntity, MISS_SOUND_CLIP)
    console.log(`[mine] swing #${swingCount}: ${isHit ? 'HIT' : 'miss'}, ${oreGained} ore requested`)
}

export function setupUi() {
    engine.addSystem(updateNeedle)

    hitSoundEntity = engine.addEntity()
    Transform.create(hitSoundEntity, {})
    AudioSource.create(hitSoundEntity, {
        audioClipUrl: HIT_SOUND_CLIP,
        playing: false,
        loop: false,
        volume: 0.8,
        global: true
    })

    missSoundEntity = engine.addEntity()
    Transform.create(missSoundEntity, {})
    AudioSource.create(missSoundEntity, {
        audioClipUrl: MISS_SOUND_CLIP,
        playing: false,
        loop: false,
        volume: 0.6,
        global: true
    })

    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
}

const BAR_WIDTH = 500
const BAR_HEIGHT = 50

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
// the top of the container. The mining bar and the bank panel are contextual — they exist
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
// bottom centre, out of the way of the mining bar and the panels, and says plainly whether
// the authoritative server is answering. Green with a rising number means it is.
// --- HUD -------------------------------------------------------------------------------
//
// One horizontal pill at the top of the centred column, centred in X and sized to whatever it
// holds. It stays inside the column rather than the screen, so it never lands on top of the
// explorer's own interface. Tool, ore and coins, three segments split by hair lines, each an
// icon beside a caption and its value.
//
// TBD: the icons are placeholders taken from atlas_01.png — the first three cells of a 4x4
// grid. Swap ATLAS_* below when the real art lands; nothing else needs to change.
const ATLAS = 'assets/images/atlas_01.png'
const ATLAS_COLUMNS = 4
const ATLAS_ROWS = 4

const HUD_MARGIN = 16
const HUD_HEIGHT = 64
const HUD_ICON_SIZE = 34
const HUD_CAPTION_SIZE = 15
const HUD_VALUE_SIZE = 24
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

const ICON_PICK = atlasCell(1, 1)
const ICON_ORE = atlasCell(2, 1)
const ICON_COINS = atlasCell(3, 1)

const SERVER_ONLINE_COLOR = Color4.create(0.3, 0.9, 0.4, 1)
const SERVER_OFFLINE_COLOR = Color4.create(1, 0.3, 0.3, 1)
const SERVER_LABEL_HEIGHT = 28

function barBackgroundColor(): Color4 {
    if (flashColor === 'hit') return Color4.create(0.35, 1, 0.4, 1)
    if (flashColor === 'miss') return Color4.create(0.5, 0.15, 0.15, 1)
    return Color4.create(0.15, 0.15, 0.15, 0.9)
}

function barHeight(): number {
    return flashColor === 'hit' ? BAR_HEIGHT + PULSE_EXTRA_HEIGHT : BAR_HEIGHT
}

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

/** Icon, caption, value. The caption is omitted for the tool, which reads as its own label. */
const hudSegment = (uvs: number[], caption: string | null, value: string, color: Color4) => (
    <UiEntity uiTransform={{ height: '100%', flexDirection: 'row', alignItems: 'center' }}>
        {hudIcon(uvs)}
        <UiEntity uiTransform={{ flexDirection: 'column', justifyContent: 'center' }}>
            {caption !== null ? (
                <Label
                    value={caption}
                    fontSize={HUD_CAPTION_SIZE}
                    color={MUTED_COLOR}
                    textAlign="middle-left"
                    uiTransform={{ height: HUD_CAPTION_SIZE + 6 }}
                />
            ) : null}
            <Label
                value={value}
                fontSize={HUD_VALUE_SIZE}
                color={color}
                textAlign="middle-left"
                uiTransform={{ height: HUD_VALUE_SIZE + 6 }}
            />
        </UiEntity>
    </UiEntity>
)

const hud = () => {
    const pick = bestPick((id) => getOwned(id))
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
                height: HUD_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                padding: { left: 18, right: 22 },
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: HUD_BACKGROUND }}
        >
            {hudSegment(ICON_PICK, null, pick?.label ?? 'No pick', Color4.White())}
            {hudDivider()}
            {hudSegment(ICON_ORE, 'Ore', capacity > 0 ? `${getOre()} / ${capacity}` : `${getOre()}`, ORE_COLOR)}
            {hudDivider()}
            {hudSegment(ICON_COINS, 'Coins', `${getCoins()}`, COIN_COLOR)}
        </UiEntity>
        </UiEntity>
    )
}

function isBagFull(): boolean {
    const capacity = getCarryCapacity()
    return capacity > 0 && getOre() >= capacity
}

// A tap that answers but pays nothing reads as broken, so at capacity the bar is replaced
// rather than left running. The wording says what to do next, not just what went wrong.
const bagFullNotice = () => (
    <UiEntity
        uiTransform={{
            width: BAR_WIDTH,
            height: BAR_HEIGHT,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: PANEL_RADIUS
        }}
        uiBackground={{ color: PANEL_BACKGROUND }}
    >
        <Label
            value={`Bag full — ${getOre()}/${getCarryCapacity()} ore. Sell at the bank.`}
            fontSize={20}
            color={MUTED_COLOR}
            textAlign="middle-center"
            uiTransform={{ width: '100%', height: BAR_HEIGHT }}
        />
    </UiEntity>
)

const miningBar = () => (
    <UiEntity
        uiTransform={{
            width: BAR_WIDTH,
            height: BAR_HEIGHT + PULSE_EXTRA_HEIGHT,
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
        }}
    >
        <Label
            value="Tap the bar whenever it feels right"
            fontSize={20}
            color={Color4.White()}
            uiTransform={{ width: BAR_WIDTH, height: 30, margin: { bottom: 12 } }}
        />
        <UiEntity
            uiTransform={{
                width: BAR_WIDTH,
                height: barHeight(),
                positionType: 'relative'
            }}
            uiBackground={{ color: barBackgroundColor() }}
            onMouseDown={onSwing}
        >
            {/* sweet spot zone */}
            <UiEntity
                uiTransform={{
                    width: `${(SWEET_SPOT_END - SWEET_SPOT_START) * 100}%`,
                    height: '100%',
                    positionType: 'absolute',
                    position: { left: `${SWEET_SPOT_START * 100}%`, top: 0 }
                }}
                uiBackground={{ color: Color4.create(0.2, 0.6, 0.25, 0.6) }}
            />
            {/* moving needle */}
            <UiEntity
                uiTransform={{
                    width: 6,
                    height: '100%',
                    positionType: 'absolute',
                    position: { left: `${needlePos * (100 - (6 / BAR_WIDTH) * 100)}%`, top: 0 }
                }}
                uiBackground={{ color: Color4.White() }}
            />
        </UiEntity>
    </UiEntity>
)

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
            <Label
                value="The Bank"
                fontSize={30}
                color={Color4.White()}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: 42 }}
            />
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
    const affordable = getCoins() >= item.price

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
            <Label
                value={item.label}
                fontSize={22}
                color={Color4.White()}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: 30 }}
            />
            <Label
                value={`${item.price} coins`}
                fontSize={18}
                color={affordable ? COIN_COLOR : MUTED_COLOR}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: 24 }}
            />
            {owned > 0 ? (
                <Label
                    value={`owned ${owned}`}
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

const marketPanel = () => {
    const selected = getSelectedItem()
    const coins = getCoins()
    const affordable = selected !== null && coins >= selected.price

    return (
        <UiEntity
            uiTransform={{
                width: '100%',
                height: 360,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            <Label
                value="Market"
                fontSize={30}
                color={Color4.White()}
                textAlign="middle-center"
                uiTransform={{ width: '100%', height: 42 }}
            />

            {shopRow(CATALOGUE.slice(0, 3))}
            {shopRow(CATALOGUE.slice(3))}

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
                    value={affordable ? `Buy ${selected.label}` : `Need ${selected.price - coins} more coins`}
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
            {isPlayerAtMine() ? (isBagFull() ? bagFullNotice() : miningBar()) : null}
            {isPlayerAtBank() ? bankPanel() : null}
            {isPlayerAtShop() ? marketPanel() : null}
            {serverStatus()}
        </UiEntity>
    </UiEntity>
)
