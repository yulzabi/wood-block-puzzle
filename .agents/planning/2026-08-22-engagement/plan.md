# Wood Block Puzzle — Engagement Psychology & Progression Plan

> A PM/design plan for player psychology, difficulty/flow, and Levels-mode progression,
> synthesized from deep desk research on the casual block-placement genre (Woodoku /
> Block Blast / 1010! / Wordle) and filtered to what fits THIS game.
>
> **Status: PROPOSED — plan only, nothing implemented.** Sequenced to start *after* the
> in-flight technical work (perf tiers + P7 streak). Several items are **designer-owned**
> and are the natural first brief for the planned UX/UI design pass.
>
> **Hard constraints (define this plan):** NO ads, NO monetization (no IAP/currency/gacha),
> NO backend, NO push, NO accounts. Fully-offline single-player PWA. Every lever below works
> client-side and local-only. Existing systems assumed: Endless mode, Levels mode with a
> winding map + procedurally-generated levels, colored-gem objectives (clear N gems/color,
> gems arrive on pieces), streak/combo multiplier (P7 in flight), local high-score + stats,
> particles/sound/haptics, skippable 3-step intro.

---

## 1. Strategy in one line

The reward economy is **100% intrinsic**. Per Self-Determination Theory that's *purer*
engagement, not weaker — so the whole plan leans on **flow (optimal challenge), competence
& autonomy signals, and closing unfinished loops (Zeigarnik)**, all achievable offline.
Juice amplifies; honesty/fairness is the foundation.

## 2. Principles ranked by relevance to THIS game

1. **Flow / optimal challenge** (Csikszentmihalyi; Wordle's "win in 4–5 of 6" sweet spot) —
   the experience lives or dies on the difficulty curve.
2. **Competence & Autonomy (SDT — Ryan, Rigby & Przybylski 2006)** — your only reward
   economy; intrinsic satisfaction from getting visibly better + free choice each move.
3. **Juice / high-frequency micro-reward** — cheapest reliable retention; already partly built.
4. **Zeigarnik (unfinished loops stay active)** — powers the map, daily streak, achievements.
5. **Variable-ratio *delight* (Skinner)** — ONLY for in-the-moment surprise (lucky cascades),
   NEVER gated rewards. Keep mild — no incentive to weaponize it here.
6. **Near-miss (Clark et al.) — honest, high-control** — end-of-run "so close" moments.
7. **Loss aversion (Kahneman & Tversky) — gentle** — streak/high-score retry pull; must never
   cross into cross-session anxiety.

## 3. Difficulty & flow (the core)

- **Don't build complex adaptive AI.** MDPI 2024: no single DDA method reliably beats a
  well-tuned static curve; what matters is matching challenge to skill (Flow Theory). A tuned
  static curve + a couple of light, honest nudges is state-of-the-art-competitive and cheap.
- **Difficulty is dialed by piece geometry, not cheating.** Easy = more small/flexible pieces
  (singles, dominoes, 2×2). Hard = more large/awkward pieces (S/Z, long lines, big L) that
  constrain placement. This is the genre's real difficulty knob.
- **Legible failure is mandatory.** The bubble-shooter failure mode: skill games where players
  "don't know what they did wrong" cause rage-quits. A failed level must show a one-line reason
  (ran out of space / gems didn't arrive in time) and retry instantly, re-seeded.
- **Difficulty knobs, in leverage order:** piece-pool geometry > board fill % / gem count >
  color count > board shape.
- **Tuning targets:** early first-attempt win rate high (feel competent); boss/peak levels
  ~40–60% first-few-attempts (earned). Every failure = instant, free, no-wait retry.

## 4. Levels-mode progression model

A **saw-tooth on a gentle upward trend** — steady climb, periodic peaks, mandatory breathers.
Each level should be a mini emotional arc (Interest Curve; Karrs), not a flat grind: engineer a
late-level **combo "surge"** by arranging gems so clearing them *opens board space*.

| Band | Feel | Difficulty dial | New content |
| --- | --- | --- | --- |
| 1–3 | Guaranteed wins (FTUE) | Small/flexible pieces, low gem count, 1 color | Base rules; valid/invalid preview |
| 4–10 | Gentle climb, mostly flow | Add domino/tromino variety; 1–2 colors | 2nd gem color (~L5, taught in isolation) |
| **10** | **Boss/milestone** (authored) | Bigger objective; board transforms as gems clear | Cosmetic unlock + map fanfare |
| 11–20 | Blocks of 3–5 flow + 1 peak + 1 breather | Larger/awkward pieces on peaks | 3rd color (~L15) |
| **20** | **Boss** | " | Cosmetic unlock |
| 20+ | Same rhythm; expand variety every ~10 | Recombine colors + board patterns; new objective types (target-score-only, "clear specific cell", shaped board region) | ~1 new element / 10 levels |

**Rhythm:** 3–5 winnable "flow" levels → 1 "peak" → 1 "breather"; boss every ~10.
**Content budget:** ~15–25 levels on the base gem mechanic before variety must expand; then a
new element roughly every 10 levels (recombination, not constant new systems).

**Procedural vs authored — recommended hybrid:** keep procedural generation, but constrain it
with **hand-authored templates/parameters per difficulty band** (gem count, color count, board
fill %, piece-pool weighting, solvability check). **Hand-author only** the milestone/boss levels
and the first ~5 tutorial levels, where crafted "aha" feel matters most. Procedural volume
everywhere else. Best cost/quality point for a solo/offline build; deterministic seeds are free.

## 5. Reward & feedback cadence (offline-safe)

- **Micro (every action):** placement clack, clear chime, particle burst. *(Have it.)*
- **Meso (every run/level):** score count-up, "new personal best!" callout, streak milestone
  banners (×2, ×3…). Escalate juice with the streak (bigger bursts, stronger haptic, brief
  flash/slow-mo on ×3+).
- **Macro (across sessions):** map nodes lit up + completion %, achievements unlocked, stats
  records broken, cosmetic unlocks.
- **Variable vs fixed:** in-the-moment delight = variable (lucky cascades). *Progression* rewards
  = fixed/predictable (beating level N always unlocks node N+1). No RNG loot — that's a
  monetization pattern with the money removed, and pointless here.
- **Rewarding without ads/currency:** personal bests, achievements/milestones, **skill-gated**
  cosmetic unlocks (never RNG, never grind), daily-seed records, the map itself as a collectible.

## 6. Retention levers that work offline (ranked)

1. **Daily challenge / daily seed** — strongest offline lever (Wordle-proven). Once-a-day,
   deterministic from the calendar date (client-side; the seedable RNG makes this trivial).
   Self-limiting → prevents burnout, drives habitual return. Pair with a **streak calendar**
   (days played) + **one-day forgiveness** (streak-freeze) so a lapse doesn't nuke motivation.
   (~90% of players hit a 3-day streak, ~20% sustain 30 — keep early streak-building forgiving.)
2. **Personal-best chasing (Endless)** — "just one more game" engine; surface "X pts from your
   best" at run end (near-miss + loss aversion).
3. **The map as collection/completion** — an incomplete winding map is a standing Zeigarnik pull;
   show completion %.
4. **Achievements/milestones** — persistent checklist of un-closed loops; cheap, effective.
5. **"Just one more game" design** — short runs, instant restart, no wait timers (never halt
   progress). This is the offline retention rule.

*Not applicable (skip):* push re-engagement, stranger leaderboards, timed live events, gacha,
energy-refill monetization.

## 7. Onboarding / FTUE (the primary D1 lever)

- **Teach by doing, not a wall of text.** The first playable level is the real teacher; keep the
  3-step intro skippable/re-openable (already so).
- **Guarantee an early win moment** — first 1–3 levels produce a line clear within a few
  placements (a guaranteed competence hit; drives D1).
- **Front-load easy** — first trays are small/flexible pieces with an obvious clear.
- **Progressive disclosure** — introduce gems only *after* the player clears a plain line or two,
  so each concept lands in isolation.
- **Legibility** — the green/red valid-invalid preview teaches the rule silently; keep prominent.
- Optimize the **first 30–120 seconds**; minimize mandatory tutorial steps (every step sheds players).

## 8. Ethical guardrails

Because there's nothing to sell and no data to harvest, most dark patterns are not just wrong
but **pointless**. AVOID:
- Monetization patterns with the money removed — fake currency, gacha/loot randomness, energy/
  lives + wait timers, "watch ad to continue," hard paywall "pinch" levels.
- Manufactured streak anxiety / guilt (you have no push anyway — keep streaks invitational).
- Grinding / artificial time-sinks (value = a good few-minutes-anytime experience; emulate
  Wordle's self-limiting design).
- Dishonest variance / rigged-but-fair-looking RNG (high player control → they'll feel cheated).
- Difficulty spikes designed to force retries for their own sake.

EMBRACE (and market): "no ads, no tracking, no accounts, works offline" is itself an ethical
selling point; instant free retry; self-limiting daily; honest failure reasons; forgiveness
mechanics (streak-freeze, post-loss anti-frustration nudge).

---

### P12 — Settings: "Erase all data" (data management)  **[small; engineering; do anytime]**

*Owner-raised (2026-08-22). Verdict: NEEDED, not redundant — the game now persists ~8 local
keys (high score, level progress, per-level results, settings, stats, seen-intro, two resume
slots, + upcoming daily-streak) with no user-facing reset. It's also the honest complement to the
"all data local, no tracking" positioning: "your data, on your device, erasable anytime."*

- **Distinct from existing controls:** resume "Start over"/"New" clears only the current game
  slot; there is no reset for progress/stats/settings. This fills a real gap (shared device,
  replay-from-scratch, corrupt-state recovery, QA).
- **Scope: ALL-in-one** (recommended over granular). One "Erase all data" clears every `wbp.v1.*`
  key and returns to a fresh first-run state (intro re-shows). Granular resets = overkill here.
- **Location:** bottom of the Settings panel, visually separated as a "danger zone."
- **Confirmation REQUIRED** — the one deliberate exception to the game's one-tap rule, because it's
  destructive + irreversible. Reuse the confirm overlay: "Erase all data? Your high score, level
  progress, stats, and saved games will be permanently deleted. This can't be undone."
- **After clearing:** reset in-memory state to fresh-install + re-render home (no app restart needed).
- **Implementation:** a `clearAllData()` in `storage.ts` that removes all `wbp.v1.*` keys (centralize
  the key list); never-throw. Real labeled `<button>`; a11y. Test: clears every key; confirm-gated.
- Isolated to `storage.ts` / `screens.ts` (settings panel) / `app.ts` (reset + re-render).

---

## 9. Proposed backlog items (P8–P11) — sequenced after the perf + P7 track

### P8 — Fairness & trust  **[do FIRST of these — engineering, highest leverage, not designer-dependent]**
- **Solvability guarantee:** at level generation, verify at least the opening 3-piece tray has a
  legal placement; never deal an unsolvable start.
- **Post-loss anti-frustration tray bias:** after a loss/retry, gently skew the *next* tray toward
  pieces that fit the current board, capped so skilled players still lose fairly. The *ethical*
  form of DDA — rescues, doesn't punish.
- *Why first:* turns the procedural generator from "sometimes unfair" into "reliably fair" — the
  biggest trust win, and what stops a hard level from feeling like an unfair wall.

### P9 — Daily Challenge + streak calendar  **[biggest retention ROI; mostly engineering]**
- Deterministic **daily seed** from the calendar date (client-side, offline). Once-a-day, self-limiting.
- **Streak calendar** (days played) as a completion collectible; **one-day forgiveness**.
- Persist a per-day best. Ethical: invitational, no anxiety, no push.

### P10 — Achievements + skill-gated cosmetics  **[strongly DESIGNER-OWNED]**
- Achievements/milestones checklist ("first 4-line clear," "×5 streak," "100 lines total," "beat
  level 25") — cheap Zeigarnik loops.
- **Cosmetic unlocks** (wood textures / board themes / piece skins / particle colors) tied to
  milestones — unlock treadmill with **no monetization, no RNG**. The cosmetic identity is exactly
  what the UX/UI designer should shape.

### P11 — Curve & feel polish  **[partly in flight via P7; DESIGNER-INVOLVED]**
- **Board-opening gem layouts** engineered for a late-level combo *surge* (Interest-Curve board
  progression applied to the gem system).
- **Escalating juice on streaks** (extend P7: bigger bursts / brief flash on ×3+).
- **End-of-Endless "X points from your best"** near-miss prompt.
- **FTUE tuning:** first 1–3 levels guarantee a clear; disclose gems only after a plain-line clear.

---

## 10. Recommended sequencing (TPM)

1. **Finish in-flight technical work first** — Perf P-3, then serialized Perf Tier 2 + P7 (streak
   HUD/wiring). Don't fork attention onto new features mid-track.
2. **P8 (fairness)** — engineering, high-leverage, non-designer-dependent; makes everything else
   land better. Do this before more content.
3. **P9 (daily + streak)** — biggest retention ROI; the seedable RNG makes it cheap.
4. **P10 (cosmetics/achievements) + P11 (curve/FTUE feel)** — **bring in the UX/UI designer here.**
   These are where design judgment matters most (cosmetic identity, map feel, celebration
   moments) and are the natural first assignment for the design pass.

## 11. Key sources
- Ryan, Rigby & Przybylski (2006), *The Motivational Pull of Video Games: A Self-Determination
  Theory Approach* (autonomy/competence → enjoyment & well-being).
- Csikszentmihalyi (flow); Wordle "optimal challenge" analyses.
- Karrs, C., *The Player's Progress: Designing Levels for Mobile Puzzle Games* (Interest Curve;
  board/goal progression; surges).
- Woodbury, D., *Rethinking Progression in Mobile Puzzle Games* ("never halt progress"; chance/
  skill balance; why skill-based games rage-quit).
- MDPI (2024), *Exploring Dynamic Difficulty Adjustment Methods for Video Games* (no single DDA
  beats static; aligns with Flow Theory).
- Clark et al., PMC2658737, *Gambling Near-Misses…* (near-miss increases desire under personal control).
- Skinner / variable-ratio reinforcement (game-wisdom.com; helpfulprofessor.com; explorepsychology.com).
- devtodev (FTUE); segwise.ai (2026 retention benchmarks ~27% D1 / 8–14% D7 / 3–7% D30).
- Wordle daily-habit analyses (self-limiting; streak/loss-aversion; ~90% 3-day / ~20% 30-day streak).
- Zagal, Björk & Lewis (FDG 2013), *Dark Patterns in the Design of Games* (definition & ethics).
