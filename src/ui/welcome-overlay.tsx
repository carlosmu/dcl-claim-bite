import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { BitmapText } from './bitmap-text'
import { getWelcomeBars, getWelcomeSubtitle } from '../world/welcome-cinematic'

// The welcome shot's letterbox: two black bars that slide in from the top and bottom, with
// the mayor's lines just above the bottom one.

/** Each bar's height at full, as a share of the screen. */
const BAR_SHARE = 12
const SUBTITLE_FONT_SIZE = 40
// The same gold as the mining bar.
const SUBTITLE_COLOR = Color4.create(1, 198 / 255, 0, 1)
/** How far above the middle of the bottom bar the subtitle sits, as a share of the screen. */
const SUBTITLE_RAISE = 10

export function welcomeOverlay() {
    const bars = getWelcomeBars()
    if (bars <= 0) return null
    const height = `${BAR_SHARE * bars}%` as `${number}%`
    const subtitle = getWelcomeSubtitle()

    return (
        <UiEntity
            uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0 },
                width: '100%',
                height: '100%',
                flexDirection: 'column',
                justifyContent: 'space-between'
            }}
        >
            <UiEntity uiTransform={{ width: '100%', height }} uiBackground={{ color: Color4.Black() }} />
            <UiEntity uiTransform={{ width: '100%', height }} uiBackground={{ color: Color4.Black() }} />
            {subtitle !== '' ? (
                <UiEntity
                    uiTransform={{
                        positionType: 'absolute',
                        position: { bottom: `${(BAR_SHARE * bars) / 2 + SUBTITLE_RAISE}%`, left: 0 },
                        width: '100%',
                        flexDirection: 'column',
                        alignItems: 'center'
                    }}
                >
                    {subtitle.split('\n').map((row) => (
                        <BitmapText value={row.trim()} fontSize={SUBTITLE_FONT_SIZE} color={SUBTITLE_COLOR} align="center" uiTransform={{ width: '100%' }} />
                    ))}
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}
