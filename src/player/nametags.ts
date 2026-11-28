import { AvatarNametag, engine, Entity, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'

import { PlayerTiers } from '../shared/net/tiers-sync'
import { getLanguage, StringKey, t } from '../i18n'

// Every avatar's tag shows its tier: the best property its player owns. The tiers come from the
// server (PlayerTiers); plates are drawn client-side only, so every client tags the avatars
// around it itself, and retags one when its owner upgrades.

type TierStyle = { title: StringKey; background: Color3; border: Color3 }

// White, orange, yellow, green. The dark label stays the same on all four so it keeps its
// contrast on a phone screen.
const TIERS: Record<number, TierStyle> = {
  1: { title: 'tier.drifter', background: Color3.White(), border: Color3.create(0.45, 0.45, 0.45) },
  2: { title: 'tier.cabinOwner', background: Color3.create(1, 0.6, 0.15), border: Color3.create(0.55, 0.28, 0.05) },
  3: { title: 'tier.homeowner', background: Color3.Yellow(), border: Color3.create(0.45, 0.3, 0.08) },
  4: { title: 'tier.ranchOwner', background: Color3.create(0.4, 0.85, 0.35), border: Color3.create(0.15, 0.4, 0.12) }
}

const LABEL_COLOR = Color3.create(0.2, 0.12, 0.02)

// Staff wear a fixed plate that replaces their tier, whatever they own. The label is the same in
// every language. Addresses are lowercase.
type StaffStyle = { label: string; labelColor: Color3; background: Color3; border: Color3 }

const STAFF_PLATE: StaffStyle = {
  label: "★ Sheriff's Deputy",
  labelColor: Color3.create(1, 0.82, 0.3),
  background: Color3.create(0.35, 0.2, 0.08),
  border: Color3.create(1, 0.82, 0.3)
}

const STAFF: Record<string, StaffStyle> = {
  '0x4b538e1e044922aec2f428ec7e17a99f44205ff9': STAFF_PLATE
  // '0x…': STAFF_PLATE,
}

/** The tier (and language) each avatar was last tagged with, so a plate is only rewritten when either changes. */
const tagged = new Map<Entity, string>()

function tagPlayers(): void {
  const tiers = new Map<string, number>()
  for (const [, players] of engine.getEntitiesWith(PlayerTiers)) {
    for (const player of players.players) tiers.set(player.address.toLowerCase(), player.tier)
  }

  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    const staff = STAFF[identity.address.toLowerCase()]
    if (staff !== undefined) {
      if (tagged.get(entity) === staff.label) continue
      tagged.set(entity, staff.label)
      AvatarNametag.createOrReplace(entity, {
        label: staff.label,
        labelColor: staff.labelColor,
        backgroundColor: staff.background,
        borderColor: staff.border
      })
      continue
    }

    // Until the server has read their purse there is nothing true to show.
    const tier = tiers.get(identity.address.toLowerCase())
    const style = tier !== undefined ? TIERS[tier] : undefined
    const tag = `${tier}|${getLanguage()}`
    if (tier === undefined || style === undefined || tagged.get(entity) === tag) continue
    tagged.set(entity, tag)
    AvatarNametag.createOrReplace(entity, {
      label: t('tier.label', { tier, title: t(style.title) }),
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
