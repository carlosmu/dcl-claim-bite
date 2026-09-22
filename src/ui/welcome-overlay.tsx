import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

import { BitmapText } from './bitmap-text'
import { getWelcomeBars, getWelcomeSubtitle } from '../world/welcome-cinematic'
import { getSubtitle } from '../world/subtitles'

// The welcome shot's letterbox: two black bars that slide in from the top and bottom, with
// the mayor's lines just above the bottom one. Also draws the lines played outside the shot
// (world/subtitles.ts), in the same place, without the bars.

/** Each bar's height at full, as a share of the screen. */
const BAR_SHARE = 12
const SUBTITLE_FONT_SIZE = 40
// The same gold as the mining bar.
const SUBTITLE_COLOR = Color4.create(1, 198 / 255, 0, 1)
/** How far above the middle of the bottom bar the subtitle sits, as a share of the screen. */
const SUBTITLE_RAISE = 10
// The box behind the lines, so they read over a bright sky or sand.
const SUBTITLE_BOX_COLOR = Color4.create(0, 0, 0, 0.3)
const SUBTITLE_BOX_PADDING = { top: 10, bottom: 10, left: 24, right: 24 }
const SUBTITLE_BOX_RADIUS = 12

export function welcomeOverlay() {
    const bars = getWelcomeBars()
    const subtitle = getWelcomeSubtitle() || getSubtitle()
    if (bars <= 0 && subtitle === '') return null
    const height = `${BAR_SHARE * bars}%` as `${number}%`

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
            {bars > 0 ? <UiEntity uiTransform={{ width: '100%', height }} uiBackground={{ color: Color4.Black() }} /> : null}
            {bars > 0 ? <UiEntity uiTransform={{ width: '100%', height }} uiBackground={{ color: Color4.Black() }} /> : null}
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
                    <UiEntity
                        uiTransform={{
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: SUBTITLE_BOX_PADDING,
                            borderRadius: SUBTITLE_BOX_RADIUS
                        }}
                        uiBackground={{ color: SUBTITLE_BOX_COLOR }}
                    >
                        {subtitle.split('\n').map((row) => (
                            <BitmapText value={row.trim()} fontSize={SUBTITLE_FONT_SIZE} color={SUBTITLE_COLOR} align="center" />
                        ))}
                    </UiEntity>
                </UiEntity>
            ) : null}
        </UiEntity>
    )
}
