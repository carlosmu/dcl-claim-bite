# Hypothesis Log — Claim Bite

*Generated index. Never hand-edited — rename the experiment file and regenerate. Not part of the
GDD, not an application requirement.*

Sorted by cheapest killing test: arithmetic → desktop Explorer → mobile.

| ID | IF/THEN | Source section | Cheapest killing test | Status | Verdict / date | Tested on |
|---|---|---|---|---|---|---|
| H1-02 | IF the sale price falls with every player's sale and recovers over time, THEN a returning player finds a price that has visibly moved since their last sale, at realistic Decentraland concurrency | §3 Core Loop — repetition 10 | Arithmetic in the document | `failed` | failed — fails at platform baseline concurrency, independent of recovery rate · 2026-08-31 | arithmetic |
| H1-01 | IF the mining tap is a timing hit on a moving green bar, THEN a player keeps tapping for 10 consecutive swings with no score, no goal and no reward shown | §3 Core Loop — step 1 "Mine" | Greybox in desktop Explorer, owner self-test | `survived` | survived — kill-check held (weakly): timing-hit felt good enough with nothing attached · 2026-09-01 | desktop |
| H1-04 | IF a hit sound and a juicier hit reaction are added, THEN the owner rates the tap noticeably better than H1-01's plain version | §3 Core Loop — step 1 "Mine" (H1-01 follow-up) | Same desktop greybox, second pass | `survived` | survived — clear, unhedged improvement ("se siente mejor, claramente"); mobile QR pass confirms identical feel · 2026-09-02 | desktop, mobile |
| H1-03 | IF the bank shows a short log of who sold and when, THEN a player at zero concurrency still recognizes, unprompted, that another player was recently in town | §3 Core Loop — repetition 10 (H1-02's fix) | Greybox in desktop Explorer, owner self-test | `parked` | — | — |
| H2-01 | IF the idle rig's ore storage fills to a cap and stops, THEN a player returns the next day to claim it with no external reminder | §4 Why Players Come Back — D1 sentence | Greybox in desktop Explorer, owner self-test (fast-forwarded cap) | `parked` | — | — |
| H2-02 | IF the public dig gives everyone there a yield bonus scaled to nearby miners, THEN two people mining side by side notice it feels better than mining alone | §5 Social by Design — repeatable social loop | Desktop Explorer, two accounts | `parked` | — | — |
| H2-03 | IF a player's claim, rig and house carry a persistent, ever-visible next tier to build toward, THEN returning players name "building" as their own reason to come back, not just currency | §4.3 Why Players Come Back — hook 2 | Live World, real returning players over weeks — no cheap rung exists | `parked` | — | — |

Regenerated 2026-09-02 · 4 parked, 0 active, 3 closed (0 validated, 2 survived, 1 failed).
