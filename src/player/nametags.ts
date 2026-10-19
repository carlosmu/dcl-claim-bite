import { AvatarNametag, engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'

import { PlayerTiers } from '../shared/net/tiers-sync'

// Every avatar's tag shows its tier: the best property its player owns. The tiers come from the
// server (PlayerTiers); plates are drawn client-side only, so every client tags the avatars
// around it itself, and retags one when its owner upgrades.

type TierStyle = { title: string; background: Color3; border: Color3 }

// Dust, copper, silver, gold: each step reads richer than the last. The dark label stays the
// same on all four so it keeps its contrast on a phone screen.
const TIERS: Record<number, TierStyle> = {
  1: { title: 'Prospector', background: Color3.create(0.78, 0.7, 0.56), border: Color3.create(0.42, 0.35, 0.25) },
  2: { title: 'Cabin Owner', background: Color3.create(0.9, 0.58, 0.32), border: Color3.create(0.48, 0.25, 0.1) },
  3: { title: 'Homeowner', background: Color3.create(0.84, 0.86, 0.9), border: Color3.create(0.4, 0.42, 0.48) },
  4: { title: 'Ranch Owner', background: Color3.Yellow(), border: Color3.create(0.45, 0.3, 0.08) }
}

const LABEL_COLOR = Color3.create(0.2, 0.12, 0.02)

/** The tier each avatar was last tagged with, so a plate is only rewritten when it changes. */
const tagged = new Map<Entity, number>()

function tagPlayers(): void {
  const tiers = new Map<string, number>()
  for (const [, players] of engine.getEntitiesWith(PlayerTiers)) {
    for (const player of players.players) tiers.set(player.address.toLowerCase(), player.tier)
  }

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    // Until the server has read their purse there is nothing true to show.
    const tier = tiers.get(identity.address.toLowerCase())
    const style = tier !== undefined ? TIERS[tier] : undefined
    if (tier === undefined || style === undefined || tagged.get(entity) === tier) continue
    tagged.set(entity, tier)
    AvatarNametag.createOrReplace(entity, {
      label: `Tier ${tier}:\n${style.title}`,
      labelColor: LABEL_COLOR,
      backgroundColor: style.background,
      borderColor: style.border
    })
  }

  // Avatars that left: their entity may come back for someone else.
  for (const entity of tagged.keys()) {
    if (PlayerIdentityData.getOrNull(entity) === null) tagged.delete(entity)
  }
}

export function setupNametags() {
  engine.addSystem(tagPlayers, undefined, 'client:nametags')
}
