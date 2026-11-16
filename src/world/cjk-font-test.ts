import { engine, Font, TextAlignMode, TextShape, Transform } from '@dcl/sdk/ecs'
import { Color4, Quaternion, Vector3 } from '@dcl/sdk/math'

import { DEBUG_CJK_FONT_TEST } from '../shared/debug-flags'
import { CJK_TEST_LINES } from '../shared/cjk-font-test'

// DEBUG_CJK_FONT_TEST in the world: a sign a few metres in front of where the player first
// stands, one row per built-in face, so a 3D TextShape is checked as well as the UI.

const SIGN_DISTANCE_METERS = 4
/** Where the bottom row sits above the player's feet; the rows stack upwards from it. */
const SIGN_BOTTOM_METERS = 0.8
const ROW_METERS = 0.45

const FACES: { font: Font; name: string }[] = [
  { font: Font.F_SANS_SERIF, name: 'sans-serif' },
  { font: Font.F_SERIF, name: 'serif' },
  { font: Font.F_MONOSPACE, name: 'monospace' }
]

export function setupCjkFontTest(): void {
  if (!DEBUG_CJK_FONT_TEST) return
  engine.addSystem(function cjkFontTestSystem() {
    const player = Transform.getOrNull(engine.PlayerEntity)
    if (player === null || Vector3.equals(player.position, Vector3.Zero())) return
    engine.removeSystem(cjkFontTestSystem)

    // Straight ahead of the player, facing them.
    const ahead = Vector3.rotate(Vector3.Forward(), player.rotation)
    const flat = Vector3.normalize(Vector3.create(ahead.x, 0, ahead.z))
    const root = engine.addEntity()
    Transform.create(root, {
      position: Vector3.add(player.position, Vector3.create(flat.x * SIGN_DISTANCE_METERS, SIGN_BOTTOM_METERS, flat.z * SIGN_DISTANCE_METERS)),
      rotation: Quaternion.lookRotation(flat)
    })

    // Top to bottom as listed, the last row resting at the root: nothing below the ground.
    const rows = FACES.length * (1 + CJK_TEST_LINES.length)
    let row = 0
    for (const face of FACES) {
      for (const line of [`[${face.name}]`, ...CJK_TEST_LINES]) {
        const text = engine.addEntity()
        Transform.create(text, { parent: root, position: Vector3.create(0, (rows - 1 - row) * ROW_METERS, 0) })
        TextShape.create(text, {
          text: line,
          font: face.font,
          fontSize: 2.5,
          textColor: Color4.White(),
          outlineWidth: 0.2,
          outlineColor: Color4.Black(),
          textAlign: TextAlignMode.TAM_MIDDLE_CENTER
        })
        row += 1
      }
    }
    console.log('[cjk-font-test] sign placed in front of the player')
  }, undefined, 'client:cjk-font-test')
}
