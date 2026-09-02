# H1-02 · Other players are the variety

- **IF/THEN:** IF the sale price falls with every player's sale and recovers over time, THEN a returning player finds a price that has visibly moved since their last sale, at realistic Decentraland concurrency.
- **Source section:** §3 Core Loop — "why repetition 10 differs from repetition 1"
- **Cheapest killing test:** arithmetic in the document — model the price curve against a plausible concurrent-player count and sale rate, before anything is built.
- **Key metric:** price change a player sees between two consecutive sales. Under 10% counts as failure — the market reads as static and the variability source is gone.
- **Mobile-sensitive:** no
- **Tested on:** arithmetic
- **Parked:** 2026-08-31

## Brief

- **Criterion (external):** across a player's return visits, the price at arrival shows displacement caused by *another* player's sale (not fully recovered, not the returning player's own doing) in at least half of them. Failure looks like: in most return visits, nothing distinguishes the price from a scene where the player was always alone.
- **Kill-check (owner-testable):** not applicable — this settles by direct calculation, not by feel.
- **Rung:** arithmetic in the document — no build.
- **Who tests:** the skill, on paper.
- **Who launches:** n/a.
- **Real:** the platform's own concurrency baseline, cited rather than assumed.
- **Faked:** n/a — nothing is built.
- **Instrumented:** the criterion is the arithmetic itself.
- **Not building:** nothing — this experiment never reaches a build if it can be killed here.
- **Sessions:** n/a — one calculation pass.
- **Task given to the tester:** n/a.
- **Collected per session:** the share of return visits where another player's touch would be visible, given Decentraland's real concurrency.
- **Briefed:** 2026-08-31

## Sessions

**Pass 1 — arithmetic, 2026-08-31.**

The platform's own calibration (`dcl-gdd/references/social-design.md`, `playbook.md` §5): *"the platform baseline is 0–3 concurrent players in a scene"* and *"most visits happen at a quiet hour with almost nobody else present — that is not the edge case to handle last, it is the common case."*

That single fact is enough to run the criterion without inventing a sale-rate model: if nobody else is in the scene for the *majority* of a scene's visits — the document's own words, not an assumption added here — then in that same majority of return visits, no other player's sale could have happened at all, regardless of how fast or slow the price recovers. A recovery mechanism (needed regardless, so a lone player is never stuck with a price they crashed themselves) only shortens the window in which a stranger's sale would still be visible — it cannot manufacture a stranger who was never there.

Two ways this could still pass despite the baseline, checked and ruled out:
- **A very slow recovery** (hours to days) would let a rare stranger's sale stay visible long enough to be caught by more returning players. But Claim Bite's own Pillar 2 already commits to tool wear punishing a *lone* player for holding ore too long; a price that also stays crashed for hours after the last sale — theirs or anyone's — punishes the same lone player twice, for something nobody else did. Ruled out.
- **A generous concurrency reading** (assume the top of the 0–3 band, 3 players, most of the time) would raise the odds — but the platform's own text specifically warns against reading the peak as typical ("that is not the edge case to handle last, it is the common case" about the *quiet* end of the band). Using the peak as the baseline is exactly the mistake the reviewer's own "4 a.m., 2 players" question exists to catch.

**Criterion:** failed — in the common case (per platform calibration), no other player is present to move the price at all, so the majority of return visits cannot show a stranger's touch, independent of the recovery rate chosen.

## Verdict

**Verdict:** failed — the criterion cannot hold at the platform's own baseline concurrency: nobody else is in the scene for most visits, so most returns cannot show another player's touch, regardless of recovery speed · 2026-08-31 · tested on: arithmetic

The mechanism itself (shared price, falls on sale, recovers over time) is not wrong — it is simply not *sufficient* on its own to deliver "other players are the variety" at Decentraland's real concurrency. It needs a companion signal that does not depend on someone else being online *right now*: an **async trace** — Claim Bite's own reference material names this exact fix as the standing alternative to live concurrency (`core-loop-and-ftue.md`: *"Other players — Enough concurrency, or async traces standing in"*). Concretely: the bank keeps a short, visible log of *who* sold last and when — a name and a timestamp, not just a number — so a returning player sees evidence that someone else was in this town even when the price itself has already recovered. This is a design change, not a bookkeeping one, so it is raised to the owner rather than silently written into §3 — see the conflict note in the handoff.
