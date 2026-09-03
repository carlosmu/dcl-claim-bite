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

const PICK_MODEL = 'assets/asset-packs/peak/Peak.glb'

const HELD_POSITION = Vector3.create(0, 0, 0)
const HELD_ROTATION = Quaternion.fromEulerDegrees(0, 0, 0)
const HELD_SCALE = Vector3.create(1, 1, 1)

let anchor: Entity | null = null

/** Puts a pick in the player's right hand. Does nothing if one is already there. */
export function equipPick(): void {
  if (anchor !== null) return

  anchor = engine.addEntity()
  AvatarAttach.create(anchor, { anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND })

  const model = engine.addEntity()
  Transform.create(model, {
    position: HELD_POSITION,
    rotation: HELD_ROTATION,
    scale: HELD_SCALE,
    parent: anchor
  })
  // A pick in your own hand should never block your movement or eat a pointer click.
  GltfContainer.create(model, {
    src: PICK_MODEL,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })

  console.log('[player] pick equipped to the right hand')
}
