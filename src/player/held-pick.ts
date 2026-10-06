import { AvatarAnchorPointType, AvatarAttach, ColliderLayer, Entity, engine, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'

import { HeldPicks } from '../shared/net/held-picks-sync'

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

/** Takes the pick out of the player's hand, if there is one. */
export function unequipPick(): void {
  if (anchor !== null) engine.removeEntity(anchor)
  if (model !== null) engine.removeEntity(model)
  anchor = null
  model = null
  heldSrc = ''
}

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

  const held = hang(src)
  anchor = held.anchor
  model = held.model

  console.log('[player] pick equipped to the right hand')
}

/** Builds the anchor + model pair. No avatarId means the local player. */
function hang(src: string, avatarId?: string): { anchor: Entity; model: Entity } {
  const anchor = engine.addEntity()
  AvatarAttach.create(anchor, { avatarId, anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND })

  const model = engine.addEntity()
  Transform.create(model, {
    position: HELD_POSITION,
    rotation: HELD_ROTATION,
    scale: HELD_SCALE,
    parent: anchor
  })
  // A pick in a hand should never block anyone's movement or eat a pointer click.
  GltfContainer.create(model, {
    src,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  return { anchor, model }
}

// --- Other players' picks ------------------------------------------------------------------
//
// The server lists who holds what (HeldPicks); this mirrors that list onto the other avatars.
// Our own entry is skipped — the wallet already put our pick in our hand, without the wait.

type OtherPick = { anchor: Entity; model: Entity; src: string }
const others = new Map<string, OtherPick>()
let myAddress = ''

function syncOtherPicks(): void {
  if (myAddress === '') myAddress = (getPlayer()?.userId ?? '').toLowerCase()
  if (myAddress === '') return

  let entries: readonly { address: string; pickId: string }[] = []
  for (const [, held] of engine.getEntitiesWith(HeldPicks)) entries = held.picks

  const seen = new Set<string>()
  for (const entry of entries) {
    const address = entry.address.toLowerCase()
    if (address === myAddress) continue
    seen.add(address)

    const src = PICK_MODELS[entry.pickId] ?? PICK_MODELS.pick
    const current = others.get(address)
    if (current === undefined) {
      others.set(address, { ...hang(src, entry.address), src })
    } else if (current.src !== src) {
      GltfContainer.getMutable(current.model).src = src
      current.src = src
    }
  }

  for (const [address, held] of others) {
    if (seen.has(address)) continue
    engine.removeEntity(held.anchor)
    engine.removeEntity(held.model)
    others.delete(address)
  }
}

export function setupHeldPicks(): void {
  engine.addSystem(syncOtherPicks, undefined, 'client:held-picks')
}
