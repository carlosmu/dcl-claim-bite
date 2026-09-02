import ReactEcs, { ReactEcsRenderer, UiEntity, Label } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { engine, AudioSource, Transform } from "@dcl/sdk/ecs"

// H1-01/H1-04 experiment: is the tap-timing swing fun on its own, then with sound + juice added?
// No score is shown on screen on purpose — see design/01-find-the-fun/H1-04-sound-and-juice-lift-the-tap_active.md

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
    flashColor = isHit ? 'hit' : 'miss'
    flashTimer = FLASH_DURATION_SECONDS
    playSound(isHit ? hitSoundEntity : missSoundEntity)
    console.log(`[H1-04] swing #${swingCount}: ${isHit ? 'HIT' : 'miss'} (needle at ${needlePos.toFixed(2)})`)
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

function barBackgroundColor(): Color4 {
    if (flashColor === 'hit') return Color4.create(0.35, 1, 0.4, 1)
    if (flashColor === 'miss') return Color4.create(0.5, 0.15, 0.15, 1)
    return Color4.create(0.15, 0.15, 0.15, 0.9)
}

function barHeight(): number {
    return flashColor === 'hit' ? BAR_HEIGHT + PULSE_EXTRA_HEIGHT : BAR_HEIGHT
}

export const uiMenu = () => (
    <UiEntity
        uiTransform={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column'
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
