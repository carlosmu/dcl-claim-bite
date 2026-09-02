# H1-01 · The mining tap is fun on its own

- **IF/THEN:** IF the mining tap is a timing hit on a moving green bar, THEN a player keeps tapping for 10 consecutive swings with no score, no goal and no reward shown on screen.
- **Source section:** §3 Core Loop — step 1 "Mine", and the toy test behind the whole loop
- **Cheapest killing test:** greybox in desktop Explorer via Creator Hub — one bar, one tap, no economy. Owner self-test, ~5 min after a 15-30 min build.
- **Key metric:** consecutive voluntary swings with nothing attached. Fewer than 10 counts as failure.
- **Mobile-sensitive:** yes
- **Tested on:** desktop
- **Parked:** 2026-08-31

## Brief

- **Criterion (external):** not measured at v0 — a feel claim, judged by the owner. Stays `[HYPOTHESIS]` in the source section regardless of outcome.
- **Kill-check (owner-testable):** the owner keeps tapping the bar for 10 swings in a row with no score, no ore counter, no sound reward — nothing but the swing itself. If it stops feeling worth doing before swing 10, the kill-check fails.
- **Rung:** desktop Explorer via Creator Hub — settles feel and input response; nothing here needs mobile or another player yet.
- **Who tests:** the creator, by hand — this is a feel claim, so a mechanical smoke pass alone can never answer it. A quick agent dry-run first, just to confirm the scene loads and the bar responds, before handing it over.
- **Who launches:** the creator, from the existing (empty) scene project at `D:\repos\dcl\claim-bite` — paused at Build (phase 2) at the owner's request, to save tokens; resume here.
- **Real:** the tap-timing input itself — the moving bar, the timing window, the swing animation, the hit/miss feedback (sound + a visual spark or a dull thud).
- **Faked:** everything else — no ore counter, no HUD, no bank, no economy, no mayor, no plot, one rock, no persistence between sessions.
- **Instrumented:** a swing counter printed to the debug console (not shown on screen — the owner should not be watching a number while judging the feel) so the pass can be reconstructed afterward.
- **Not building:** the ore yield, the wear mechanic, anything about selling or spending — those all assume the tap is fun, which is exactly what is not known yet.
- **Sessions:** the owner alone, one pass first, more only if the first is ambiguous.
- **Task given to the tester:** "Tap the bar whenever it feels right. Keep going as long as you want to."
- **Collected per session:** how many swings before the owner stops voluntarily, and whether they say why.
- **Briefed:** 2026-08-31

## Sessions

**Pass 1 — owner self-test, desktop Explorer client, 2026-09-01.** Built as a 2D UI timing bar (not a 3D bar over a rock) — a needle sweeps back and forth like ping-pong, tap it while it crosses the centered sweet spot. Deviation from the Brief: no sound was built (no audio asset on hand for this pass) — feedback was a color flash only (green on hit, dark red on miss). No score, counter or reward was shown, as briefed.

Owner's report, close to verbatim: the bar loads and responds correctly; landing the tap at the right moment "felt good"; overall "not super fun but not bad either" — reads as workable "as a first precision mechanic"; the *absence* of feedback (no sound, no points, no reward) was itself noticeable while playing. The owner kept engaging with it through the session rather than abandoning it early, and did not report it stopping being worth doing.

## Verdict

**Verdict:** survived — kill-check held: the timing-hit itself felt good enough to keep doing with nothing attached, though weakly ("not super fun but not bad either") · criterion not measured · 2026-09-01 · tested on: desktop

This is a qualified survival, not a clean win, and it should not be read as one. The owner's own diagnosis points at a specific, cheap next step rather than at the verb being wrong: the raw timing-hit has real merit, but reads as thin without sound or a juicier hit reaction. That is a different, cheaper hypothesis than this one — see `H1-04`, parked at handoff.
