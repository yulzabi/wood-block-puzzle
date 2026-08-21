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

## P2 — Hints (OFF by default)

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
- [ ] **GEM-DIAMOND-SHAPE — LIKELY RESOLVED by fa5db38** (faceted 5-point gemstone polygon,
  inherently non-square, replaced the rotated-square that read as a square). **Owner to confirm
  ON DEVICE** it now reads as a gem, at both board (~40px) and tray (22px) sizes. If still off,
  the cause was owner-identified as the square cell BACKGROUND behind the marker — suppress the
  `.filled` wood-block bg on gem cells (`.cell:has(.gem)` transparent / `.cell--gem` modifier).

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

- [ ] Revisits the locked **high-score-only persistence** decision — owner has approved as
  the planned next step; capture it in an ADR when built so it's not seen as a silent
  reversal.
- [ ] `Uint8Array` fields (`board`, `gems`) need `Array.from` round-trip in serialize/
  deserialize; add explicit corrupt-blob and version-mismatch fallback tests.

## P6 — Hygiene guardrails (DONE, commit c2912cc)

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
