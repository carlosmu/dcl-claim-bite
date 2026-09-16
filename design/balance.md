# Balance — Claim Bite

Owner-approved 2026-09-16. The numbers here are the source of truth for
`src/shared/economy/constants.ts` and `src/shared/economy/catalogue.ts`; if the two disagree,
the code is wrong.

Everything is a starting point tuned by hand, not by data. The playtest numbers that would
justify them do not exist yet — §3 of the GDD parks loop tuning until the full loop runs.

## 1. The unit: ore per coin

The ore price is quoted as **how much ore buys one coin**, the way a currency board quotes a
rate, not as coins per ore. Selling pushes the rate **up**, and up is worse for the seller:
after a big sale you need more ore for the same coin.

| | Rate | 100 ore pays |
|---|---|---|
| Base, quiet market | **10** ore per coin | 10 coins |
| Cap, flooded market | **40** ore per coin | 2.5 coins |

The 4× spread between base and cap is the same guardrail the old `ORE_BASE_PRICE` 2 /
`ORE_MIN_PRICE` 0.5 already had, re-expressed — deliberately unchanged, so the only new
variables are the unit and the recovery speed.

The anchor is legibility: **10 hits pay 1 coin**, so a new player can verify the rate without
being told it. With a miss paying nothing, a beginner hitting half the time earns their first
coin in about 20 swings — roughly 16 seconds.

## 2. The rate moves at two speeds

One rate cannot both recover over hours and visibly respond to a single sale: with a slow
recovery, an impact large enough to feel drives the equilibrium far past the cap. So the rate
is the sum of two parts.

```
rate = macro + slippage        (clamped to 40)
```

**Macro** — the town's rate today. Moves on aggregate volume, recovers over hours, and
persists across server restarts. No single sale visibly moves it, the same way one person
selling a hundred dollars does not move an exchange rate. This is what makes the market feel
like a place with a history.

**Slippage** — your own immediate impact. Your sale pushes it hard and it fades in a minute
or two. This is what punishes dumping a full bag at once and rewards spacing sales out.

| | Per ore sold | Recovery | 200 ore moves it |
|---|---|---|---|
| Macro | +0.00002 | τ ≈ 3 h, scaled by population | +0.004 (invisible) |
| Slippage | +0.005 | τ ≈ 90 s | +1.0 (10 → 11) |

The macro's recovery scales with the number of connected players. Because production also
scales with population, the two cancel: **the equilibrium rate is the same in a town of 2 and
a town of 20.** Without that, twenty players pin the rate at the cap permanently and the
decision of when to sell dies — and it would also put the market in direct conflict with the
boom-town bonus, which exists to make a crowd a good thing.

## 3. Tools

Two axes that ask different questions: how fast you dig, and how much you can carry.

| Item | Effect | Price | Pays for itself after |
|---|---|---|---|
| Pick | 1 ore per hit | 10 — the first is a gift from the mayor | — |
| Steel Pick | 2 ore per hit | 40 | ~5 min mining |
| Miner's Pick | 3 ore per hit | 120 | ~16 min mining |
| Wheelbarrow | carry 150 → 500 ore | 60 | — |
| M.U.L.E. | idle rig, see §4 | 100 | ~2 full loads |
| House | none yet | 500 | — |

The Miner's Pick sits **above** the M.U.L.E. on purpose. That is the first real decision in
the game: active throughput while you play, or passive income while you are gone. Two paths
that compete for the same pile of coins.

The Shovel is gone (2026-09-16). It had no answer to "what is this for", which is exactly the
item that should not exist.

**Carrying.** The bag holds 150 ore, or 500 with the wheelbarrow. A full bag disables the
mining bar with a plain "bag full" rather than letting swings silently pay nothing: a tap that
responds but does nothing reads as broken.

150 is about two minutes of digging per trip at the base pick, which sets the mine → walk →
bank rhythm without becoming tedious. It also sits **below** the 200 ore needed to move the
slippage a full point, which is the quiet part of this design: without a wheelbarrow you
cannot move the town's rate at all. The wheelbarrow is what promotes you from a small seller
to someone the market notices — and only then does choosing a sale amount start to matter.

## 4. The M.U.L.E. — TBD, owner review pending

| | Value |
|---|---|
| Yield | 60 ore per hour |
| Capacity | 500 ore — the same as a wheelbarrow, so one full load is one trip |
| Time to fill | ~8.3 hours |
| A full load pays | 50 coins at the base rate |
| Payback | ~2 full loads |

Sized as a **daily collection**: it fills while the player is away and is there when they come
back, which is the return hook §4 of the GDD asks for. Capacity matches the wheelbarrow so a
full load is never stranded. Collection is partial when the bag cannot take it all — what does
not fit stays in the rig rather than being lost.

## 5. What these numbers make the game feel like

At the base pick and base rate, active mining pays **7.5 coins per minute**.

| Goal | Coins | Ore | Active mining |
|---|---|---|---|
| Steel Pick | 40 | 400 | ~5 min |
| Wheelbarrow | 60 | 600 | ~8 min |
| M.U.L.E. | 100 | 1,000 | ~13 min |
| Miner's Pick | 120 | 1,200 | ~16 min |
| House | 500 | 5,000 | ~67 min |

The house is a multi-session goal, which is what §4 wants from persistent building. For scale,
the economy before this pass paid a pick in **1.3 seconds**.

## 6. Known gaps

- **Tool wear** (GDD §3) is not built. It matters more with tiers than without: it is the only
  coin sink after the last pick, and without it a player who reaches the Miner's Pick has
  nothing to spend on until the house. Wear and tier prices should be tuned together.
- **The boom-town bonus** (GDD §5) is not built and is not in these numbers.
- **Duty cycle is a guess.** The macro coefficient assumes players sustain roughly 1 ore per
  second each once walking, selling and shopping are counted. That is the first thing to
  measure in a playtest and the most likely number here to be wrong.
