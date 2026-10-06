import { AvatarNametag } from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'
import { onEnterScene } from '@dcl/sdk/players'

// Plates are drawn client-side only, so every client tags these avatars itself as they show up.
const TITLES: Record<string, string> = {
  '0x4b538e1e044922aec2f428ec7e17a99f44205ff9': '★ Sheriff'
}

export function setupNametags() {
  onEnterScene((player) => {
    const label = TITLES[player.userId.toLowerCase()]
    if (label === undefined) return
    AvatarNametag.createOrReplace(player.entity, {
      label,
      labelColor: Color3.create(0.2, 0.12, 0.02),
      backgroundColor: Color3.Yellow(),
      borderColor: Color3.create(0.45, 0.3, 0.08)
    })
  })
}
