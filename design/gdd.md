*Work in progress · grown from `gdd-template.md`*

*Doc: `▓▓▓▓▓▓▓▓▓▓` · Full document written — every section real, both comparables filled, live-ops in. What's left is honest `TBD:`s (loop numbers, tier pricing) with a stated plan: tune after the full loop is built and playtested.*

# Claim Bite

**Decentraland Creator Success Program**

| |  |
|---|---|
| Public experience title | Claim Bite — IP & Content Policy self-check: clear |
| Deployment target | World: carlosmu.dcl.eth |
| Studio / team name | carlosmu studio |
| Date | 2026-09-01 |
| Contact (Discord + email) | Discord: carlosmu_noz · Email: carlos.damian.munoz@gmail.com |

---

## 0. TL;DR

| | |
|---|---|
| **Player promise** | You are a stranger turned miner in a gold-rush town, mining and selling to get rich while every sale drops the price you see. |
| **Primary player** | For players who already enjoy idle/incremental tap games, arriving mostly alone from Decentraland's Discover feed or a friend's invite, looking for a reason to check back in on their own progress every day. |
| **Current status** | Vertical-slice build under way on an authoritative server. Progression was redesigned 2026-09-17 (see `balance.md`): mining moved from a timing tap to auto-swing on proximity, so the earlier tap tests (`H1-01`, `H1-04`) no longer apply and the new mechanic is built directly. |
| **Requested round** | [agent-decided · accepted] v0 (vertical slice) — one verb is validated; the loop around it is not, so v1 is not yet what the document earns. |
| **Live at end of the round** | At minimum, the full mine → sell → spend loop playable solo; ideally with the shared market and one return hook working too. |

---

## 1. Player Promise

**One-line promise**

> You are a stranger turned miner in a gold-rush town, mining and selling to get rich while every sale drops the price you see.

**Why this game**

I want players to see themselves in this. We all chase shiny things, but real happiness was never in the stuff itself — the gold rush is a mirror for that chase, not just a theme.

---

## 2. First Minutes & How to Play

| Time | Player experience |
|---|---|
| **0–5 seconds after control** | You spawn at the town's edge. The mayor is right there, holding out a free pick. Past him, rocks glow magenta in the public quarry. |
| **5–10 seconds** | You take the pick and walk to a rock. In range, you start swinging on your own; a progress bar over the rock fills with each hit. |
| **10–60 seconds** | The bar fills — one ore, the rock vanishes for you, and the next one is marked elsewhere in the quarry. If another player is on the same rock, you both mine faster while you share it. |
| **1–3 minutes** | You carry your ore to the bank at the town center and sell. The town's price ticks down a notch, visible to everyone — your first coins. |
| **3–10 minutes** | First real choice: upgrade your pick at the mayor, or hold coins toward a claim of your own — a sign at its gate shows the price, and that it comes with a M.U.L.E. that mines while you're away. |
| **Natural stopping point** | You log off with a fueled M.U.L.E. filling your warehouse, or looking at your coins against the claim's price — tomorrow's reason to return already on screen. |

**Player-facing How to Play**

- Walk up to a rock to mine it.
- Sell ore at the bank for coins.
- Every sale drops the price for everyone.

---

## 3. Core Loop

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | **Mine** | Walk up to a rock → you swing automatically, hit by hit, filling your own progress bar on it (12/9/6 hits per ore by pick tier) → one ore lands in your warehouse, the rock vanishes for you and the next one is assigned; your pick wears a little | A better pick needs fewer hits; sharing a rock with another player pays the boom-town bonus |
| 2 | **Sell** | Tap at the bank when you judge the price is right → the town price ticks down where everyone can see it → your raw ore becomes coins | Ore buys nothing. Coins are the only legal tender, and the bank is the only way across |
| 3 — slower rhythm | **Spend** | Upgrade the one object in front of you — pick at the mayor, M.U.L.E. and fuel at your claim, warehouse at its building, house at its lot → fewer hits per ore, more idle yield, more storage, or a bigger house on the street | Every system is one object climbing tiers at a doubling cost; a claim (which plants a M.U.L.E.) is what makes idle production possible at all |

**The toy test (`H1-01`, `H1-04`) — superseded 2026-09-17.** Both survived, but they tested a timing tap that no longer exists. Mining is now auto-swing on proximity with a per-player progress bar on a shared rock (`balance.md` §2). Owner call: no new toy test — the mechanic is built directly and judged in the loop playtest.

| | |
|---|---|
| **One complete loop takes** | TBD: tune once the full loop (selling and spending, not just the tap) is built and playtested — the owner's own call, not yet known |
| **Decision, challenge, or expression** | [agent-decided · accepted] When to sell, under pressure from tool wear and a filling warehouse. The pick loses yield with use, so ore arrives slower the longer a player stalls; the warehouse caps what can pile up. The rate worsens 1% per 500 ore sold, by anyone (at most +20%, a whale-sized move: 12 ore per coin, from a base of 10) and recovers 1% per hour — across sessions, not within one — so waiting is a real bet, but not free. Wear comes from use only — no pick expires with time — and tier 0 is always free from the mayor. Wear rate: TBD. |
| **Shortest satisfying visit / typical session** | 5 minutes / 5–15 minutes — the owner's own estimate |
| **Why repetition 10 differs from repetition 1** | Other players are the variety — but the shared price alone cannot carry this at Decentraland's real concurrency (H1-02, `failed`: most scenes are empty most of the time, so most returns cannot show a stranger's touch, no matter how the price recovers). [agent-decided · accepted] The bank keeps a short log of who sold and when, visible even after the price itself has recovered — so a player still finds evidence someone else was in town, whether or not anyone is online right now. [HYPOTHESIS] (H1-03) This trace reads as "someone else was here" without being explained. |

**Pillars**

1. [agent-decided · accepted] **The market belongs to the town, not the player.** The bank's ore price is shared and moves with every sale, and a short log of who sold and when keeps that visible even at a quiet hour with nobody else around (H1-02 `failed`: the price alone doesn't carry this at Decentraland's real concurrency; the log is the fix). Remove either half and selling becomes a private number instead of a shared event.
2. [agent-decided · accepted] **Selling is the default; patience is a small bet, never the winning play.** Tool wear means ore keeps arriving slower the longer a player waits, so holding for a better price always costs something. Remove it and the smart move becomes "wait for the peak," and the market stops feeling alive.

---

## 4. Why Players Come Back

### 4.1 The next-day (D1) sentence

> [agent-decided · accepted] A player who enjoyed their first session returns the next day (D1) because their M.U.L.E. has burned its day of fuel and stopped — coming back means refueling it, and selling the haul before the warehouse fills (~2 days at tier 1) and pauses it for good.

### 4.2 The progression chain

[agent-decided · accepted]

| Moment | What persists or has been built? | What becomes possible next? | How can another player tell? |
|---|---|---|---|
| **End of first session** | Coins, ore in the warehouse, a claim at the quarry (if rented) with its tier-1 M.U.L.E. and a name-flag, the pick's tier and wear | Renting a claim if not yet done; a first pick upgrade | The name-flag on a claimed dig, visible to anyone walking past the quarry |
| **End of first week** | A higher pick, M.U.L.E. or warehouse tier; several entries under the player's name in the bank's public sale log | The next tier of any of the three; enough saved toward a lot on the street | The gear itself looks different (a visibly better pick/M.U.L.E. model), and the player's name is now a recognizable regular in the sale log |
| **Week 3+ — what takes more than two weeks?** | [agent-decided · accepted] A house in town, Lot → Ranchito → Mansión, on a permanent lot the player chose — closer to the center costs more | Lot ~2 days of play, Ranchito ~4, Mansión ~8 (first pass, `balance.md` §5) | Walking down the one street, you can see whose house is biggest — no board, no number, just the skyline |

*End of first week, as a scene:* You walk back into town after a week away. Out at your claim, the M.U.L.E. is now the higher-tier model last week's sales paid for, and the upgraded warehouse holds what the first one never could. Back on the main street, your name shows up half a dozen times in the bank's sale log since you started, and one neighbor's plot now has a real house standing on it instead of an empty lot. Someone else's name is in the log too, more recent than yours — the price had already moved before you got here.

**Currency note:** coins are earned only by selling ore and spent on tier upgrades, fuel and house lots — there is no way to buy ore, so there is no buy-low-sell-high loop to abuse. Multi-claiming is braked by fuel: it is bought at each M.U.L.E. and burns faster at higher tiers, so extra claims are never free to run. [OPEN: whether that is enough against alt accounts]

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1. Appointment timer** — the M.U.L.E. fills the warehouse, then pauses | Fuel runs out after 24h; a tier-1 warehouse (500) fills in ~50h at 10 ore/h (*first pass*, `balance.md` §3–4) | A M.U.L.E. to refuel, and a filling warehouse to sell before it stops production | None relied on — the cap itself is the memory hook ("it'll be full by tonight"); an Event/Community post can remind, never assumed |
| **2. Persistent building progression** — the next visible tier of your pick, M.U.L.E., warehouse or house | Whenever enough is saved for the next tier — no clock, the player's own bank balance is the trigger | Not a bigger number on a private screen: a real, permanent change to the shared world that stays exactly as built, and that others can see | None needed — the current, unfinished state of your own house or M.U.L.E. is the memory itself, the same way an unfinished collection nags at you |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | [agent-decided · accepted] Player A is mining a rock in the quarry → Player B walks to the same rock (each has their own progress bar on it) → each completed bar pays its base 5 ore plus 1 per other player active on that rock (the "boom town" bonus: 2 players → 6 each, 3 → 7, 4 → 8) → the boost drops the moment either leaves or finishes their bar → a reason to look for company again next visit. |
| **The disappearance test** | [agent-decided · accepted] The boom-town bonus disappears — every rock pays only its pick's base rate, and the shared price only moves when the one remaining player sells. What stays: the name-flags on rented claims, the houses standing on the main street, and every line already written into the bank's sale log — a town that still looks lived-in with nobody left to prove it. |
| **From strangers to a group** | [agent-decided · accepted] Everyone does the same verb, so there is no role to explain: seeing another player swinging at a rock already says "people mine here." Walking to their rock is the entire join action — an explicit social choice, not a coincidence of position — the boom-town bonus confirms it worked. |
| **Recognition & continuity** | [agent-decided · accepted] A name stops being an anonymous avatar the first time it shows up in the bank's sale log or on a name-flag at a claim. Over time, a name that appears often in the log starts to mean something ("that's the one who sells big and moves the price") — and a growing house on the main street is memory nobody has to look up. |
| **Quiet hours & player counts** | [agent-decided · accepted] When few people are online, a solo player can do everything — mine, sell, buy, rent a claim, build toward a house. Social play becomes viable at **2** players (the boom-town bonus already applies); the ideal group is **3–4** (cap on the bonus still open); the v1 tested maximum is **20** (the program's own performance reference). A solo arrival meets someone else by design because the quarry rocks' magenta glow and any nearby avatar are the only two things in view — there is nowhere else to look. |
| **Drop-in / drop-out** | [agent-decided · accepted] Joining is walking to someone's rock — no role, no queue, contributes to the bonus immediately. Leaving costs the group only that one player's share of the bonus; nobody is mid-anything that breaks. |
| **Visible play (the bystander test)** | [agent-decided · accepted] Watching someone swing at a rock until it vanishes and then walk to the bank to sell — the price ticking down for everyone to see — tells the whole game in ten seconds, without the watcher touching anything. |
| **Shareable play (the memorable moment)** | [agent-decided · accepted] Walking down the main street and seeing, next to your own shack, another player's mansion — the gap between the two, visible at a glance, no number involved. |
| **Bring-a-friend** | [agent-decided · accepted] The boom-town bonus is the reason on its own: "come mine with me, we both get more." No extra system needed to make inviting someone worth it. |

---

## 6. Mobile-First

[agent-decided · accepted]

**Every core-loop verb on touch**

| Core-loop verb | How it works with touch controls |
|---|---|
| Mine | Walk up to a rock with the joystick — swinging is automatic in range. No tapping, no aiming, no hold-and-drag. |
| Sell | Approach the bank and tap a large "sell" button — no aiming required. |
| Spend | Walk to the object (mayor, claim, warehouse, lot) and tap one large upgrade/buy button — same pattern as selling. |

The loop turned out touch-first by accident: no verb depends on precision aiming, hover states or keyboard combos.

**UI plan.** Only the coin and ore counts sit on screen, small and out of the thumb's way; a rock's progress bar shows only while mining it, buy/sell prompts only at their location, and a read-only status panel (current tier of pick, M.U.L.E., warehouse, house) opens only when the player asks — never a permanent overlay.

**Performance.** Target: 60 fps on recommended desktop hardware, 30 fps on a Moto G41 (the named floor device — the more modest of the owner's two test phones; a Moto G75 is the second, better-supported device), both at the v1 tested maximum of 20 players (§5). Biggest named risk: at up to 20 players, each with their own visible house and M.U.L.E., total on-screen geometry is the most likely thing to hurt frame rate first. Plan: houses and M.U.L.E.s stay low-poly primitives carrying the magenta-highlight treatment already decided for §7 — the same choice that already covers the solo-art-risk fallback in §9 also caps this cost.

**Desktop-only dependencies.** Checked against the platform's mobile feature-gap tracker (docs.decentraland.org, reviewed 2026-08): none of what this design uses — `AudioSource` one-shot playback, React-ECS UI, pointer events — appears on the missing-features list. The one real gap on the tracker, the `AudioEvent` component (audio-state callbacks), is not something this design needs.

---

## 7. World, Look & Story

**Story / world**

[agent-decided · accepted] A couple of blocks of a gold-rush town hemmed in by mountains, one street running from the bank to the quarry cut into the foothills where everyone actually digs. Someone new always shows up with the same free pick, so the town never really empties out.

**Visual direction**

[agent-decided] Every interactable — the rocks, the bank counter, the M.U.L.E., the lot signs — carries a magenta emissive outline, a color nothing else in the dusty wood-and-dirt palette ever uses. Legible at arm's length on a phone screen, no ambiguity about what can be touched. Navigation needs no map: one street, nothing to get lost in. A couple of storefronts sit boarded up with a hand-painted "coming soon" sign — future spend sinks (a saloon, a cabaret) the town is saving room for, without building them yet.

**Visual signature**: the ore vein's magenta glow against sun-bleached wood — one color the whole town otherwise refuses to use.

---

## 8. Audience & Comparables

**Primary player + arrival context**

> [agent-decided · accepted] For players who already enjoy idle/incremental tap games, arriving mostly alone from Decentraland's Discover feed or a friend's invite, looking for a reason to check back in on their own progress every day.

**How the first group arrives**

[agent-decided · accepted] A first cohort most plausibly comes from Decentraland's Discover feed and idle-game-adjacent Communities, since the promise reads clearly to that audience without needing an event. Reaching the social threshold only needs two people online at once, which modest, steady traffic already clears — no launch-event spike required.

**Deliberately not for**

[agent-decided · accepted] Players looking for twitch combat or reflex-based challenge — the tension here is economic and social, not physical skill. A long session is perfectly welcome; it just will not feel like an action game.

### Comparables *— exactly two*

| | Comparable A — outside Decentraland | Comparable B — outside Decentraland |
|---|---|---|
| What we observed works | *Tap Space* (mobile, tap-to-fight-and-upgrade): tapping generates a resource, spent on upgrades that make the next stretch of tapping pay more — the same mine-then-spend rhythm as Claim Bite's loop | *Old School RuneScape*: the Grand Exchange — item prices move from real aggregate player buying and selling, visible to everyone, so timing a trade is a genuine decision |
| What does not fit our audience or context — and why | Entirely single-player: nothing another player does ever touches your run, and there is no moment where timing a decision against anyone else matters | A massive, decades-deep MMORPG — combat, quests, skill trees far beyond what a small idle/economy experience needs or wants |
| What we will do differently | Make the price shared and player-moved, and put a real cost on waiting (tool wear) — so selling now vs. later is an actual decision, not a formality | Keep the market tension, strip everything else — no combat, no quests, no skill trees, so the same tension is accessible in minutes instead of after hours of onboarding |

---

## 9. 4 Week Plan (v1 scope)

[agent-decided · accepted]

| Week | What's playable |
|---|---|
| **1** | The loop alone: mine (auto-swing, per-player rock progress), sell (dynamic bank rate), upgrade the pick at the mayor. Greybox town and quarry. The mayor hands over the free tier-0 pick. |
| **2** *(program milestone)* | Multiplayer: the shared price and the bank's sale-log trace sync between players; the boom-town bonus. Playtest at the social threshold (2 players). |
| **3** | Claims that plant a tier-1 M.U.L.E., fuel at the claim, the shared warehouse and its tiers; house lots on the street; the status panel. |
| **4** *(program milestone)* | Polish: the magenta highlight system applied everywhere; baseline touch controls; first mobile pass; bug fixing. |

**What keeps the experience changing after launch**

[agent-decided · accepted]

- **Changes without a new build:** the market price and the visible wealth skyline shift constantly from player behavior alone — no scripted content required.
- **Survives a skipped update:** the same — the economy and the social comparison it drives generate their own freshness independent of any dev-authored patch.
- **Persists across resets, and newcomer path:** nothing resets by design — accumulation is meant to last, that is the point. A newcomer still matters immediately in the quarry, where the boom-town bonus pays out regardless of anyone's accumulated wealth.
- **A player behaviour that would change what gets built next:** if players stop selling and just hoard ore, the sell-pressure design (tool wear, warehouse cap) isn't doing its job, and those dials need revisiting.

**Three cuts, in the order they'd go:**

1. House visual tiers — ship one cabin model instead of the full progression to mansion. Hurts (it's the status symbol), but saves the most modeling time.
2. The boarded-up "coming soon" storefronts — pure atmosphere, no mechanic. Cheapest cut available.
3. Boom-town bonus VFX — a plain numeric indicator instead of custom particles.

The twist (the shared price and its trace) is never on this list — everything else exists to make that land.

**If v1 hits its numbers, house visual tiers come back first in v2** — they carry the most weight toward the standing goal of a community that visibly owns its world.

**Top risk and its fallback:** one person cannot finish code, art and UI to a polished quality in four weeks, solo. Three layers, in order: the magenta highlight system already makes interactivity read through color rather than model fidelity, so grey primitives hold up on their own if art falls behind; AI-assisted 3D generation (e.g. Tripo) can speed up asset creation without adding a person; and if it still is not enough, a modeling collaborator joins so the owner can stay on code, UI and sound.

---

**One last question:** Which section was hardest? Why Players Come Back.

