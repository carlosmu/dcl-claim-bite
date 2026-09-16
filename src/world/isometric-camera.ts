import {
    engine,
    InputAction,
    inputSystem,
    MainCamera,
    PointerEventType,
    Transform,
    VirtualCamera
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'

// Isometric follow camera, the kind farming / CRPG games use: the camera sits at a fixed
// angle above and behind the avatar and slides along with it instead of orbiting with the
// mouse. Because the renderer derives WASD directions from the active camera, movement
// automatically becomes screen-relative — up on the keyboard is up on the screen.

// Master switch. Off means setupIsometricCamera() does nothing and the player keeps the
// ordinary third person camera; flip it to true to bring the isometric rig back.
const ISOMETRIC_ENABLED = false

// --- Dials -------------------------------------------------------------------------------
// Compass angle the camera looks from, in degrees. 45 is the classic isometric diagonal.
const YAW_DEGREES = 45
// How far the camera sits from the avatar, measured on the ground plane. Bigger = wider shot.
const DISTANCE = 6
// How high above the avatar's feet the camera floats. Height vs DISTANCE sets the pitch:
// 14 / 14 is a 45 degree top-down-ish tilt, lowering it flattens the view.
const HEIGHT = 6
// Height on the avatar the camera lines up with. Chest height reads better than the feet.
const LOOK_HEIGHT = 1.2
// Seconds-ish lag of the camera behind the avatar. 0 pins it rigidly, higher drifts softly.
const FOLLOW_SMOOTHING = 0
// Degrees added to YAW_DEGREES per tap of the rotate keys (1 and 2), so players can peek
// behind things. E and F are left alone: they are the interact keys the rest of the scene uses.
const ROTATE_STEP = 45
// -----------------------------------------------------------------------------------------

let cameraEntity = engine.addEntity()
let yaw = YAW_DEGREES
let enabled = true

/**
 * Fixed orientation for the current yaw. The camera never aims at a moving target: a rigid
 * isometric rig always points the same way, and recomputing the rotation from the avatar's
 * position every tick is what makes the picture shiver.
 */
function rotationForYaw(): Quaternion {
    const pitch = (Math.atan2(HEIGHT, DISTANCE) * 180) / Math.PI
    return Quaternion.fromEulerDegrees(pitch, yaw + 180, 0)
}

/** Ground-plane offset from the avatar to the camera for the current yaw. */
function offsetForYaw(): Vector3 {
    const radians = (yaw * Math.PI) / 180
    return Vector3.create(Math.sin(radians) * DISTANCE, HEIGHT, Math.cos(radians) * DISTANCE)
}

function followSystem(dt: number) {
    if (!enabled) return
    if (!Transform.has(engine.PlayerEntity)) return

    const player = Transform.get(engine.PlayerEntity).position
    const offset = offsetForYaw()
    // Offsetting from the aim point rather than the feet keeps the avatar's chest centred.
    const wanted = Vector3.create(
        player.x + offset.x,
        player.y + LOOK_HEIGHT + offset.y,
        player.z + offset.z
    )

    const cam = Transform.getMutable(cameraEntity)
    // Exponential smoothing, framerate independent: at FOLLOW_SMOOTHING 0 it snaps.
    const blend = FOLLOW_SMOOTHING <= 0 ? 1 : 1 - Math.exp(-dt / FOLLOW_SMOOTHING)
    cam.position = Vector3.lerp(cam.position, wanted, blend)
    cam.rotation = rotationForYaw()
}

/** Keys 1 and 2 swing the view around the avatar in ROTATE_STEP increments. */
function rotateSystem() {
    if (!enabled) return
    if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
        yaw -= ROTATE_STEP
    }
    if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
        yaw += ROTATE_STEP
    }
}

export function setupIsometricCamera() {
    if (!ISOMETRIC_ENABLED) return

    Transform.createOrReplace(cameraEntity, {
        position: offsetForYaw(),
        rotation: rotationForYaw()
    })
    VirtualCamera.createOrReplace(cameraEntity, {
        defaultTransition: { transitionMode: VirtualCamera.Transition.Speed(2) }
    })

    MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraEntity })

    engine.addSystem(followSystem)
    engine.addSystem(rotateSystem)
}

/** Hand the camera back to the player (free third person), or take it again. */
export function setIsometricCamera(on: boolean) {
    enabled = on
    MainCamera.createOrReplace(engine.CameraEntity, {
        virtualCameraEntity: on ? cameraEntity : undefined
    })
}
