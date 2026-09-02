# H1-04 · Sound and juice lift the tap from "fine" to fun

- **IF/THEN:** IF a hit sound and a juicier hit reaction (bigger flash, a spark/particle, a small screen-shake or squash) are added to the same timing-tap, THEN the owner rates it noticeably better than the plain version tested in H1-01 ("not super fun but not bad either").
- **Source section:** §3 Core Loop — step 1 "Mine" (H1-01's `survived` follow-up)
- **Cheapest killing test:** same desktop Explorer greybox, add sound + a juicier hit reaction, owner self-test — a second pass on the same build, ~10-15 min to add + test.
- **Key metric:** owner's own before/after comparison — does it read as a real improvement, unprompted. No improvement noticed counts as failure (would mean the flatness is not a juice problem).
- **Mobile-sensitive:** yes — sound and screen-shake read differently on a phone
- **Tested on:** desktop, mobile
- **Parked:** 2026-09-01

## Brief

- **Criterion (external):** not measured at v0 — a feel claim, judged by the owner's own before/after comparison.
- **Kill-check (owner-testable):** the owner notices an unprompted, real improvement over the plain H1-01 pass. No noticed improvement counts as failure — it would mean the flatness was never a juice problem.
- **Rung:** desktop Explorer — same build as H1-01, same rung.
- **Who tests:** the creator, by hand.
- **Who launches:** the creator, from `D:\repos\dcl\claim-bite`.
- **Real:** the same tap-timing input as H1-01, now with `assets/sounds/match.mp3` on hit, `assets/sounds/fail.mp3` on miss, and a brief size-pulse + brighter flash on hit.
- **Faked:** everything H1-01 faked, unchanged — no ore counter, no HUD, no economy.
- **Instrumented:** the same console swing log, tagged `[H1-04]` to separate this pass from H1-01's.
- **Not building:** anything about ore, selling or spending — still out of scope, same as H1-01.
- **Sessions:** the owner alone, one pass, comparing by memory against the H1-01 pass.
- **Task given to the tester:** "Same bar as before — now with sound and a bigger hit reaction. Play it and tell me if it feels different."
- **Collected per session:** whether the owner notices a real difference, and what they'd still change.
- **Briefed:** 2026-09-01

## Sessions

**Pass 1 — owner self-test, desktop Explorer client, 2026-09-01.** Same build as H1-01, plus a hit sound (`match.mp3`), a miss sound (`fail.mp3`), and a brief size-pulse + brighter green flash on hit. Owner's report, close to verbatim: "se siente mejor, claramente" (feels better, clearly) — a clean, unambiguous improvement over the H1-01 pass, with no hedging this time. The owner also noted, unprompted, that this tap is one piece of the gold-gathering mechanic, not the whole game — a framing note, not a complaint.

## Verdict

**Verdict:** survived — kill-check held: the owner noticed a clear, unprompted improvement over the plain H1-01 version ("se siente mejor, claramente") · criterion not measured · 2026-09-01 · tested on: desktop, mobile

The flatness in H1-01 was, in fact, a juice problem — sound and a bigger hit reaction fixed it cleanly. This closes the toy-test line of questioning for the mining tap: the verb itself is fine, and now reads as good with minimal reinforcement. What is still untested is everything downstream of the tap — the full mine → sell → spend loop, the market, the social layer — none of which this pass touched.

**Mobile QR pass, 2026-09-02:** owner tested via the Creator Hub QR link on a real phone. Report: "experiencia idéntica a PC" (identical experience to PC) — no mobile-specific issue found for this verb.
