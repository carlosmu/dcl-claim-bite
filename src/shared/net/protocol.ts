// What the two halves of the scene say to each other.
//
// The shape of this file is the trust boundary: everything a client sends is a *request*,
// never a statement of fact. `sell` asks to sell and is told what it got; it does not
// announce a payout. The server is what turns a request into a number.

import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

export const Messages = {
  // Client -> Server.
  //
  // "I am connected and listening." The server cannot know when a client's channel is ready,
  // and a wallet sent a moment too early is simply lost — so the client asks instead of being
  // guessed at. Retried until answered, which also covers a server that restarted underneath.
  hello: Schemas.Map({ ready: Schemas.Boolean }),

  // "I finished the rock with this seq." Paid only if enough time has passed since the last one
  // for the hits it takes. TBD: the player's distance to the rock is not validated.
  rockDone: Schemas.Map({ seq: Schemas.Number }),

  /** "I just hit the rock with this seq." How the server knows who is mining which rock. */
  swing: Schemas.Map({ seq: Schemas.Number }),
  sell: Schemas.Map({ amount: Schemas.Number }),
  buy: Schemas.Map({ itemId: Schemas.String }),

  /** "Use this pick." Only a pick the player already owns can be equipped. */
  equip: Schemas.Map({ itemId: Schemas.String }),

  /** "Spin the slot machine for this bet." The server decides the reels and what they pay. */
  slotSpin: Schemas.Map({ bet: Schemas.Number }),

  /** "Mayor, I have no pick." Granted only to a player who owns none. */
  claimPick: Schemas.Map({ ready: Schemas.Boolean }),

  /** "Show me who owns this property." Answered with `ownerCard`, to the asker alone. */
  askOwnerCard: Schemas.Map({ owner: Schemas.String }),

  /** "Leave this note at their door." Refused for one's own door, a door with no owner, or too soon after the last. */
  leaveNote: Schemas.Map({ owner: Schemas.String, text: Schemas.String }),

  /** "Give me this Claim Office reward" (a campaign id from shared/rewards.ts). Granted once, to a player who has completed its quest. */
  claimReward: Schemas.Map({ id: Schemas.String }),

  /** "Credit me this compensation" (an id from server/compensations.ts). Granted once, and only to the player it is for. */
  claimCompensation: Schemas.Map({ id: Schemas.String }),

  /** "I run this deploy" (its entity id). A client on another deploy than the server is told to rejoin. */
  clientBuild: Schemas.Map({ entity: Schemas.String }),

  /** ADMIN: "start (or end) maintenance" before a deploy. Refused unless the sender is in shared/admins.ts. */
  adminMaintenance: Schemas.Map({ on: Schemas.Boolean }),

  /** "Throw away the notes left at my door." */
  clearNotes: Schemas.Map({ ready: Schemas.Boolean }),

  /** DEBUG: "give me coins." Refused by the server unless DEBUG_ADD_COINS is on (shared/debug-flags.ts). */
  debugCoins: Schemas.Map({ amount: Schemas.Number }),

  /** DEBUG: "give me ore." Refused by the server unless DEBUG_ADD_ORE is on. Fills the bag at most. */
  debugOre: Schemas.Map({ amount: Schemas.Number }),

  /** DEBUG: "wipe my progress." Refused by the server unless DEBUG_RESET_PROGRESS is on. */
  debugReset: Schemas.Map({ ready: Schemas.Boolean }),

  // Server -> one client: that player's own purse, after anything that changed it.
  // Sent to the owner alone, not broadcast: another player's balance is nobody's business.
  wallet: Schemas.Map({
    ore: Schemas.Number,
    coins: Schemas.Number,
    // The inventory as `id:count` pairs joined by commas. A map schema would be tidier, but
    // the item list is short and this keeps one message instead of one per item.
    owned: Schemas.String,
    // Derived server-side from `owned` rather than worked out by the client, so the HUD can
    // draw the bag and the yield without the client deciding what a player is entitled to.
    capacity: Schemas.Number,
    // Hits a rock takes with the pick in use. Zero means no pick.
    hitsPerRock: Schemas.Number,
    // The id of the pick in use — the one chosen in the inventory, or the best owned. Empty
    // means no pick.
    equipped: Schemas.String,
    // Rocks each owned pick has left before it breaks, as `id:rocksLeft` pairs like `owned`.
    pickDurability: Schemas.String,
    // How many rigs the player owns. They dig straight into storage, so there is no load to show.
    mules: Schemas.Number,
    // Hours the rigs keep running on their fuel. Zero means they have stopped.
    muleFuelHours: Schemas.Number,
    // Whose purse this is, lower case. The client drops a wallet that is not its own: one with no
    // pick and no coins once reached a client before its real one and greeted a veteran as new.
    address: Schemas.String,
    // Storage had no purse for this player: a real first visit, so an empty purse is believed at once.
    fresh: Schemas.Boolean,
    // The generation id of the server that sent it (server/generation.ts), for the title card's status line.
    server: Schemas.String
  }),

  // Server -> one client: the ore the rigs put in storage while the player was away, worked out
  // on arrival. Sent on arrival and again on `hello`, since the first can land before the client
  // listens; the client treats a repeat as the same news, not more ore.
  muleAway: Schemas.Map({ ore: Schemas.Number }),

  // Server -> one client: how many store purchases the player has ever made, sent after each
  // one goes through. Paces the feedback asks (src/playtest.ts).
  purchaseCount: Schemas.Map({ count: Schemas.Number }),

  // Server -> one client: where they stand with every Claim Office reward (shared/rewards.ts).
  // Sent on arrival, on hello, and whenever a quest step is met or a claim is answered.
  rewardStatus: Schemas.Map({
    rewards: Schemas.Array(
      Schemas.Map({
        id: Schemas.String,
        done: Schemas.Array(Schemas.String),
        claimed: Schemas.Boolean,
        claiming: Schemas.Boolean
      })
    )
  }),

  // Server -> one client: coins owed to this player for something that went wrong, waiting to be
  // credited. Sent on arrival and on hello while not credited, and once more with `claimed` true
  // when it is. `date` is the day it happened, as the screen says it ("November 11"). `kind` is
  // who apologises on screen: 'bank' or 'casino' (server/compensations.ts).
  compensation: Schemas.Map({
    id: Schemas.String,
    coins: Schemas.Number,
    date: Schemas.String,
    kind: Schemas.String,
    claimed: Schemas.Boolean
  }),

  // Server -> everyone it serves: a newer server has started (server/generation.ts), so this one no
  // longer saves anything. Every client that hears it is asked to rejoin, whatever code it runs:
  // only a client attached to this outdated server hears it. `entity` is the newest deploy's id.
  serverOutdated: Schemas.Map({ entity: Schemas.String }),

  // Server -> everyone: maintenance started or ended (an admin's doing, before a deploy). While on,
  // nothing is saved and nothing is accepted: the screen asks players to wait for the new version.
  maintenance: Schemas.Map({ on: Schemas.Boolean }),

  // Server -> one client: its state is from another server (an old deploy's rocks, say), so what
  // it does is not being counted. Answered with the rejoin screen. `reason` is for the log.
  rejoinNeeded: Schemas.Map({ reason: Schemas.String }),

  // Server -> one client: what a finished rock paid. `bonus` is the Social Bonus part of `ore`,
  // already capped by the bag like the rest.
  rockPaid: Schemas.Map({ ore: Schemas.Number, bonus: Schemas.Number }),

  // Server -> one client: how a spin came out, sent before the wallet that charges and pays it.
  // `reels` are indexes into SLOT_SYMBOLS; `win` is the whole payout, the jackpot's share included.
  slotResult: Schemas.Map({
    reels: Schemas.Array(Schemas.Number),
    bet: Schemas.Number,
    win: Schemas.Number,
    jackpot: Schemas.Boolean
  }),

  // Server -> one client: what can be said about a property's owner. No coins and no ore: those
  // are the owner's business. `found` false means the server knows of no property of theirs.
  ownerCard: Schemas.Map({
    owner: Schemas.String,
    found: Schemas.Boolean,
    name: Schemas.String,
    // The best housing owned, the pick in use and the top storage, as item ids ('' for none).
    property: Schemas.String,
    pick: Schemas.String,
    storage: Schemas.String,
    mules: Schemas.Number,
    // In the scene right now.
    online: Schemas.Boolean
  }),

  // Server -> one client: every note left at their door, oldest first, as JSON
  // ({ from, text, at }[], `at` in wall-clock ms). Sent on arrival and whenever one is left.
  notes: Schemas.Map({ json: Schemas.String }),

  // Server -> one client: the outcome of something the player asked for, for the log and
  // for the sound. `ok` false means the request was refused.
  actionResult: Schemas.Map({
    action: Schemas.String,
    ok: Schemas.Boolean,
    detail: Schemas.String
  })
}

export const room = registerMessages(Messages)
