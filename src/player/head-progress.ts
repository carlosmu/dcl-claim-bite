import {
  AvatarAnchorPointType,
  AvatarAttach,
  Billboard,
  BillboardMode,
  Entity,
  engine,
  Material,
  MeshRenderer,
  TextShape,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// A progress bar floating over the local player's head: "3/12" above a filling bar.
//
// Local only — nothing here is synced, so other players never see it. Same two-entity pattern
// as the held pick: the renderer owns the Transform of whatever carries AvatarAttach, so the
// offset and the billboard live on a child.
//
// The bar is two thin boxes, not planes: a box reads from both sides, so the billboard's facing
// never has to be right. The fill is a shade deeper than the track so it pokes out of it.

const OFFSET_ABOVE_NAME = 0.35
const BAR_WIDTH = 0.9
const BAR_HEIGHT = 0.1

const TRACK_COLOR = Color4.create(0.1, 0.1, 0.1, 0.85)
// Magenta: the town's one interactable colour (GDD §7).
const FILL_COLOR = Color4.create(0.9, 0.15, 0.65, 1)

let root: Entity | null = null
let fill: Entity | null = null
let label: Entity | null = null
let shown = true

function create(): void {
  const anchor = engine.addEntity()
  AvatarAttach.create(anchor, { anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG })

  root = engine.addEntity()
  Transform.create(root, { position: Vector3.create(0, OFFSET_ABOVE_NAME, 0), parent: anchor })
  Billboard.create(root, { billboardMode: BillboardMode.BM_Y })
  VisibilityComponent.create(root, { visible: false, propagateToChildren: true })

  const track = engine.addEntity()
  Transform.create(track, { scale: Vector3.create(BAR_WIDTH, BAR_HEIGHT, 0.02), parent: root })
  MeshRenderer.setBox(track)
  Material.setPbrMaterial(track, { albedoColor: TRACK_COLOR })

  fill = engine.addEntity()
  Transform.create(fill, { scale: Vector3.create(0, BAR_HEIGHT * 0.8, 0.04), parent: root })
  MeshRenderer.setBox(fill)
  Material.setPbrMaterial(fill, { albedoColor: FILL_COLOR, emissiveColor: FILL_COLOR, emissiveIntensity: 0.6 })

  label = engine.addEntity()
  Transform.create(label, { position: Vector3.create(0, 0.22, 0), parent: root })
  TextShape.create(label, {
    text: '',
    fontSize: 2,
    textColor: Color4.White(),
    outlineWidth: 0.15,
    outlineColor: Color4.Black()
  })
}

/** Shows the bar at `current` of `total`, with `text` above it. */
export function showHeadProgress(current: number, total: number, text: string): void {
  if (root === null) create()

  const progress = total > 0 ? Math.min(1, Math.max(0, current / total)) : 0
  const width = BAR_WIDTH * progress

  // Anchored to the left edge: a box scales around its centre, so the centre moves with it.
  const fillTransform = Transform.getMutable(fill!)
  fillTransform.scale.x = width
  fillTransform.position.x = -(BAR_WIDTH - width) / 2

  const shape = TextShape.getMutable(label!)
  if (shape.text !== text) shape.text = text

  if (!shown) {
    VisibilityComponent.getMutable(root!).visible = true
    shown = true
  }
}

export function hideHeadProgress(): void {
  if (root === null || !shown) return
  VisibilityComponent.getMutable(root).visible = false
  shown = false
}
