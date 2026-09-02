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
| **Current status** | Core-mechanic prototype — the mining tap is built and owner-tested (`H1-01`, `H1-04`: `survived`). The rest of the loop (selling, the market, spending) is designed but not yet built. |
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
| **0–5 seconds after control** | You spawn at the town's edge. The mayor is right there, holding out a pick. Past him, a rock face glows with a vein in the public digging ground. |
| **5–10 seconds** | You take the pick. A green timing bar appears over the vein. One tap lands the swing — a spark, a chip of ore breaks free. |
| **10–60 seconds** | You chain a few more timed hits. Raw ore climbs on your HUD. Another player digging nearby swings too, if one is around. |
| **1–3 minutes** | You carry your ore to the bank at the town center and sell. The town's price ticks down a notch, visible to everyone — your first coins. |
| **3–10 minutes** | First real choice: patch your worn pick, or hold coins toward renting your own plot — a sign at its gate already shows the rent and what it buys. |
| **Natural stopping point** | You log off looking at your coins against the plot's rent, and the town price sitting a little higher than when you sold — tomorrow's gap already on screen. |

**Player-facing How to Play**

- Tap the timing bar to mine ore.
- Sell ore at the bank for coins.
- Every sale drops the price for everyone.

---

## 3. Core Loop

| # | Step (verb) | What the player does (Player input → what they see or hear → what changes) | Why do it again? |
|---|---|---|---|
| 1 | **Mine** | Tap in time with the moving green bar → the swing lands, sound and a chip of ore breaking loose → your raw ore stock rises, your pick wears a little | A well-timed hit pays more than a bad one |
| 2 | **Sell** | Tap at the bank when you judge the price is right → the town price ticks down where everyone can see it → your raw ore becomes coins | Ore buys nothing. Coins are the only legal tender, and the bank is the only way across |
| 3 — slower rhythm | **Spend** | Buy a pick or a shovel, or rent a mining claim out at the quarry to place an idle machine on → your next runs at the rock yield more, or ore now arrives while you are away | Better tools shorten the way back to the bank; a rented claim is what makes idle production possible at all |

**The toy test (`H1-01`, `H1-04` — both `survived`):** the timing-tap held up under an owner self-test even bare, with no score, no ore counter and no reward shown — a qualified pass at first ("not super fun but not bad either"). Adding a hit/miss sound and a bigger hit reaction ("juice") turned that into a clean, unhedged improvement ("se siente mejor, claramente"). The verb itself needed no redesign — only reinforcement it didn't have yet. Untested past this point: everything downstream — selling, the market, spending, and whether the *whole* loop holds together, which this pass never claimed to answer.

| | |
|---|---|
| **One complete loop takes** | TBD: tune once the full loop (selling and spending, not just the tap) is built and playtested — the owner's own call, not yet known |
| **Decision, challenge, or expression** | [agent-decided · accepted] When to sell, under pressure from tool wear. The pick loses yield with every swing rather than breaking outright, so ore keeps arriving slower the longer a player stalls — waiting for a better price is real, but it is not free. Ore is worth more while few players are selling, so holding pays — but only coins cover costs and a fresh pick, so holding has a price. On top of per-swing wear, the pick also expires after one real-world week regardless of use — a backstop so a rarely-played pick is never permanent, cheap to fix since a starting pick is a flat 10 coins. Wear rate and the exact week length: TBD: same plan — tune after the full loop is playtested. |
| **Shortest satisfying visit / typical session** | 5 minutes / 5–15 minutes — the owner's own estimate |
| **Why repetition 10 differs from repetition 1** | Other players are the variety — but the shared price alone cannot carry this at Decentraland's real concurrency (H1-02, `failed`: most scenes are empty most of the time, so most returns cannot show a stranger's touch, no matter how the price recovers). [agent-decided · accepted] The bank keeps a short log of who sold and when, visible even after the price itself has recovered — so a player still finds evidence someone else was in town, whether or not anyone is online right now. [HYPOTHESIS] (H1-03) This trace reads as "someone else was here" without being explained. |

**Pillars**

1. [agent-decided · accepted] **The market belongs to the town, not the player.** The bank's ore price is shared and moves with every sale, and a short log of who sold and when keeps that visible even at a quiet hour with nobody else around (H1-02 `failed`: the price alone doesn't carry this at Decentraland's real concurrency; the log is the fix). Remove either half and selling becomes a private number instead of a shared event.
2. [agent-decided · accepted] **Selling is the default; patience is a small bet, never the winning play.** Tool wear means ore keeps arriving slower the longer a player waits, so holding for a better price always costs something. Remove it and the smart move becomes "wait for the peak," and the market stops feeling alive.

---

## 4. Why Players Come Back

### 4.1 The next-day (D1) sentence

> [agent-decided · accepted] A player who enjoyed their first session returns the next day (D1) because their idle rig's ore storage has filled to its cap — coming back means claiming a full haul before any more piles up for nothing.

### 4.2 The progression chain

[agent-decided · accepted]

| Moment | What persists or has been built? | What becomes possible next? | How can another player tell? |
|---|---|---|---|
| **End of first session** | Coins in the bank, a mining claim at the quarry (if rented) with a name-flag staked on it, the pick's current wear | Renting a claim if not yet done; a first tool upgrade | The name-flag on a claimed dig, visible to anyone walking past the quarry |
| **End of first week** | An upgraded pick or rig tier at the claim; several entries under the player's name in the bank's public sale log | Affording the idle rig, or its next tier; enough saved toward a first house in town | The gear itself looks different (a visibly better pick/rig model), and the player's name is now a recognizable regular in the sale log |
| **Week 3+ — what takes more than two weeks?** | [agent-decided · accepted] A house in town, upgradable toward a mansion — the wealth marker lives in town, not at the noisy claim out at the quarry | TBD: house/tool tier pricing, tuned once the full loop is built and playtested | Walking down the one street, you can see whose house is biggest — no board, no number, just the skyline |

*End of first week, as a scene:* You walk back into town after a week away. Out at your claim, the rig has already filled past what it could hold on day one — its case now the polished, higher-tier model last week's sales paid for. Back on the main street, your name shows up half a dozen times in the bank's sale log since you started, and one neighbor's plot now has a real house standing on it instead of an empty lot. Someone else's name is in the log too, more recent than yours — the price had already moved before you got here.

**Currency note:** coins are earned only by selling ore and spent on tools, rent and machines — there is no way to buy ore, so there is no buy-low-sell-high loop to abuse. The rent's automatic deduction is the one place real money-adjacent risk lives: [OPEN: multi-accounting to rent several plots at once — worth a look once the rent price is set]

### 4.3 Two return hooks

| Selected hook | Exact trigger or timing | What the player anticipates | Reminder channel + no-reminder fallback |
|---|---|---|---|
| **1. Appointment timer** — idle rig fills to a cap | TBD: exact number of hours, tuned once the full loop is built and playtested | A full haul waiting to be claimed | None relied on — the cap itself is the memory hook ("it'll be full by tonight"); an Event/Community post can remind, never assumed |
| **2. Persistent building progression** — the next visible tier of your claim, rig or house | Whenever enough is saved for the next tier — no clock, the player's own bank balance is the trigger | Not a bigger number on a private screen: a real, permanent change to the shared world that stays exactly as built, and that others can see | None needed — the current, unfinished state of your own house or rig is the memory itself, the same way an unfinished collection nags at you |

---

## 5. Social by Design

| | |
|---|---|
| **The repeatable social loop** | [agent-decided · accepted] Player A starts mining in the public dig at the quarry → Player B joins nearby, drawn by the same free ground → both mine at a boosted rate while together (the "boom town" bonus, roughly +10% per other miner present, capped around +20%) → the boost fades the moment either leaves → a reason to look for company again next visit. |
| **The disappearance test** | [agent-decided · accepted] The boom-town bonus disappears — the public dig reverts to its base, lower yield, and the shared price only moves when the one remaining player sells. What stays: the name-flags on rented claims, the houses standing on the main street, and every line already written into the bank's sale log — a town that still looks lived-in with nobody left to prove it. |
| **From strangers to a group** | [agent-decided · accepted] Everyone does the same verb, so there is no role to explain: seeing another player's magenta glow at the dig already says "people mine here." Standing near them and mining is the entire join action — the boom-town bonus confirms it worked. |
| **Recognition & continuity** | [agent-decided · accepted] A name stops being an anonymous avatar the first time it shows up in the bank's sale log or on a name-flag at a claim. Over time, a name that appears often in the log starts to mean something ("that's the one who sells big and moves the price") — and a growing house on the main street is memory nobody has to look up. |
| **Quiet hours & player counts** | [agent-decided · accepted] When few people are online, a solo player can do everything — mine, sell, buy, rent a claim, build toward a house. Social play becomes viable at **2** players (the boom-town bonus already applies); the ideal group is **3–4** (where the bonus caps); the v1 tested maximum is **20** (the program's own performance reference). A solo arrival meets someone else by design because the dig's magenta glow and any nearby avatar are the only two things in view — there is nowhere else to look. |
| **Drop-in / drop-out** | [agent-decided · accepted] Joining is standing at the dig and mining — no role, no queue, contributes to the bonus immediately. Leaving costs the group only that one player's share of the bonus; nobody is mid-anything that breaks. |
| **Visible play (the bystander test)** | [agent-decided · accepted] Watching someone tap the timing bar and then walk to the bank to sell — the price ticking down for everyone to see — tells the whole game in ten seconds, without the watcher touching anything. |
| **Shareable play (the memorable moment)** | [agent-decided · accepted] Walking down the main street and seeing, next to your own shack, another player's mansion — the gap between the two, visible at a glance, no number involved. |
| **Bring-a-friend** | [agent-decided · accepted] The boom-town bonus is the reason on its own: "come mine with me, we both get more." No extra system needed to make inviting someone worth it. |

---

## 6. Mobile-First

[agent-decided · accepted]

**Every core-loop verb on touch**

| Core-loop verb | How it works with touch controls |
|---|---|
| Mine | Tap the timing bar — the exact same input as a mouse click, tested this way already (`H1-01`, `H1-04`). Confirmed on a real phone via the Creator Hub QR pass: "identical experience to PC." No precision aiming, no hold-and-drag. |
| Sell | Approach the bank and tap a large "sell" button — no aiming required. |
| Spend | Choose from a buy menu of large tap targets — same pattern as selling. |

The loop turned out touch-first by accident: no verb depends on precision aiming, hover states or keyboard combos.

**UI plan.** Only the coin and ore counts sit on screen, small and out of the thumb's way; the timing bar and the buy/sell menus appear only while actually mining, selling or spending, never as a permanent overlay.

**Performance.** Target: 60 fps on recommended desktop hardware, 30 fps on a Moto G41 (the named floor device — the more modest of the owner's two test phones; a Moto G75 is the second, better-supported device), both at the v1 tested maximum of 20 players (§5). Biggest named risk: at up to 20 players, each with their own visible house and idle rig, total on-screen geometry is the most likely thing to hurt frame rate first. Plan: houses and rigs stay low-poly primitives carrying the magenta-highlight treatment already decided for §7 — the same choice that already covers the solo-art-risk fallback in §9 also caps this cost.

**Desktop-only dependencies.** Checked against the platform's mobile feature-gap tracker (docs.decentraland.org, reviewed 2026-08): none of what this design uses — `AudioSource` one-shot playback, React-ECS UI, pointer events — appears on the missing-features list. The one real gap on the tracker, the `AudioEvent` component (audio-state callbacks), is not something this design needs.

---

## 7. World, Look & Story

**Story / world**

[agent-decided · accepted] A couple of blocks of a gold-rush town hemmed in by mountains, one street running from the bank to the quarry cut into the foothills where everyone actually digs. Someone new always shows up with the same free pick, so the town never really empties out.

**Visual direction**

[agent-decided] Every interactable — the ore vein, the bank counter, the timing bar — carries a magenta emissive outline, a color nothing else in the dusty wood-and-dirt palette ever uses. Legible at arm's length on a phone screen, no ambiguity about what can be touched. Navigation needs no map: one street, nothing to get lost in. A couple of storefronts sit boarded up with a hand-painted "coming soon" sign — future spend sinks (a saloon, a cabaret) the town is saving room for, without building them yet.

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
| **1** | The loop alone: mine (tap-timing), sell (dynamic bank price), buy tools at a fixed price. Greybox town and quarry. The mayor hands over the free starting pick. |
| **2** *(program milestone)* | Multiplayer: the shared price and the bank's sale-log trace sync between players; the boom-town bonus. Playtest at the social threshold (2 players). |
| **3** | Renting a claim at the quarry with automatic rent deduction; the idle rig with its cap and claim action; the first purchasable house in town. |
| **4** *(program milestone)* | Polish: the magenta highlight system applied everywhere; baseline touch controls; first mobile pass; bug fixing. |

**What keeps the experience changing after launch**

[agent-decided · accepted]

- **Changes without a new build:** the market price and the visible wealth skyline shift constantly from player behavior alone — no scripted content required.
- **Survives a skipped update:** the same — the economy and the social comparison it drives generate their own freshness independent of any dev-authored patch.
- **Persists across resets, and newcomer path:** nothing resets by design — accumulation is meant to last, that is the point. A newcomer still matters immediately at the public dig, where the boom-town bonus pays out regardless of anyone's accumulated wealth.
- **A player behaviour that would change what gets built next:** if players stop selling and just hoard ore, the sell-pressure design (tool wear) isn't doing its job, and the wear rate needs revisiting.

**Three cuts, in the order they'd go:**

1. House visual tiers — ship one cabin model instead of the full progression to mansion. Hurts (it's the status symbol), but saves the most modeling time.
2. The boarded-up "coming soon" storefronts — pure atmosphere, no mechanic. Cheapest cut available.
3. Boom-town bonus VFX — a plain numeric indicator instead of custom particles.

The twist (the shared price and its trace) is never on this list — everything else exists to make that land.

**If v1 hits its numbers, house visual tiers come back first in v2** — they carry the most weight toward the standing goal of a community that visibly owns its world.

**Top risk and its fallback:** one person cannot finish code, art and UI to a polished quality in four weeks, solo. Three layers, in order: the magenta highlight system already makes interactivity read through color rather than model fidelity, so grey primitives hold up on their own if art falls behind; AI-assisted 3D generation (e.g. Tripo) can speed up asset creation without adding a person; and if it still is not enough, a modeling collaborator joins so the owner can stay on code, UI and sound.

---

**One last question:** Which section was hardest? Why Players Come Back.

