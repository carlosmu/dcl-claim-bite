import { startTownMusic } from './music'
import { AudioSource, engine, Entity, InputModifier, MainCamera, Transform, VirtualCamera } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'

import { MAYOR_ENTITY_NAME } from '../mayor/mayor'

// The welcome shot, played once when the title card has faded: a camera just behind the
// player looks over their shoulder at the town mayor, black bars come in, and after a beat
// the mayor's greeting plays with subtitles. The player is held still while it runs, so the
// shot framed behind them stays behind them.
//
// The shot starts by putting the player back at spawn, facing the mayor, and is framed from
// there rather than from wherever they were. A reload keeps the avatar where it last stood,
// and a shot built from that could be anywhere, looking anywhere.

const WELCOME_AUDIO = 'assets/sounds/mayor_welcome.mp3'

// --- Dials -------------------------------------------------------------------------------
// The middle of SpawnArea1 in scene.json. Keep the two in step if the spawn moves.
const SPAWN_POSITION = Vector3.create(0, 0, -50)
// Where the camera sits, from the player: this far back along their facing, this far to their
// left, this high up.
const CAMERA_BACK = 2
const CAMERA_LEFT = 1
const CAMERA_UP = 2.2
// Where on the mayor the camera aims, above his feet.
const TARGET_HEIGHT = 1.8
// Seconds of the shot before the greeting starts.
const AUDIO_DELAY_SECONDS = 2
// Seconds from the greeting's start to the end of the shot. Set to the clip's length plus a
// breath once it is final.
const AUDIO_SECONDS = 8
// How long the bars take to slide in, and out at the end.
const BARS_SECONDS = 0.5
// How long the shot's camera outlives the shot. The blend back to the player's camera starts
// from it; removed in the same frame, the blend had nothing to start from and flew in from
// the scene's origin, through everything in the way.
const CAMERA_LINGER_SECONDS = 2
// -----------------------------------------------------------------------------------------

/**
 * Times are from the start of the greeting, in seconds. Each line holds until the next; a `\n`
 * breaks it onto two rows.
 */
const SUBTITLES: { at: number; text: string }[] = [
  { at: 0, text: 'Howdy, stranger!' },
  { at: 2, text: 'Welcome to Claim Bite Town, \nwhere dreams come true!' },
  { at: 5, text: 'Here, take this free pickaxe!' }
]

const TOTAL_SECONDS = AUDIO_DELAY_SECONDS + AUDIO_SECONDS

let elapsed = -1
let camera: Entity | null = null
let target: Entity | null = null
let audio: Entity | null = null

/** How far in the bars are, 0..1. Zero while no cinematic runs. */
export function getWelcomeBars(): number {
  if (elapsed < 0) return 0
  const into = Math.min(1, elapsed / BARS_SECONDS)
  const out = Math.min(1, (TOTAL_SECONDS - elapsed) / BARS_SECONDS)
  return Math.max(0, Math.min(into, out))
}

/** The subtitle to show now, or '' for none. */
export function getWelcomeSubtitle(): string {
  if (elapsed < AUDIO_DELAY_SECONDS) return ''
  const t = elapsed - AUDIO_DELAY_SECONDS
  let line = ''
  for (const subtitle of SUBTITLES) if (t >= subtitle.at) line = subtitle.text
  return line
}

function finish(): void {
  engine.removeSystem(welcomeSystem)
  elapsed = -1
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
  InputModifier.deleteFrom(engine.PlayerEntity)
  if (audio !== null) engine.removeEntity(audio)
  audio = null
  startTownMusic()

  const leftover = camera
  const leftoverTarget = target
  camera = null
  target = null
  if (leftover === null) return
  let linger = CAMERA_LINGER_SECONDS
  engine.addSystem(function welcomeCameraCleanup(dt: number) {
    linger -= dt
    if (linger > 0) return
    engine.removeEntity(leftover)
    if (leftoverTarget !== null) engine.removeEntity(leftoverTarget)
    engine.removeSystem(welcomeCameraCleanup)
  })
}

function welcomeSystem(dt: number): void {
  const before = elapsed
  elapsed += dt

  if (before < AUDIO_DELAY_SECONDS && elapsed >= AUDIO_DELAY_SECONDS) {
    audio = engine.addEntity()
    Transform.create(audio, {})
    AudioSource.create(audio, { audioClipUrl: WELCOME_AUDIO, playing: true, loop: false, volume: 1, global: true })
  }

  if (elapsed >= TOTAL_SECONDS) finish()
}

/** Starts the welcome shot. Does nothing if the mayor or the player cannot be found. */
export function playWelcomeCinematic(): void {
  if (elapsed >= 0) return
  const mayor = engine.getEntityOrNullByName(MAYOR_ENTITY_NAME)
  const mayorTransform = mayor === null ? null : Transform.getOrNull(mayor)
  if (mayorTransform === null) {
    console.error(`[welcome] no "${MAYOR_ENTITY_NAME}" in the scene — skipping the welcome`)
    startTownMusic()
    return
  }

  // He stands at the scene root, so his position is already world space. Aimed at a point
  // over him rather than at him, whose origin is his feet.
  const aim = Vector3.add(mayorTransform.position, Vector3.create(0, TARGET_HEIGHT, 0))

  // Back to spawn, turned to the mayor. Asynchronous, so the player's Transform does not
  // show it yet: everything below is worked out from the spawn, not read back.
  movePlayerTo({ newRelativePosition: SPAWN_POSITION, avatarTarget: aim, cameraTarget: aim }).catch((error) => {
    console.error(`[welcome] could not move the player to spawn: ${error}`)
  })

  // Behind and to the left of the player on the ground plane, facing the mayor. Their left is
  // their forward turned a quarter to the left: (-z, x).
  const toMayor = Vector3.create(aim.x - SPAWN_POSITION.x, 0, aim.z - SPAWN_POSITION.z)
  const flat = Vector3.length(toMayor) < 0.001 ? Vector3.Forward() : Vector3.normalize(toMayor)
  const position = Vector3.create(
    SPAWN_POSITION.x - flat.x * CAMERA_BACK - flat.z * CAMERA_LEFT,
    SPAWN_POSITION.y + CAMERA_UP,
    SPAWN_POSITION.z - flat.z * CAMERA_BACK + flat.x * CAMERA_LEFT
  )

  target = engine.addEntity()
  Transform.create(target, { position: aim })

  camera = engine.addEntity()
  Transform.create(camera, { position })
  VirtualCamera.create(camera, {
    lookAtEntity: target,
    defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) }
  })
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camera })

  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true })
  })

  elapsed = 0
  engine.addSystem(welcomeSystem, undefined, 'client:welcome')
}
