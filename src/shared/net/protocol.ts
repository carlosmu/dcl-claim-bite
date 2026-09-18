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

  // "I finished my rock." Paid only if enough time has passed since the last one for the hits
  // it takes. TBD: the player's distance to the rock is not validated. `rocks` is how many
  // rocks the client's scene has, so the server can pick the next shared one (server/rock.ts).
  rockDone: Schemas.Map({ rocks: Schemas.Number }),
  sell: Schemas.Map({ amount: Schemas.Number }),
  buy: Schemas.Map({ itemId: Schemas.String }),

  /** "Use this pick." Only a pick the player already owns can be equipped. */
  equip: Schemas.Map({ itemId: Schemas.String }),

  /** "Empty the rig into my bag." Takes what fits and leaves the rest in the rig. */
  collect: Schemas.Map({ ready: Schemas.Boolean }),

  /** "Mayor, I have no pick." Granted only to a player who owns none. */
  claimPick: Schemas.Map({ ready: Schemas.Boolean }),

  /** DEBUG: "give me coins." Refused by the server unless DEBUG_ADD_COINS is on (shared/debug-flags.ts). */
  debugCoins: Schemas.Map({ amount: Schemas.Number }),

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
    // What the rig is holding, and how much it can hold. Zero capacity means none is owned.
    muleOre: Schemas.Number,
    muleCapacity: Schemas.Number
  }),

  // Server -> one client: the outcome of something the player asked for, for the log and
  // for the sound. `ok` false means the request was refused.
  actionResult: Schemas.Map({
    action: Schemas.String,
    ok: Schemas.Boolean,
    detail: Schemas.String
  })
}

export const room = registerMessages(Messages)
