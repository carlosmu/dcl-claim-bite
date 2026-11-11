// The Decentraland Rewards service: hands out the Claim Office's free wearable.
//
// Server-only. The campaign's dispenser key is a secret: it lives in the REWARDS_DISPENSER_KEY
// environment variable (decentraland.org/storage → Environment, or `.env` in a local preview)
// and never reaches a client. The campaign itself decides the item and should be set to
// assign one reward per player, so a claim that slips past the scene's own record (a purse
// that failed to save) still cannot be paid twice.
//
// Campaign: e1daa94a-b159-41f4-8402-197083ef7380 (rewards.decentraland.org), minting from
// 0xc3b60c78172aec96dfe7f0225a7f80c456c28eb7. Neither is needed here: the key names the campaign.
//
// https://docs.decentraland.org/creator/rewards/api

import { EnvVar } from '@dcl/sdk/server'

const REWARDS_URL = 'https://rewards.decentraland.org/api/rewards'
const DISPENSER_KEY_VAR = 'REWARDS_DISPENSER_KEY'

/**
 * `alreadyClaimed`: the campaign turned the wallet down because it already got its reward (the
 * campaign's one-per-player limit). The scene then records the gift as claimed, so a record it
 * lost (another server's storage, a wiped preview) is put right on the next try.
 */
export type RewardResult = { ok: boolean; detail: string; alreadyClaimed: boolean }

/**
 * The Rewards API does not document its refusal for a wallet over the limit, so this reads the
 * error text. Logged in full on every refusal: tighten it once the real wording is seen.
 */
const ALREADY_CLAIMED_PATTERN = /already|limit|exceed/i

/** Asks the campaign to assign its wearable to this wallet. Never throws. */
export async function requestReward(address: string): Promise<RewardResult> {
  const key = await EnvVar.get(DISPENSER_KEY_VAR)
  if (key === '') {
    console.log(`[Server] ${DISPENSER_KEY_VAR} is not set: the gift cannot be claimed`)
    return { ok: false, detail: 'The gift is not available right now', alreadyClaimed: false }
  }
  try {
    const response = await fetch(REWARDS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_key: key, beneficiary: address })
    })
    const text = await response.text()
    let body: { ok?: boolean; error?: string; message?: string } = {}
    try {
      body = JSON.parse(text)
    } catch {
      // not JSON: logged below as is
    }
    if (response.ok && body.ok === true) return { ok: true, detail: 'assigned', alreadyClaimed: false }
    console.log(`[Server] Rewards refused ${address}: ${response.status} ${text.slice(0, 300)}`)
    const detail = body.error ?? body.message ?? `Rewards answered ${response.status}`
    return { ok: false, detail, alreadyClaimed: ALREADY_CLAIMED_PATTERN.test(detail) }
  } catch (error) {
    console.log(`[Server] Rewards request failed for ${address}: ${error}`)
    return { ok: false, detail: 'Could not reach the Rewards service, try again later', alreadyClaimed: false }
  }
}
