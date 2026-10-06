import { ColliderLayer, engine, Entity, Material, MeshCollider, MeshRenderer, Transform } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

// A stand-in button: a cube on the ground under a building's sign, the only thing that opens the
// building's panel by click. To be replaced by a real button model.

/** Edge of the cube, in metres. */
const CUBE_SIZE_METERS = 0.6

/** How far in front of the sign the cube's centre stands, towards whoever reads it. */
const CUBE_OUT_METERS = 0.8

const CUBE_COLOR = Color4.create(0.85, 0.65, 0.25, 1)

/**
 * Puts a clickable cube on the ground under `signName`, pushed out towards the side the sign is
 * read from — not the building's front: the Land Office model is turned round, its sign on what
 * the model calls its back. `buildingName` is only checked, for the error. Null when either
 * entity is missing from the scene.
 */
export function createClickCube(buildingName: string, signName: string): Entity | null {
  const building = engine.getEntityOrNullByName(buildingName)
  const sign = engine.getEntityOrNullByName(signName)
  if (building === null || sign === null) {
    console.error(`[click-cube] missing "${building === null ? buildingName : signName}" in the scene — no cube for ${buildingName}`)
    return null
  }

  // The sign hangs off the scene root, so its position is already world space. Text is read
  // from its local -Z side.
  const signTransform = Transform.get(sign)
  const front = Vector3.rotate(Vector3.Backward(), signTransform.rotation)
  const signPosition = signTransform.position
  const cube = engine.addEntity()
  Transform.create(cube, {
    position: Vector3.create(signPosition.x + front.x * CUBE_OUT_METERS, CUBE_SIZE_METERS / 2, signPosition.z + front.z * CUBE_OUT_METERS),
    rotation: signTransform.rotation,
    scale: Vector3.create(CUBE_SIZE_METERS, CUBE_SIZE_METERS, CUBE_SIZE_METERS)
  })
  MeshRenderer.setBox(cube)
  // Pointer only: the player walks through it rather than snagging on it by the door.
  MeshCollider.setBox(cube, ColliderLayer.CL_POINTER)
  Material.setPbrMaterial(cube, { albedoColor: CUBE_COLOR, metallic: 0, roughness: 1 })
  return cube
}
