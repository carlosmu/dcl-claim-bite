import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { BitmapText } from './bitmap-text'
import { Color4 } from '@dcl/sdk/math'
import { isMobile } from '@dcl/sdk/platform'
import { startTownMusic, stopIntroMusic } from '../world/music'
import { playWelcomeCinematic } from '../world/welcome-cinematic'
import { setIntroChoice } from '../world/intro-state'
import { getHitsPerRock, getWalletDebug, hasWallet, isWalletEmpty, isWalletFresh } from '../net/economy-link'
import { getDeployStampUtc } from '../net/deploy-stamp'
import { isServerOnline } from '../net/server-link'
import { getPlayer } from '@dcl/sdk/players'
import { isStateSyncronized } from '@dcl/sdk/network'

// Title card shown when the game starts: scrolling backdrop, logo, Start Game button. Tapping the
// button hides logo and button, then the backdrop fades to nothing and goes away.
//
// The button waits for the server to say whether the player already owns a pick, which picks
// the mayor's greeting. Until then a Loading bar stands in its place.
const LOGO = 'assets/images/logo.png'
// Rounded corners and the black border are baked into the image: the renderer doesn't round
// a textured background, so borderRadius on the transform showed square corners. The image is
// drawn at the button's exact aspect ratio (2x), so stretching it doesn't distort the corners.
const BUTTON_GRADIENT = 'assets/images/button_gradient.png'
// The backdrop: a square image, shown at full screen height and repeated across, drifting
// slowly from right to left.
const BACKDROP_IMAGE = 'assets/images/intro_background.jpg'
// How long the backdrop takes to drift one image width.
const BACKDROP_SCROLL_SECONDS = 15
const LOGO_SIZE = 520
const BUTTON_WIDTH = 360
const BUTTON_HEIGHT = 90
const FADE_SECONDS = 2
const BUTTON_FONT_SIZE = 40
// Start Game's box breathes between 1x and 1.2x (its text stays put); one full grow-and-shrink takes PULSE_SECONDS.
const PULSE_MIN = 1
const PULSE_MAX = 1.1
const PULSE_SECONDS = 2
// "Skip intro" under the button: plain white text that starts the game without the welcome shot.
const SKIP_FONT_SIZE = 24
const SKIP_MARGIN_TOP = 48
// Padding around "Skip intro" that still counts as the link, so it is easy to hit with a thumb.
const SKIP_HIT_PADDING = 14
// On mobile the screen is only 720 high: the logo and the Start button shrink by this much so
// the column fits with room to spare, and "Skip intro" stops hugging the bottom edge.
const MOBILE_SCALE = 0.7
// The Loading bar: its size, and how fast it creeps towards LOADING_CREEP_MAX while it waits
// (seconds to cover about two thirds of the way). It never fills on its own.
const LOADING_BAR_WIDTH = 360
const LOADING_BAR_HEIGHT = 28
// The bar's black border and rounded corners, like the button's.
const LOADING_BORDER = 4
const LOADING_RADIUS = 10
const LOADING_CREEP_SECONDS = 2
const LOADING_CREEP_MAX = 0.9
const LOADING_FONT_SIZE = 28
// The step line under the bar: what is being waited on (loadingStep).
const LOADING_STEP_FONT_SIZE = 18
const LOADING_DOTS_PER_SECOND = 2
// The fill is the button's gradient, cut from inside its border so only the colour shows.
// Bottom-left, top-left, top-right, bottom-right.
const LOADING_FILL_UVS = [0.1, 0.12, 0.1, 0.88, 0.9, 0.88, 0.9, 0.12]

/** Logo and Start button scale: smaller on mobile. */
function introScale(): number {
    return isMobile() ? MOBILE_SCALE : 1
}

type Phase = 'title' | 'fading' | 'done'
let phase: Phase = 'title'
let fadeElapsed = 0
let pulseTime = 0
let loadingElapsed = 0
let scrollTime = 0

engine.addSystem(function introScrollSystem(dt: number) {
    if (phase === 'done') {
        engine.removeSystem(introScrollSystem)
        return
    }
    scrollTime += dt
})

/** UVs that fit the square image to the screen's height and repeat it across, scrolled. */
function backdropUvs(): number[] {
    const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
    const across = canvas === null || canvas.height <= 0 ? 1 : canvas.width / canvas.height
    const offset = (scrollTime / BACKDROP_SCROLL_SECONDS) % 1
    return [offset, 0, offset, 1, offset + across, 1, offset + across, 0]
}

/**
 * An empty purse that storage did have (not a first visit) is believed only after this long: one
 * has reached returning players before their real one, and greeting a veteran as new, with zero
 * coins, is far worse than a longer Loading bar. A real first visit (the wallet says `fresh`)
 * does not wait at all.
 */
const EMPTY_PURSE_WAIT_SECONDS = 25
let emptyPurseFor = 0

engine.addSystem(function introLoadingSystem(dt: number) {
    if (isLoaded()) {
        engine.removeSystem(introLoadingSystem)
        return
    }
    loadingElapsed += dt
    emptyPurseFor = hasWallet() && isWalletEmpty() && !isWalletFresh() ? emptyPurseFor + dt : 0
})

/**
 * Whether the server has said what the player owns. Waited for however long it takes: giving up
 * would greet a returning player as a new one, tutorial and all. A wallet that never comes brings
 * up the RECONNECT screen instead (ui/connection-watch.ts), drawn over this one.
 */
function isLoaded(): boolean {
    return hasWallet() && (!isWalletEmpty() || isWalletFresh() || emptyPurseFor >= EMPTY_PURSE_WAIT_SECONDS)
}

/**
 * "Skip intro" shows only to a player who already has a pick to mine with, so a new player
 * cannot skip the welcome, and the pick, by accident.
 */
function canSkip(): boolean {
    return isLoaded() && getHitsPerRock() > 0
}

/**
 * What the Loading bar is waiting on right now, in the order it happens, so a long wait reads as
 * steps going by rather than a bar that stopped. The dots tick so the line never looks frozen.
 */
function loadingStep(): string {
    let step: string
    if ((getPlayer()?.userId ?? '') === '') step = 'Loading your avatar'
    else if (!isStateSyncronized()) step = 'Joining the town'
    else if (!isServerOnline()) step = 'Waking up the town server'
    else if (!hasWallet()) step = 'Reading your saved progress'
    else step = 'Double-checking your saved progress'
    return step + '.'.repeat(1 + (Math.floor(loadingElapsed * LOADING_DOTS_PER_SECOND) % 3))
}

function loadingProgress(): number {
    return LOADING_CREEP_MAX * (1 - Math.exp(-loadingElapsed / LOADING_CREEP_SECONDS))
}

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
    setIntroChoice(withWelcome ? 'start' : 'skip')
    stopIntroMusic()
    // The shot starts under the fade, so the title dissolves straight into it. It starts the
    // town music itself once the mayor is done; without it, the music starts now.
    if (withWelcome) playWelcomeCinematic(getHitsPerRock() > 0)
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

/** Leaves the title card at once, as Skip intro does but with no fade: for DEBUG_SKIP_INTRO. */
export function skipTitleCard() {
    if (phase !== 'title') return
    phase = 'done'
    setIntroChoice('skip')
    stopIntroMusic()
    startTownMusic()
}

export function introScreen() {
    if (phase === 'done') return null
    const alpha = phase === 'title' ? 1 : Math.max(0, 1 - fadeElapsed / FADE_SECONDS)
    const scale = introScale()
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
            uiBackground={{
                texture: { src: BACKDROP_IMAGE, wrapMode: 'repeat' },
                textureMode: 'stretch',
                uvs: backdropUvs(),
                color: Color4.create(1, 1, 1, alpha)
            }}
        >
            {phase === 'title' ? (
                <UiEntity
                    uiTransform={{ width: LOGO_SIZE * scale, height: LOGO_SIZE * scale }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: LOGO } }}
                />
            ) : null}
            {phase === 'title' && !isLoaded() ? (
                // In the button's slot, so the logo does not move when the button replaces it.
                <UiEntity
                    uiTransform={{
                        width: BUTTON_WIDTH * scale * PULSE_MAX,
                        height: BUTTON_HEIGHT * scale * PULSE_MAX,
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >
                    <BitmapText value="Loading" fontSize={LOADING_FONT_SIZE * scale} color={Color4.White()} align="center" />
                    <UiEntity
                        uiTransform={{
                            width: LOADING_BAR_WIDTH * scale,
                            height: LOADING_BAR_HEIGHT * scale,
                            margin: { top: 12 },
                            borderWidth: LOADING_BORDER * scale,
                            borderColor: Color4.Black(),
                            borderRadius: LOADING_RADIUS * scale,
                            overflow: 'hidden'
                        }}
                        uiBackground={{ color: Color4.create(0, 0, 0, 0.4) }}
                    >
                        <UiEntity
                            uiTransform={{ width: `${loadingProgress() * 100}%`, height: '100%' }}
                            uiBackground={{ texture: { src: BUTTON_GRADIENT }, textureMode: 'stretch', uvs: LOADING_FILL_UVS }}
                        />
                    </UiEntity>
                    {/* Absolute, so the line hangs below the slot without pushing the logo up. */}
                    <Label
                        value={loadingStep()}
                        fontSize={LOADING_STEP_FONT_SIZE * scale}
                        color={Color4.create(1, 1, 1, 0.85)}
                        textAlign="middle-center"
                        uiTransform={{ positionType: 'absolute', position: { top: '100%' }, width: '100%', height: 28 * scale, margin: { top: 8 } }}
                    />
                </UiEntity>
            ) : null}
            {phase === 'title' && isLoaded() ? (
                // A fixed slot sized for the largest pulse, so the growing button never pushes the logo.
                <UiEntity
                    uiTransform={{
                        width: BUTTON_WIDTH * scale * PULSE_MAX,
                        height: BUTTON_HEIGHT * scale * PULSE_MAX,
                        margin: { top: 0 },
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                >
                <UiEntity
                    uiTransform={{
                        width: BUTTON_WIDTH * scale * pulseScale(),
                        height: BUTTON_HEIGHT * scale * pulseScale(),
                        flexShrink: 0,
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}
                    uiBackground={{ textureMode: 'stretch', texture: { src: BUTTON_GRADIENT } }}
                    onMouseDown={() => startGame(true)}
                >
                    <BitmapText value="Start Game" fontSize={BUTTON_FONT_SIZE * scale} color={Color4.Black()} align="center" uiTransform={{ width: '100%' }} />
                </UiEntity>
                </UiEntity>
            ) : null}
            {phase === 'title' && canSkip() ? (
                <UiEntity
                    uiTransform={{ margin: { top: SKIP_MARGIN_TOP - SKIP_HIT_PADDING }, padding: SKIP_HIT_PADDING }}
                    onMouseDown={() => startGame(false)}
                >
                    <BitmapText value="Skip intro" fontSize={SKIP_FONT_SIZE} color={Color4.White()} align="center" />
                </UiEntity>
            ) : null}
            {phase === 'title' ? (
                // Small print at the bottom, for bug reports from this screen: which build is
                // running, whether the server answers, and whether the purse has arrived.
                <Label
                    value={`${getDeployStampUtc() ?? 'Build ?'} · server ${isServerOnline() ? 'on' : 'off'} · purse ${hasWallet() ? `yes (#${getWalletDebug().count}, ${getWalletDebug().coins} coins), ${getHitsPerRock() > 0 ? 'pick' : 'no pick'}, ${getWalletDebug().address.slice(0, 6)}…${getWalletDebug().address.slice(-4)}` : 'no'} · ignored ${getWalletDebug().ignored} · from ${getWalletDebug().server || '?'}${getWalletDebug().fresh ? ' (new)' : ''} · got ${getWalletDebug().trail || '-'}`}
                    fontSize={14}
                    color={Color4.create(1, 1, 1, 0.6)}
                    textAlign="middle-center"
                    uiTransform={{ positionType: 'absolute', position: { bottom: 12 }, width: '100%', height: 20 }}
                />
            ) : null}
        </UiEntity>
    )
}
