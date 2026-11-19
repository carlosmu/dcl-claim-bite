// The client's side of the Marketplace Credits campaign (shared/credits-campaign.ts): keeps what
// the server last said, and the admin's winners export. Client only. Nothing here decides anything:
// the server counts the rocks and says where the player stands.

import { isStateSyncronized } from '@dcl/sdk/network'
import { copyToClipboard } from '~system/RestrictedActions'

import { room } from '../shared/net/protocol'
import { CAMPAIGN_PHASES, CampaignPhase } from '../shared/credits-campaign'

export type CampaignStatus = {
  phase: CampaignPhase
  rocks: number
  goal: number
  credits: number
  /** Wall-clock ms on this client when the next game day starts, when the campaign ends, and when it starts. */
  nextDayAt: number
  endsAt: number
  startsAt: number
}

export type CampaignAdmin = {
  open: boolean
  start: string
  end: string
  softCap: number
  /** -1 while the server has not read the list yet. */
  reserved: number
  claimed: number
}

let status: CampaignStatus | null = null

/** Called when a day of the quest is completed here and now: day 1 reserved, or day 2 claimed. */
let onMilestone: (() => void) | null = null

/** What to do when a day of the quest is completed (ui.tsx opens the Credits tab). */
export function onCampaignMilestone(callback: () => void): void {
  onMilestone = callback
}

let admin: CampaignAdmin | null = null

/** The winners' CSV being put together, part by part. */
let winnerParts: string[] = []
/** When the last full export reached the clipboard (Date.now()), and how many winners it held. */
let copiedAt = 0
let copiedCount = 0

/**
 * Where the player stands, with the day rolled over on this side: a player who reserved and is
 * still here when the next day starts sees day 2 at once, without waiting for a rock. Null: nothing
 * to show (no status yet, or the campaign is closed).
 */
export function getCampaignStatus(): CampaignStatus | null {
  if (status === null) return null
  const now = Date.now()
  if (status.phase === 'off' || now >= status.endsAt) return null
  if (status.phase === 'reserved' && now >= status.nextDayAt) return { ...status, phase: 'day2', rocks: 0 }
  if (status.phase === 'day1' && now >= status.nextDayAt) return { ...status, rocks: 0 }
  return status
}

/** The admin's figures, or null for everyone else (and until the server sends them). */
export function getCampaignAdmin(): CampaignAdmin | null {
  return admin
}

export function getWinnersCopied(): { at: number; count: number } {
  return { at: copiedAt, count: copiedCount }
}

/** ADMIN: asks for the winners; they land on the clipboard as CSV. The server refuses anyone not in shared/admins.ts. */
export function sendAdminCampaignWinners(): void {
  if (!isStateSyncronized()) return
  room.send('adminCampaignWinners', { ready: true })
}

export function setupCampaignLink(): void {
  room.onMessage('campaignStatus', (data) => {
    const now = Date.now()
    const phase = CAMPAIGN_PHASES.includes(data.phase as CampaignPhase) ? (data.phase as CampaignPhase) : 'off'
    // Only a change seen arriving counts: a status that is already reserved or claimed on arrival is old news.
    const before = status?.phase
    const milestone = (before === 'day1' && phase === 'reserved') || ((before === 'day2' || before === 'reserved') && phase === 'claimed')
    status = {
      phase,
      rocks: data.rocks,
      goal: data.goal,
      credits: data.credits,
      nextDayAt: now + data.msToNextDay,
      endsAt: now + data.msToEnd,
      startsAt: now + data.msToStart
    }
    if (milestone) onMilestone?.()
  })

  room.onMessage('campaignAdmin', (data) => {
    admin = { ...data }
  })

  room.onMessage('campaignWinners', (data) => {
    if (data.part === 0) winnerParts = []
    winnerParts[data.part] = data.csv
    if (winnerParts.filter((part) => part !== undefined).length < data.parts) return
    const csv = winnerParts.join('')
    winnerParts = []
    // The header line does not count.
    copiedCount = Math.max(0, csv.trim().split('\n').length - 1)
    copiedAt = Date.now()
    console.log(`[Client] campaign winners (${copiedCount}):\n${csv}`)
    void copyToClipboard({ text: csv })
  })
}
