import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { engine, AudioSource, Transform } from "@dcl/sdk/ecs"
import { ORE_PER_HIT, ORE_PER_MISS } from './economy/constants'
import { addOre, getCoins, getOre } from './state/wallet'
import { isPlayerAtMine } from './mining/mine-proximity'

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

let hitSoundEntity: ReturnType<typeof engine.addEntity> | null = null
let missSoundEntity: ReturnType<typeof engine.addEntity> | null = null

function playSound(entity: ReturnType<typeof engine.addEntity> | null) {
    if (entity === null) return
    const audio = AudioSource.getMutable(entity)
    audio.playing = false
    audio.playing = true
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
    playSound(isHit ? hitSoundEntity : missSoundEntity)
    console.log(`[mine] swing #${swingCount}: ${isHit ? 'HIT' : 'miss'} +${oreGained} ore (total ${getOre()})`)
}

export function setupUi() {
    engine.addSystem(updateNeedle)

    hitSoundEntity = engine.addEntity()
    Transform.create(hitSoundEntity, {})
    AudioSource.create(hitSoundEntity, {
        audioClipUrl: 'assets/sounds/match.mp3',
        playing: false,
        loop: false,
        volume: 0.8,
        global: true
    })

    missSoundEntity = engine.addEntity()
    Transform.create(missSoundEntity, {})
    AudioSource.create(missSoundEntity, {
        audioClipUrl: 'assets/sounds/fail.mp3',
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
// keeps a single, predictable frame as more of it arrives (the bank, the buy menu).
const MAIN_CONTAINER_WIDTH = '40%'

// The HUD is the only permanent thing on screen (§6): small, clear of the thumb, pinned to
// the top of the container. Magenta is reserved for interactables (§7), so it never appears here.
const HUD_PANEL_WIDTH = 220
const HUD_ROW_HEIGHT = 34
const PANEL_BACKGROUND = Color4.create(0, 0, 0, 0.8)
const PANEL_RADIUS = 12
const ORE_COLOR = Color4.create(0.92, 0.92, 0.88, 1)
const COIN_COLOR = Color4.create(1, 0.84, 0.35, 1)

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
        </UiEntity>
    </UiEntity>
)
