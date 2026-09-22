import { engine } from '@dcl/sdk/ecs'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { BitmapText } from './bitmap-text'
import { Color4 } from '@dcl/sdk/math'
import { startTownMusic, stopIntroMusic } from '../world/music'
import { playWelcomeCinematic } from '../world/welcome-cinematic'

// Title card shown when the game starts: black screen, logo, Start Game button. Tapping the
// button hides logo and button, then the black backdrop fades to nothing and goes away.
const LOGO = 'assets/images/logo.png'
// Rounded corners and the black border are baked into the image: the renderer doesn't round
// a textured background, so borderRadius on the transform showed square corners. The image is
// drawn at the button's exact aspect ratio (2x), so stretching it doesn't distort the corners.
const BUTTON_GRADIENT = 'assets/images/button_gradient.png'
// #4b3d34, a dark earthy brown.
const BACKDROP = Color4.fromHexString('#4b3d34')
const LOGO_SIZE = 520
const BUTTON_WIDTH = 360
const BUTTON_HEIGHT = 90
const FADE_SECONDS = 2
const BUTTON_FONT_SIZE = 40
// Start Game breathes between 1x and 1.2x; one full grow-and-shrink takes PULSE_SECONDS.
const PULSE_MIN = 1
const PULSE_MAX = 1.2
const PULSE_SECONDS = 2.4
// "Skip intro" under the button: plain white text that starts the game without the welcome shot.
const SKIP_FONT_SIZE = 24
const SKIP_MARGIN_TOP = 16

type Phase = 'title' | 'fading' | 'done'
let phase: Phase = 'title'
let fadeElapsed = 0
let pulseTime = 0

engine.addSystem(function introPulseSystem(dt: number) {
    if (phase !== 'title') {
        engine.removeSystem(introPulseSystem)
        return
    }
    pulseTime += dt
})

function pulseScale() {
    const wave = (1 - Math.cos((pulseTime / PULSE_SECONDS) * 2 * Math.PI)) / 2
    return PULSE_MIN + (PULSE_MAX - PULSE_MIN) * wave
}

/** Fades the title card away; the welcome shot follows unless `withWelcome` is false. */
function startGame(withWelcome: boolean) {
    if (phase !== 'title') return
    phase = 'fading'
    stopIntroMusic()
    // The shot starts under the fade, so the title dissolves straight into it. It starts the
    // town music itself once the mayor is done; without it, the music starts now.
    if (withWelcome) playWelcomeCinematic()
    else startTownMusic()
    fadeElapsed = 0
    engine.addSystem(function introFadeSystem(dt: number) {
        fadeElapsed += dt
        if (fadeElapsed >= FADE_SECONDS) {
            phase = 'done'
            engine.removeSystem(introFadeSystem)
        }
    })
}

export function introScreen() {
    if (phase === 'done') return null
    const alpha = phase === 'title' ? 1 : Math.max(0, 1 - fadeElapsed / FADE_SECONDS)
    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0 },
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
            }}
            uiBackground={{ color: Color4.create(BACKDROP.r, BACKDROP.g, BACKDROP.b, alpha) }}
        >
            {phase === 'title' ? (
                <UiEntity
                    uiTransform={{ width: LOGO_SIZE, height: LOGO_SIZE }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: LOGO } }}
                />
            ) : null}
            {phase === 'title' ? (
                // A fixed slot sized for the largest pulse, so the growing button never pushes the logo.
                <UiEntity
                    uiTransform={{
                        width: BUTTON_WIDTH * PULSE_MAX,
                        height: BUTTON_HEIGHT * PULSE_MAX,
                        margin: { top: 0 },
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >
                <UiEntity
                    uiTransform={{
                        width: BUTTON_WIDTH * pulseScale(),
                        height: BUTTON_HEIGHT * pulseScale(),
                        flexShrink: 0,
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: BUTTON_GRADIENT } }}
                    onMouseDown={() => startGame(true)}
                >
                    <BitmapText value="Start Game" fontSize={BUTTON_FONT_SIZE * pulseScale()} color={Color4.Black()} align="center" uiTransform={{ width: '100%' }} />
                </UiEntity>
                </UiEntity>
            ) : null}
            {phase === 'title' ? (
                <UiEntity uiTransform={{ margin: { top: SKIP_MARGIN_TOP } }} onMouseDown={() => startGame(false)}>
                    <BitmapText value="Skip intro" fontSize={SKIP_FONT_SIZE} color={Color4.White()} align="center" />
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}
