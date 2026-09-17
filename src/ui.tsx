import ReactEcs, { ReactEcsRenderer, UiEntity, Label, Button } from "@dcl/sdk/react-ecs"
import { Color4 } from "@dcl/sdk/math"
import { getCoins, getOre } from './shared/state/wallet'
import { changeSellAmount, getSellAmount, isPlayerAtBank, sellSelectedOre, setSellAmount } from './bank/bank'
import {
    getCarryCapacity,
    getMuleCapacity,
    getMuleOre,
    getSyncedRate,
    quoteSaleForDisplay
} from './net/economy-link'
import { buySelected, getSelectedItem, getSelectedItemId, isPlayerAtShop, selectItem } from './shop/shop'
import { collectMule, isPlayerAtMule } from './mule/mule'
import { bestPick, CATALOGUE, ShopItem } from './shared/economy/catalogue'
import { getOwned } from './shared/state/inventory'
import { getServerTick, isServerOnline } from './net/server-link'

// Mining has no screen UI any more: its progress floats over the player's head
// (src/mining/rocks.ts). The HUD is the one permanent thing on screen (§6).

export function setupUi() {
    ReactEcsRenderer.setUiRenderer(uiMenu, { virtualWidth: 1920, virtualHeight: 1080 })
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

// The rig's panel. Collecting is a deliberate act at the rig itself rather than ore appearing
// in the bag on login: arriving to claim a load is the return the rig is built to create.
const mulePanel = () => {
    const waiting = getMuleOre()
    const room = Math.max(0, getCarryCapacity() - getOre())
    const takeable = Math.min(waiting, room)

    let buttonText = `Collect ${takeable} ore`
    if (waiting <= 0) buttonText = 'The rig is empty'
    else if (room <= 0) buttonText = 'Bag full'
    else if (takeable < waiting) buttonText = `Collect ${takeable} of ${waiting} ore`

    return (
        <UiEntity
            uiTransform={{
                width: PANEL_WIDTH,
                flexDirection: 'column',
                alignItems: 'center',
                padding: { top: 16, bottom: 16, left: 20, right: 20 },
                borderRadius: PANEL_RADIUS
            }}
            uiBackground={{ color: PANEL_BACKGROUND }}
        >
            {infoRow('M.U.L.E.', `${waiting} / ${getMuleCapacity()} ore`, ORE_COLOR)}
            <Button
                value={buttonText}
                fontSize={20}
                uiTransform={{ width: '100%', height: 46, margin: { top: 12 } }}
                uiBackground={{ color: takeable > 0 ? MAGENTA : DISABLED_COLOR }}
                onMouseDown={collectMule}
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
            {isPlayerAtBank() ? bankPanel() : null}
            {isPlayerAtShop() ? marketPanel() : null}
            {isPlayerAtMule() && getMuleCapacity() > 0 ? mulePanel() : null}
            {serverStatus()}
        </UiEntity>
    </UiEntity>
)
