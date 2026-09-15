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
  // TBD: `swing` is trusted for now — the server takes the client's word for whether the
  // needle was in the sweet spot, so a modified client can mint ore. Closing that needs the
  // sweep to become server-driven, which is its own step (design/decisions.md, 2026-09-15).
  swing: Schemas.Map({ hit: Schemas.Boolean }),
  sell: Schemas.Map({ amount: Schemas.Number }),
  buy: Schemas.Map({ itemId: Schemas.String }),

  // Server -> one client: that player's own purse, after anything that changed it.
  // Sent to the owner alone, not broadcast: another player's balance is nobody's business.
  wallet: Schemas.Map({
    ore: Schemas.Number,
    coins: Schemas.Number,
    // The inventory as `id:count` pairs joined by commas. A map schema would be tidier, but
    // the item list is short and this keeps one message instead of one per item.
    owned: Schemas.String
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
