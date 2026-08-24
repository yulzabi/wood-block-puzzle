# Wood Block Puzzle — Non-Blocking Review Notes

> Running log of **non-blocking** observations captured during TPM code review, keyed
> to the backlog P-items. These did **not** block acceptance of the commit they were
> found in — they are follow-ups, nice-to-haves, or things to confirm later. Blocking
> issues are never parked here; they're raised and fixed before acceptance.
>
> Convention: `[ ]` open · `[x]` addressed. Add the commit SHA where a note originated.

---

## P0 — Drag performance (iPad smoothness)

**Status: DONE & VERIFIED on device (owner iPad, 2026-08-21). Floats well, drops right,
jank gone. Residual minor lag accepted — deferred (see P0.7 note).**
Remaining item was feel, not perf → addressed by P0.6 (free-floating ghost).

- [ ] **P0.7 (deferred, low priority) — residual minor drag lag on OLDER iPad only.**
  Confirmed 2026-08-21: **smooth on Mac browser, slight lag only on an old iPad.** This
  means P0 fixed the algorithmic cost (layout thrash); what remains is **per-frame GPU
  paint / fill-rate budget on weak mobile hardware**, not JS. Suggestions, highest impact
  first (all reviewed against game.css):
  1. **Ghost `filter: drop-shadow` → `box-shadow` (or remove during motion).** `.drag-ghost`
     (game.css ~L281) uses `filter: drop-shadow`, applied to the ONE element that moves every
     frame. CSS `filter` re-rasterizes the layer per frame — the single most likely cause of
     "smooth on desktop, laggy on old iPad." Swap for a plain `box-shadow` on the ghost blocks
     (visually near-identical, far cheaper to composite). **Biggest win, lowest risk.**
  2. **Keep the ghost a flat, static composited layer.** It already has `will-change:transform`
     (good). Ensure nothing forces re-raster while moving: no `filter`, no changing shadow, no
     `backdrop-filter`. Consider a simplified `.dragging` block style (flat fill + one subtle
     shadow) applied only while lifted.
  3. **Cut cell/block overdraw on mobile.** `.cell.filled` / `.block` each stack a
     `linear-gradient` + `color-mix` + THREE shadows (game.css ~L131). Across 64 cells + a
     clear animation scaling many at once, that's heavy fill-rate for an old GPU. Add a
     `@media (pointer: coarse)` branch using flat fill + single shadow; keep the rich look on
     desktop.
  4. **`backdrop-filter: blur(3px)` on overlays** (`.screen.overlay`, game.css ~L340) is costly
     on old iPads — gate behind coarse-pointer / `prefers-reduced-transparency`, or use a more
     opaque solid bg. (Not the drag path; only if overlay open feels laggy.)
  5. **Don't throttle below rAF.** P0.2 already coalesces to 1 update/frame; on hardware that
     can't hold 60fps the fix is cheaper frames (1–3), not fewer updates.
  6. **Check ghost size/shadow radius** for 5-cell pieces — a large layer + wide shadow is more
     to rasterize; shrink the shadow if 1–3 don't fully resolve it.
  Verify on the actual old iPad (Safari Web Inspector Timeline via Mac if available); expect
  item 1 alone to help most.

- [x] **P0.6 (8ec9878) — free-floating ghost.** Ghost now floats under the finger every
  frame; `moveGhost` moved to top of `update()` (unconditional), `cellOriginClient` snap
  removed from the update path, `lastKey` guard now wraps only `showPreview`. Verified the
  ghost-moves-every-frame point in review. Board cell-highlight still snaps. Green.
  Pending: owner iPad float-check after push.

- [ ] **P0.1 (fecf4cc) — `scroll` invalidation is `capture: true` on `window`.** Works
  correctly, but once **P0.4** adds `contain: layout paint` on the board, confirm no
  spurious metric invalidations fire from any inner/nested scrollers. Low risk; just
  verify the cache isn't being thrown away more often than needed during a drag.
- [ ] **P0.x — Device truth is manual.** The code-level win (0 `getBoundingClientRect`
  per move) is verified, but "does it *feel* smooth on iPad" is an on-device check only
  the owner can confirm. Track a manual iPad smoke test after P0.2/P0.3 land.
- [ ] **P0.2 — rAF coalescing testability.** rAF timing is awkward to unit-test; if the
  "schedule vs skip" decision can be cheaply extracted as a pure helper, do so; else rely
  on the suite + manual feel (accepted tradeoff, don't force a brittle fake-timer test).
- [ ] **P0.3 (65f8884) — optional same-cell regression test not added.** Approved the
  optimization without it (behavior is simple + correct), but a test asserting repeated
  same-cell `update()` calls don't rewrite preview DOM would lock it against regression.
  Cheap to add later.
- [ ] **P0.4 (deviation, TPM-approved) — `contain: layout`, NOT `layout paint`.** `paint`
  would clip the placement/clear cell-scale animations (1.08–1.15) at the board edge.
  Manually confirm pop/clear still overflow the board edge (no clipping) after the change;
  no automated test covers visual overflow.

## P1 — Line-completion highlight on drag

**Status: DONE (P1a 01fefc1 core, P1b 401cd75 drag, P1c 53e83a1 keyboard). Both input
paths glow completed lines + announce "clears N lines"; count logic shared via
`src/input/line-hint.ts`. 167 tests green. Pending owner push + on-device glance.**

- [x] Computed inside the P0.3 origin-changed guard (zero per-frame cost) — as planned.
- [ ] Owner on-device check after push: the warm line-hint glow reads as distinct from the
  green/red placement preview, and clears cleanly on drop.

## P4 — Level Map + per-level history

**Status: CODE-COMPLETE (P4a d4102c8 results store + `nextLevelToPlay`; P4b determinism;
P4c/P4d f79d8f4 winding-trail map UI + a11y). No stars (owner). Highlight = focal "next to
play" node via the one tested `nextLevelToPlay` helper (sole caller `levelMapNodes()` in
app.ts). Locked nodes = native `disabled` (not clickable/focusable). Replay regenerates via
`newLevelsGame`. Home: Levels→map. 213 green.**

- [x] **Map/zoom fixes (6fe7546) — verified on device (owner "looks ok", 2026-08-22).** Slalom
  trail with "?" hidden places; nodes absolute-positioned so hit area = paint (fixed the
  tap-a-specific-spot bug); zoom normal (map overflow-x clipped + trail scrollTop instead of
  document scroll; WCAG pinch-zoom preserved). Pushed; local == origin/main.
- [ ] **FUTURE: UX/UI designer polish pass** (owner plan, post-functional-complete). A dedicated
  design review/improvement plan comes AFTER the game is mechanically done. Candidate inputs for
  that pass are already noted across this file: map visual language, gem/HUD legibility, streak
  feedback (P7), drag-lag polish (P0.7), overall visual system. Don't over-invest in bespoke
  visuals before then — mechanics first.

## P2 — Hints (OFF by default)

**P8 — Fairness & trust (engagement plan; core-only, test-first):**
- [x] **P8a (ed425cc) — solvability guarantee.** `trayHasPlacement` + `generateSolvableTray`
  (re-draws the opening hand until a piece fits, capped=20, deterministic re-draws, fallback on
  no-fit board). Wired into beginPlaying + beginLevel; refill uses plain generatePieces (correct).
  Termination proven (`nextSeq === TRAY_SIZE·(cap+1)`); determinism + no-op-on-fittable tested.
  243 green, no seeds shifted.
- [x] **P8b (f1e5949) — anti-frustration tray bias, Levels-retry ONLY.** `generateBiasedTray`
  leans ~2 of 3 slots (70% each) toward board-fitting shapes on retry. **Bounded/ethical: proven
  it does NOT guarantee an all-fitting tray** (test asserts both `anyNonFitting` AND
  `!everyTrayAllFitting` — skilled play can still lose). Endless restart = uniform (high-score
  integrity, tested); only `retryLevel` biases; falls back to uniform on a no-fit board (never
  hangs); deterministic. **P8 (fairness) COMPLETE.** 243+ green, core-only.

**P9 — Daily Challenge + streak calendar (engagement plan):**
- [x] **P9a (fca56b0) — daily core + persistence.** `dailySeedFor(date)` deterministic;
  `wbp.v1.daily` never-throw/backward-compat. **Two-field design (TPM-confirmed correct):**
  `lastPlayedDate` set at `startDaily` gates `canPlayDaily` (quit=used, dodge-impossible);
  `lastCompletedDate` in `recordDailyResult` drives streak (credit on COMPLETION — a deliberate
  mid-run quit forfeits streak + attempt; normal play always ends in game-over → always credited).
  Streak: consecutive build / one-gap forgiven / second-gap reset / longest retained — all tested.
  Core-only, 275 green.
- [x] **P9b (02643d5) — daily UI + resume wiring. P9 COMPLETE.** Home Daily entry
  (Play/Resume/Done states); `enterDaily` marks used-at-start (`saveDaily(startDaily())` before run
  → quit can't dodge, test-proven); dedicated `wbp.v1.save.daily` slot via `scheduleSaveGame(state,
  daily)` — isolation from Endless slot proven both directions; resume = `continueGame(loadDailySave())`
  verbatim (no re-seed/re-startDaily); distinct daily game-over (streak, Home only). 287 green.
  - Deferred (flagged for designer): literal day-grid streak calendar needs per-day history in
    DailyState — current impl shows compact current/longest/today's-best summary.
  - **Owner device gate:** Play Daily→run seeded by today; ←Menu→Home shows Resume Daily; game-over
    →daily-done w/ streak, Home only; **confirm normal Endless "Continue" still works after playing
    the daily** (cross-contamination check).

**DESIGN PASS (P10/P11 + polish) — plan `2026-08-22-design-pass/plan.md` APPROVED (2026-08-22).**
8 slices D1–D8, all approved (full pass). Owner + TPM decisions locked:
- [x] **Flag #1 app.ts wiring — APPROVED.** Achievement detection / cosmetic application / coach-marks
  wire through the spine (established HUD/daily/resume pattern); "no core changes" = no architecture
  drift, not "never touch app.ts."
- [x] **Flag #2 core/daily.ts `history` field (D7) — APPROVED by owner.** One-line pure add to
  `recordDailyResult` + schema bump (back-compat), prune ~400 days. Enables the streak calendar.
- [x] **Flag #3 FTUE generation tuning — DEFERRED.** D8 = presentation FTUE only; `core/levels.ts`
  "guaranteed early clear" tuning is a SEPARATE later owner-approved core slice.
- **HARD GATES (TPM, non-negotiable):**
  - **D3 Clean-Sweep board flash:** if `?perf=1` shows ANY clear-frame regression on old iPad → CUT
    the flash (gold burst carries the tier). Not a judgment call.
  - **D5 cosmetics:** per-board-theme contrast re-verification of the colorblind cues (gem letter +
    preview shape) — a dark theme must not kill legibility. Actual check, not assumption.
  - **D1 flat-block 2nd inset + panel grain:** behind `?perf=1` gate; revert independently if it fails.
    Gate RUN, not assumed-free.
- **Sequencing:** D1 first (token foundation, ~0 visual diff). D4 before D5 (unlocks derive from
  achievements). Per-slice: green+typecheck → owner device look-check → `?perf=1` for game surfaces →
  one commit → stop for review (plan §10).
- [x] **D1 (5336436) — token consolidation + mobile bevel. CODE-ACCEPTED.** theme.css/game.css only;
  `--gold`/`--gold-soft`, `--fs-*`, `--sp-*`, `--elev-*`, `--radius-card/pill` (count-asserted
  value→token, ~0 desktop diff); one intended change = 2nd un-blurred bottom inset on `.cell.filled`/
  `.block` under `@media(pointer:coarse)` (no filter/gradient — perf split intact); panel grain
  deferred. 293 green. **PENDING owner iPad gate:** `?perf=1` drag ~60fps with the bevel (revert to
  single-shadow if regresses) + eyeball (blocks bevelled, desktop unchanged).
- [x] **D2 (0ab1aa2) — HUD status strip + score hero. CODE-ACCEPTED.** Reserved streak line now
  carries left mode-tag (LEVEL N / ENDLESS / DAILY) + right streak badge (`space-between`, same
  height, no jump); LEVEL relocated OUT of hud-box rows (gem-chip row gets full width); SCORE hero
  (`flex:1.4`), BEST demoted to `--fs-chip`. **Badge slot preserved (P7 tests green + new assert
  badge in `.hud-streak-line`).** Both variants render-asserted; `.hud-level` box absent. hud.ts/
  game.css only, 297 green. **PENDING owner iPad gate (bundle w/ D1):** narrow-width — badge/BEST
  no overlap; both HUD variants read w/ LEVEL relocated.
  - [ ] **DEFERRED to D4 (1-line spine wiring):** `render()` gained a tested `context:'endless'|
    'daily'` param, but `app.ts renderHud()` doesn't pass it yet → a daily run's tag shows ENDLESS
    (cosmetic only; daily works). Fold `this.isDaily ? 'daily' : 'endless'` into D4 (already opens
    app.ts). Added to D4 acceptance bar.
- **Design invariants (perf/ethics-safe by construction):** cosmetics = CSS-variable swaps (no new
  paint); unlocks derived from achievements (one source of truth); skill-gated only (no RNG/currency);
  missed-day calendar cells neutral (no guilt).
- Note: owner routed TPM feedback back to the UX/UI agent — plan doc may be revised; these decisions +
  gates hold regardless of doc edits.
**Status: DONE (P2a 5ab1892 `firstPlacement` core + `hasAnyPlacement` refactor to delegate;
P2b aae0309 settings + in-game Hint button). Defaults OFF; per-field settings load is
backward-compatible with legacy blobs; button absent from DOM when off; single-highlight
(clears preview/line-hint first). 173 tests green. Pending owner push.**

## P3 — Gem objective system (Levels redesign)
- [x] **GEM-COLORBLIND-TOGGLE (d7b1d18) — DONE.** "Colorblind gem markers" setting, default
  OFF; ON overlays the letter cue (R/B/G/A/P/C) on gems (agent chose letter over per-color
  facet patterns — defensible: 6 facet cuts wouldn't be reliably distinguishable at ~40px for
  the users who need it). Live re-render on toggle; default = clean faceted gemstones; color
  ORDER (blue→amber→red) active regardless; screen-reader color names always present. Backward-
  compat load + default-false tested. 199 green. Records the letter-drop as a deliberate,
  user-controlled decision (not a silent reversal).
- [x] **GEM-DIAMOND-SHAPE — RESOLVED & CONFIRMED ON DEVICE (2026-08-21).** The faceted 5-point
  gemstone polygon (fa5db38) reads as a gem with the colorblind toggle OFF (owner-confirmed);
  the earlier rotated-square approach was the cause. Both visual gates passed: default gemstone
  = gem, toggle-ON letters legible at board + tray sizes.

**Progress: Slices 0–3 DONE. Slice 1 (904060b) migration; Slice 2 (77d9fab) generation +
solvability invariant; Slice 3 (48f054c) engine either/or win + `gemsCleared` event
(ordered cleared→gemsCleared→refill, test-locked), gem accounting Levels-gated. 181 green.**

- [x] **Slice 1 deferred cleanup — mask-update block mode-agnostic.** CLOSED in Slice 3:
  gem accounting is now `mode === 'levels'`-gated; Endless does zero gem work.
- [x] New engine event `gemsCleared` ordered **after `cleared`, before `refill`** — done,
  with a test asserting `indexOf` ordering (48f054c).
- [x] Old combined "targets AND score" win condition **deleted** (not branched) — grep-
  confirmed gone; replaced by `goalType==='gems' ? quotasMet : score>=targetScore`.
- [x] **Slice 4 (a094f26) — piece-borne gems.** Proportional drain from supply (50%/piece,
  tunable Slice 6), deterministic incl. refill, decrement-on-deal verified (supply stable
  across placement), never-exceeds-supply, zero-gem allowed, score levels clean, full
  supply→deal→board→clear→quota loop test-proven. 190 green. Gem objective now functionally
  complete but INVISIBLE — Slice 5 renders it.
- [x] **Slice 5 (5a a635cae rendering + 5b 0035e16 HUD/announce) — gems VISIBLE & playable
  end-to-end.** Colored faceted-diamond SVG with letter cue (colorblind-safe) on board + tray
  + ghost; per-color HUD chips (`quota−cleared`, clamped ≥0); `moveMessage` folds line+gem into
  one aria-live write; score levels hide the empty BLOCKS box. UI-only, 196 green.
  **← PUSH/VERIFY BOUNDARY.** On-device checks: diamond legibility, HUD chip readability,
  colorblind letter, and **layer crowding during a drag** (diamond + line-hint + preview on
  the same cells) — the one thing code review can't settle.
- [ ] **Slice 6 (next) — flag-on + tune:** `GEM_DEAL_PERCENT` (50) + level curve knobs;
  re-run Lighthouse; update README + docs. Gems already effectively "on" for levels 2+ —
  Slice 6 is tuning + docs, not a flag flip per se.

## P4 — Level Map + per-level history

- [ ] Extend the determinism test to assert `generateLevel(N)` returns identical
  board+gems+quotas+targetScore across calls — this is what *guarantees* replay, so it
  should be a hard test, not an assumption.

## P5 — Resume in-progress game

**Progress: P5a (114e1a7) serialize/deserialize DONE. `wbp.v1.save` versioned; full GameState
incl. Uint8Array board/gems (round-trip as real Uint8Arrays) + per-piece gems + rngState
(verbatim, no re-seed). Strict validation → null on corrupt/missing/version/wrong-length, never
half-restore. 220 green. Storage-only.**

- [x] `Uint8Array` fields round-trip via `Array.from`/`Uint8Array.from`; corrupt-blob +
  version-mismatch fallback tests — done in P5a.
- [ ] **P5b (next) — app wiring (spine):** save per committed move + on `visibilitychange`/
  `pagehide`; **clear save on every terminal state** (game-over/level-complete/level-failed/
  quit-to-menu — no resuming a finished game); "Continue" on home only when a valid `playing`
  save exists; restore re-enters correct mode/screen + re-renders.
- [ ] **P5-A (Option A: resume-from-context, two slots — Endless + one shared Levels).** Replaces
  the single-slot P5b. Slice 1 (66b6188) keyed storage; Slice 2 (272219f) app wiring DONE —
  shims deleted, per-mode API, Endless "Continue or New?" prompt + level-card "Continue" (only for
  the matching saved level), per-slot terminal clears, ← Menu = PAUSE (saves, does NOT clear;
  owner Option 1), Play/Replay clears stale levels save. Render-assert `app.dom.test.ts` mounts the
  app and asserts the Continue/New buttons actually render (closes the P5b green-but-invisible gap).
  225 green.
  - [x] **Owner DEVICE-VERIFIED (2026-08-22): resume works.** Endless ← Menu → Continue/New;
    level ← Menu → node Continue; finish/lose clears; reload resumable. Plus level-card
    **"Start over"** (13fa31a) — resumable card now offers Continue + one-tap Start over
    (clears levels slot + fresh), consistent with Endless "New game"; render-assert covers both
    button states. 225 green.
  - [x] **Slice 3 (3ec24ee) — DONE.** ADR-0007 per-context-resume (supersedes 0001's no-persist
    clause + interim 0006); 0006 marked superseded (kept for history); README index updated.
    Docs-only. **P5 COMPLETE & device-verified.**
- [ ] **P7 dependency:** when P7 adds `streakGraceUsed`, bump the P5 save `schema` version + add
  the field (old saves without it → null, acceptable).

## P6 — Hygiene guardrails (DONE, commit c2912cc)

**Perf track (from `.agents/planning/2026-08-21-performance/plan.md`, PE plan):**
- [x] **P-1 (1481dad) — measurement harness + lighthouse gates.** `?perf=1` probe (FPS/longtask/
  listener-leak), completely inert without the flag; `run-lighthouse.mjs` now gates (non-zero exit)
  on budgets. Isolated (perf-probe.ts/main.ts/scripts) — no app/hud/scoring/game.
- [x] **P-2 (539af18) — precache diet.** Splash PNGs dropped from SW precache: 2.05 MB → 127 KB
  (under the 150 KB gate). `vite.config.ts` only.
- [ ] **P-3 (next, Track P) — compositor-pure drag (Tier 1):** `game.css` only — drag-ghost
  `filter:drop-shadow`→`box-shadow` on ghost blocks; de-filter preview checkmark. On-device gate.
  → [x] DONE (578bc58): filter removed from `.drag-ghost`, lift shadow baked onto blocks as
  box-shadow, preview checkmark de-filtered. game.css only. **Owner iPad eyeball pending.**
- [x] **P7 CORE (1d8e960) — streak grace + ×5 cap.** `streakMultiplier` capped ×5; `streakGraceUsed`
  on GameState (clear refills / hold-once-at-streak≥2 / else reset), threaded through constructors;
  combo event gains `graceReady`; save schema bumped 1→2 (v1 saves → null). Core-only, 230 green.
- [ ] **THEN serialize spine (both edit app.ts/hud.ts/game.css) — REORDERED by PE device data
  (2026-08-22):** the drag lag is NOT the ghost/gems — it's **board-cell repaint churn** (off-board
  drag = 60fps, over-board = <20fps, identical in Endless & Levels). New order:
  1. **Tier 3 (paint diet) FIRST — the drag fix** (coding agent, spec ready): flat `.cell.filled`/
     `.block` under `@media (pointer: coarse)` (main win); inset-only `.cell.line-hint` (drop the
     `0 0 9px` outer glow that bleeds damage rects); de-filter `.gem` markers. Preserve colorblind
     shape cue + gem letter toggle + reduced-motion. **Gate: owner `?perf=1` iPad re-check (drag
     <20→~60fps) + owner look-eyeball (flat mobile blocks must still read as wood).** Plan B if not
     enough: preview/line-hint on a dedicated overlay layer so cells never repaint during a drag.
     → **[x] CODE DONE (15d0539):** all 3 changes verified game.css-only, a11y cues (preview shape +
     gem letter) intact, 230 green. **PENDING owner iPad `?perf=1` re-check (drag ~60fps?) + look-eyeball
     on flat mobile blocks.** If FPS still <60, escalate to Plan B (overlay layer).
  2. **Tier 2 (drop/clear frame)** — diff renderBoard, single tray render, staggered decorations,
     audio pre-warm, AND **fold in the newly-found `saveGame(state)` writing full state to
     localStorage on EVERY move** (`app.ts`, added by P5 resume after the audit — idle-defer it).
     Includes the no-op-render unit guard.
     → **[x] saveGame idle-defer DONE (fa3e1b0):** `scheduleSaveGame` (requestIdleCallback, coalesced)
     replaces per-move sync write; flush on visibilitychange/pagehide/leave-to-menu; **terminal clears
     `cancelPendingSave()` so a deferred write can't resurrect a cleared save.** No localStorage in the
     placement task. Tests cover schedule/flush/coalesce/clear-cancels. The REST of Tier 2 (render diff/
     stagger/audio pre-warm) = **only if the clear frame still hitches on device — measure first.**
  3. **P7 HUD wiring** last (badge + grace shield + combo `graceReady` + debounced aria-live).
     → **[x] DONE (e4ac546):** standing multiplier badge (streak≥2, numeric ×N, warms; restores on
     Continue) + grace shield that reads spent by SHAPE (slash) + dim; aria-live composed into the
     move write (debounced, transition-only); render-assert tests. **PERF TRACK & P7 CODE-COMPLETE.**
     Owner device gates pending: (a) no line-clear jank + resume-after-immediate-reload; (b) badge/
     shield eyeball — makes "why didn't my streak reset?" obvious.
- [ ] **Tier 2 (clear-frame polish) — MEASURED, tracked, non-blocking (ongoing perf effort w/ PE).**
  Owner device reading (2026-08-22): line-clears **dip to ~32fps for a moment then recover to 60** —
  a transient one-frame burst (render + audio + haptics + particles + pops all in one frame), NOT
  sustained lag. Real but minor polish. Fix order when picked up, **re-measure after each, stop when
  clears hold ~60** (don't over-build): (1) **stagger decorations** to next rAF — targets the burst
  directly, likely biggest win; (2) diff `renderBoard` + no-op-render unit guard; (3) single tray
  render per move (drop redundant refill-branch `renderTray`); (4) audio pre-warm only if a
  first-placement hitch is separately seen. Serial on the spine (app.ts/hud.ts). Deferred as
  ongoing perf, not blocking functional-complete.
- [x] **Streak badge overlap fix (7656250) — structural.** Badge was `position:absolute;right:0`
  on `.hud`, landing on top of the BEST box on small layouts. Fixed by moving it to a dedicated
  `.hud-streak-line` flow slot (24px reserved, no jump) above the score row; `.hud` is now a flex
  column. Overlap now impossible at any width; both endless + levels HUD variants clear. 237 green.
  **Owner: eyeball at narrow width — BEST readable, badge above it, no overlap.**
- [ ] **⚠ DESIGNER-INTERSECTION NOTE (for the future UX/UI pass):** Tier 3 introduces a deliberate
  **desktop-rich / mobile-flat block styling split for PERFORMANCE** (old-iPad 16ms paint budget).
  The designer must NOT "restore" the expensive wood gradient on touch devices without understanding
  the frame-budget reason. Tune the flat mobile style for looks, don't delete the media-query split.
- [ ] **Probe artifact (not a leak) — PE-confirmed:** the `?perf=1` listener counter climbs because
  `once:true` listeners (pop-up `animationend`/`transitionend`) auto-remove without calling
  `removeEventListener`. Optional later: count only non-`once` listeners. Real memory is flat.

- [ ] **Bleeding-edge major pins** (TS 7 / Vite 8 / Lighthouse 13 / Vitest 4) — watch only.
  Re-run `npm run lighthouse` after any dep bump; the SW-precache reader and the LH
  category iteration are the likeliest to break. (Now partly mitigated: `P-LHHARDEN`
  surfaced runtimeError + reads precache from `sw.js`; Dependabot added.)

---

## Cross-cutting / from the 9-commit batch (pre-P0)

- [ ] **A-ZOOM ADR missing.** The no-zoom→zoom-allowed decision (WCAG 1.4.4) is recorded
  only in an `index.html` comment. Add **ADR-0006** so the relaxed native-feel decision
  isn't silently reverted. (Batch commit 85e5dd4.)
- [ ] **iOS pinch manual check.** Verify on a real iOS device: pinch-zoom **blocked** on
  board/tray during play (via `touch-action: none`), **allowed** on menus/text. Can't be
  verified headlessly; keep on the manual-QA acceptance list.
- [ ] **iOS per-device splash drift.** The media-query'd splash `<link>` table
  (85e5dd4) will drift as Apple ships new device dimensions; revisit when new iPhone/iPad
  sizes appear.
- [ ] **Coverage thresholds are a floor, not a ceiling.** Global functions/lines gates are
  intentionally modest (38/40) with strict `core`/`platform` gates; as DOM tests grow,
  consider raising the global floor so it keeps meaning something.

---

## How to use this file

- During review, park anything that is **real but not worth blocking on** here, tagged
  with the originating commit SHA.
- When starting a P-item, **read its section first** — some notes are dependency
  reminders (e.g. P1 riding on P0.3's guard) that are cheapest to honor up front.
- Close notes (`[x]`) with the SHA that addressed them, so this doubles as a light audit
  trail of follow-through.
