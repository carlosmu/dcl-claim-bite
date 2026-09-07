import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { engine, AudioSource, Transform } from "@dcl/sdk/ecs"
import { ORE_PER_HIT, ORE_PER_MISS } from './economy/constants'
import { addOre, getCoins, getOre } from './state/wallet'
import { isPlayerAtMine } from './mining/mine-proximity'
import { changeSellAmount, getSellAmount, isPlayerAtBank, sellSelectedOre, setSellAmount } from './bank/bank'
import { getOrePrice, quoteSale } from './state/market'
import { buySelected, getSelectedItem, getSelectedItemId, isPlayerAtShop, selectItem } from './shop/shop'
import { CATALOGUE, ShopItem } from './economy/catalogue'
import { getOwned } from './state/inventory'
import { playMineEmote } from './player/mine-emote'

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
    const oreGained = isHit ? ORE_PER_HIT : ORE_PER_MISS
    addOre(oreGained)
    flashColor = isHit ? 'hit' : 'miss'
    flashTimer = FLASH_DURATION_SECONDS
    playMineEmote()
    if (isHit) playSound(hitSoundEntity, HIT_SOUND_CLIP)
    else playSound(missSoundEntity, MISS_SOUND_CLIP)
    console.log(`[mine] swing #${swingCount}: ${isHit ? 'HIT' : 'miss'} +${oreGained} ore (total ${getOre()})`)
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

// Everything on screen lives inside one centered column 40% of the screen wide, so the UI
// keeps a single, predictable frame as more of it arrives.
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

function barBackgroundColor(): Color4 {
    if (flashColor === 'hit') return Color4.create(0.35, 1, 0.4, 1)
    if (flashColor === 'miss') return Color4.create(0.5, 0.15, 0.15, 1)
    return Color4.create(0.15, 0.15, 0.15, 0.9)
}

function barHeight(): number {
    return flashColor === 'hit' ? BAR_HEIGHT + PULSE_EXTRA_HEIGHT : BAR_HEIGHT
}

const hud = () => (
    <UiEntity
        uiTransform={{
            positionType: 'absolute',
            position: { top: 24, right: 0 },
            width: HUD_PANEL_WIDTH,
            height: HUD_ROW_HEIGHT * 2 + 20,
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: { top: 10, bottom: 10, left: 16, right: 16 },
            borderRadius: PANEL_RADIUS
        }}
        uiBackground={{ color: PANEL_BACKGROUND }}
    >
        <Label
            value={`Ore  ${getOre()}`}
            fontSize={24}
            color={ORE_COLOR}
            textAlign="middle-right"
            uiTransform={{ width: '100%', height: HUD_ROW_HEIGHT }}
        />
        <Label
            value={`Coins  ${getCoins()}`}
            fontSize={24}
            color={COIN_COLOR}
            textAlign="middle-right"
            uiTransform={{ width: '100%', height: HUD_ROW_HEIGHT }}
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
    const payout = quoteSale(amount)

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
            {infoRow('Town price', `${getOrePrice().toFixed(2)} coins / ore`, ORE_COLOR)}
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
            {isPlayerAtMine() ? miningBar() : null}
            {isPlayerAtBank() ? bankPanel() : null}
            {isPlayerAtShop() ? marketPanel() : null}
        </UiEntity>
    </UiEntity>
)
