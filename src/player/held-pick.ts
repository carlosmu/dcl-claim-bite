import { AvatarAnchorPointType, AvatarAttach, ColliderLayer, Entity, engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// The pick the player carries once they own one.
//
// Two entities, not one: the renderer drives the Transform of anything carrying AvatarAttach,
// so an offset written there would be overwritten every frame. The anchor entity holds only
// the attachment; the model hangs off it as a child, and the child's Transform is what places
// the pick in the hand.
//
// TBD: the three numbers below are guesses — the pick has to be lined up by eye in the
// preview. Rotation is the one that usually needs the most work.

// One model per pick tier, by catalogue id.
const PICK_MODELS: Record<string, string> = {
  pick: 'assets/models/pick-0.glb',
  'steel-pick': 'assets/models/pick-1.glb',
  'miners-pick': 'assets/models/pick-2.glb'
}

const HELD_POSITION = Vector3.create(0, 0, 0)
const HELD_ROTATION = Quaternion.fromEulerDegrees(0, 75, 0)
const HELD_SCALE = Vector3.create(1, 1, 1)

let anchor: Entity | null = null
let model: Entity | null = null
let heldSrc = ''

/**
 * Puts the given pick in the player's right hand. Swaps the model if a different pick is
 * already there; does nothing if it is the same one.
 */
export function equipPick(pickId: string): void {
  const src = PICK_MODELS[pickId] ?? PICK_MODELS.pick
  if (src === heldSrc) return
  heldSrc = src

  if (model !== null) {
    GltfContainer.getMutable(model).src = src
    console.log(`[player] pick swapped to ${pickId}`)
    return
  }

  anchor = engine.addEntity()
  AvatarAttach.create(anchor, { anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND })

  model = engine.addEntity()
  Transform.create(model, {
    position: HELD_POSITION,
    rotation: HELD_ROTATION,
    scale: HELD_SCALE,
    parent: anchor
  })
  // A pick in your own hand should never block your movement or eat a pointer click.
  GltfContainer.create(model, {
    src,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  console.log('[player] pick equipped to the right hand')
}
