# Balance — Claim Bite

Owner-approved 2026-09-17 as the **final word** on progression, replacing the 2026-09-16 pass
(ore-per-coin with macro + slippage, three bought picks, bag/wheelbarrow, rented claim). The
numbers here are the source of truth for `src/shared/economy/constants.ts` and
`src/shared/economy/catalogue.ts`; if the two disagree, the code is wrong.

Everything marked *first pass* is a starting point to validate in playtest, not a final value.

## 0. The model: one of each, upgraded in place

A player owns **one** pick, **one** M.U.L.E., **one** warehouse and **one** house. Each climbs
tiers; nothing is bought as a second instance. Upgrade cost grows per tier (**×2 per jump**,
e.g. 150 / 300 / 600) rather than flat, so the last jump stays a real decision instead of a
formality.

Everything is **locational**: you upgrade an object where it stands (pick at the mayor, M.U.L.E.
and fuel at the claim, warehouse at its building, house at its lot). There is no central Market
menu and no inventory/toolbar.

**The anchors:** a completed rock pays **5 ore**, and M.U.L.E. tier 1 = **10 ore/hour**. Every other number derives proportionally from
it.

## 1. Market

Reworked 2026-11-11: the market now depends on how many players are in the scene. With 30
players online the old market sat at the cap all the time, because everybody sold into a
market sized for one.

| | Value |
|---|---|
| Base rate | **1 coin = 10 ore** |
| Cap (worst rate) | **1 coin = 12 ore** — never worse, so selling always pays something |
| Crowd | players in the scene, counted between **3** and **30** (1–2 count as 3, more than 30 as 30) |
| Selling | pooled per **minute**: `+0.5 × log2(1 + ore sold that minute / depth)` |
| Depth | **100 ore** with 3 players, **1,000 ore** with 30, linear in between |
| Recovery | every **10 seconds**, a share of the distance back to 10 |
| Recovery share | **17% per minute** with 3 players, **53% per minute** with 30, linear in between |
| Full recovery cap → base | **~20 min** with 3 players, **5 min** with 30 |

Everything between 3 and 30 players slides linearly: 10 players have a depth of ~333 ore and
give back ~26% per minute.

### Selling

Impact is by the **total ore sold in the minute**, on a log curve — so splitting a sale into
pieces inside the minute changes nothing, and a whale moves the market less than
proportionally. A sale is priced whole at the rate on the screen (to one decimal); the rate
moves afterwards, so the dump costs the next sale, not this one.

What one minute of selling does to the rate:

| Ore sold in the minute | 3 players | 30 players |
|---|---|---|
| 100 | +0.5 | +0.07 |
| 500 | +1.3 | +0.3 |
| 1,000 | +1.7 | +0.5 |
| 3,000 | cap | +1.0 |
| 5,000 | cap | +1.3 |
| Ore to go from 10 to the cap | ~1,500 | ~15,000 |

The same 3,000 ore that floors a small town moves a full one by half the range: one seller is
strong among 3 and weak among 30. The crowd is fixed for the minute once something has been
sold in it, so a player walking out cannot move the rate without a sale.

### Recovery

Proportional, not a fixed step: the further from 10, the faster it falls. From the cap with
nobody selling:

| Minute | 3 players | 30 players |
|---|---|---|
| 0 | 12.00 | 12.00 |
| 1 | 11.66 | 10.94 |
| 2 | 11.38 | 10.44 |
| 3 | 11.14 | 10.21 |
| 5 | 10.79 | **10.00** |
| 10 | 10.31 | |
| 15 | 10.12 | |
| 20 | **10.00** | |

Within 0.05 of the base the rate snaps to 10: a share of the distance alone would never arrive.
The fall is applied in small steps every 10 seconds so it reads as smooth; players see the rate
to one decimal, and the price notification fires only when that decimal changes.

Because recovery is a share of the distance, a steady stream of sales settles at a level
instead of climbing to the cap and staying there: the busier the minute, the higher the level.

Recovery now fits inside a session (5–20 min) instead of crossing sessions: waiting out a bad
rate is a short bet a player can actually make before leaving.

Constants: `MARKET_*` and `RATE_*` in `src/shared/economy/constants.ts`; the logic is
`src/shared/state/market.ts`.

Superseded: +1% per 500 ore with 1%/hour recovery (~20 hours cap → base); the two-speed macro
+ slippage model and the 40-ore cap.

## 2. Picks — manual mining

**Mechanic (replaces the timing tap):** no timing bar. Walk up to a rock; in range, the pick
animation plays automatically and repeatedly (Craft and Battle style). Each hit fills that
player's own progress bar on the rock. When full: **+5 ore**, the rock disappears for that
player only, and they are assigned a next rock elsewhere in the quarry.

**Rocks are public and per-player at the same time.** Every player sees the same rock in the
same place; each has a separate progress bar and a separate "done" state. The rock leaves the
world only when no player is still active on it. Rocks regenerate (unlike house lots).

| Tier | Cost | Hits per ore | Note |
|---|---|---|---|
| 0 | Free, always, from the mayor at the public dig | 12 | Anti-soft-lock fallback: no pick + no coins must never mean no way to earn coins. The mayor hands it over as often as needed |
| 1 | ~75–100 (*first pass*) | 10 | First real purchase |
| 2 | 300 (*first pass*, ×2 curve) | 8 | Loses yield to wear like the others |
| 3 | 600 (*first pass*, ×2 curve) | 6 | Lasts indefinitely if unused |

One axis only across all tiers: hits needed per ore. No speed, crit or other new axes.

**Wear:** every pick loses yield with use (Pillar 2 pressure stays) — use is the only thing that
wears it. There is no time-based expiry at any tier. Wear rate and how it expresses itself in
hits-per-ore: TBD.

**Boom-town bonus:** active while another player is **active on the same rock** at the same
time — progress and arrival order don't matter. If the other leaves or completes their bar, the
bonus drops for whoever remains. **Size: +1 ore per other active player** on top of the base 5
when you complete your bar — alone 5, with 2 players on the rock 6 each, with 3 players 7, with
4 players 8 (+20% per extra player).
No cap set yet (open).

## 3. M.U.L.E. — idle mining, the reason to come back

**Placement:** renting a claim plants the tier-1 M.U.L.E. there automatically. Upgrading is
interacting with the one already standing. No inventory, no remove/replace.

| Tier | Cost | Yield | Fuel burn |
|---|---|---|---|
| 1 | TBD — comes with the claim | **10 ore/hour** (*first pass, anchor*) | 1 charge / 24h |
| 2 | 300 (*first pass*) | Medium — TBD | Faster — TBD |
| 3 | 600 (*first pass*) | High — TBD | Fastest — TBD |

No own cap: it produces straight into the player's warehouse (§4).

**Fuel (replaces claim rent):** a consumable bought directly at the M.U.L.E. (walk to the claim,
interact, refuel). The claim itself costs nothing recurring; all operating cost lives in fuel.

| | Value |
|---|---|
| One charge | 24h at tier 1, **~8 coins** (*first pass*) |
| Out of fuel | Production stops; ore already produced is kept |
| Warehouse full | Production pauses **and fuel is not consumed** |
| Higher tier | Burns fuel faster — more output, more upkeep |

Margin check at tier 1: 240 ore/day → 20 coins at the worst rate (12 ore/coin) against 8 coins
of fuel ≈ **2.5×**. Fuel scaling with tier (not flat) is what brakes multi-claim abuse without
touching alt accounts directly.

## 4. Warehouse — how much can pile up

**One storage** for all ore: manual mining and the M.U.L.E. both fill it, and selling draws from
it. Replaces the carry bag and the wheelbarrow.

| Tier | Cost | Ore cap | Note |
|---|---|---|---|
| 0 — Pockets | Free, from the start | **~100** — about 20 completed rocks | What a player carries before owning a warehouse. Guarantees manual mining works from the first swing |
| 1 | TBD | **~500** (*first pass*) — a tier-1 M.U.L.E. fills it in ~50h | Fuel (24h) is the daily hook; the cap is the "don't stay away too long" hook |
| 2 | 300 (*first pass*) | **~2,000** | — |
| 3 | 600 (*first pass*) | **~5,000** | Less urgency to return, more to lose by forgetting |

A full warehouse pauses the M.U.L.E. (no fuel spent) and stops manual mining from paying.

## 5. Houses — status, not production

**Placement:** no menu. Empty lots along the town street carry a sign (price, available or not);
buy on the spot. First come, first choose. Lots are **limited and permanent**. Price is by
location: closer to the center (bank/main street, more visibility) costs more, further out is
cheaper.

| Tier | Cost | Effect |
|---|---|---|
| 1 — Lot | **~2 days** of average play | Empty ground with the player's name. Bought outright, never rented, never resets — the mid-term goal between the daily M.U.L.E. and the full house |
| 2 — Ranchito | **~4 days** of average play | Small built house |
| 3 — Mansión | **~8 days** of average play (doubling, *first pass*) | The most visible from the main street |

House prices are set in **days of average play** (a typical daily session plus the M.U.L.E.'s
net output), doubling per tier, and converted to coins once that daily income is measured.
Location then scales the lot price up near the center and down further out. For scale, a
tier-1 M.U.L.E. alone nets about 16 coins a day, so with no manual mining at all the three
tiers would be roughly 32 / 64 / 128.

All cosmetic. **Wear is visual only** (textures/state if you don't play), never loss of tier or
value, repaired with a simple free action on return. Never a tax, never a risk of losing it.

## 6. Status panel

Read-only, opened by a button: current tier of pick, M.U.L.E., warehouse and house. Buys and
places nothing — that stays at each object's physical location. Not a permanent overlay (GDD §6).

## 7. Role of each system

- **Pick** → manual mining, the active session.
- **M.U.L.E.** → passive mining, the day-to-day return.
- **Warehouse** → how long you can stay away before you have to return.
- **House** → public status, the mid/long-term goal, no risk of loss.

## 8. Still to tune

- Costs of every tier (claim/M.U.L.E. T1, warehouse T1)
- "One day of average play" in coins — the unit house prices are set in; needs a playtest of a typical daily session plus the M.U.L.E.'s net
- Location multiplier for lots
- Pick wear rate and how it shows in hits-per-ore
- M.U.L.E. yield for tiers 2–3; warehouse caps for tiers 2–3
- Fuel burn per M.U.L.E. tier and its price
- Whether the boom-town bonus needs a cap
