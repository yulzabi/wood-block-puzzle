# Wood Block Puzzle — Master Enhancement Backlog

> Single source of truth for planned work, ordered with dependencies. Derived from
> a code review of the current repo (core is a pure, immutable `applyMove` reducer
> emitting semantic events; UI in `src/ui/`, input in `src/input/`, persistence in
> `src/platform/storage.ts` with never-throw localStorage).
>
> **These P0–P5 items are the owner-directed features — they take priority and their
> locked decisions must not be silently changed.** A broader, agent-generated polish
> catalog (themes, daily, undo, blitz, zen, share, focus-trap, tooling, etc.) lives in
> `agent-analysis-catalog.md`; pull from it *after* / *around* these, and do not let it
> displace the features below.

## Global constraints (apply to every task)

- **No ads, no monetization, no backend.** Fully offline PWA.
- **Row/column clearing only** — no 3×3 square clearing.
- Keep the **game core DOM-free, deterministic, and unit-tested**. All new game
  logic lives in `src/core/` and is testable without a DOM.
- Preserve **seedable-RNG determinism** and the **existing event ordering**.
- After **every** task: `npm test` and `npm run typecheck` must stay green.
- Respect `prefers-reduced-motion` and keep animations compositor-only
  (transform/opacity).
- Commit per slice with conventional-commit messages; never combine a data-model
  change with UI in the same commit.

## Dependency order (read this first)

```
P0  Drag performance (iPad smoothness)      ← do first; unblocks smooth feel
P1  Line-completion highlight on drag        ← shares the "origin changed" guard with P0/P3
P2  Hints toggle (OFF by default)            ← small, self-contained
P3  Gem objective system (Levels redesign)   ← LARGEST; must land BEFORE the Level Map
P4  Level Map + per-level history            ← depends on P3 (map reflects gem goals/stars)
P5  Resume in-progress game                  ← independent; high native-feel value
P6  Hygiene guardrails                       ← DONE (commit c2912cc); kept for record
```

**Why this order:** performance first (it affects the whole game feel), then the
cheap self-contained wins (line highlight, hints), then the big gameplay change
(gems) which the Level Map must reflect, then the map, then resume, then hygiene.

---

## P0 — Drag performance (iPad smoothness)

**Problem (verified in code):** every `pointermove` runs `update()` →
`clientToCoord()` **and** `cellOriginClient()`, and **each calls `metrics()` which
calls `getBoundingClientRect()` twice** → ~4 forced synchronous layout flushes per
move. At iPad pointer rates (60–120 Hz) that is 240–480 layout flushes/sec during a
drag. This is the jank the owner reported on iPad.
> Note: this is the DRAG hot path — distinct from particle-canvas perf. Both matter;
> this one is what fixes the reported iPad drag jank.

- **P0.1 — Cache grid metrics for the drag duration (biggest win).**
  Grid geometry does not change mid-drag. Measure `metrics()` **once** at
  `pointerdown` and store it on the `DragSession`; reuse for `clientToCoord` +
  `cellOriginClient` in every `update()`. Result: `getBoundingClientRect` calls per
  move go from ~4 to 0. Add a cached `getCachedMetrics()` + `dirty` flag on
  `BoardView`; invalidate on `resize`/`orientationchange`/`scroll`. The pure
  functions `pointToCell`/`cellOriginClient` already take metrics as input, so only
  the *source* of metrics changes — existing tests stay valid.

- **P0.2 — Coalesce `update()` to one per animation frame.**
  On `pointermove`, store the latest `(x, y)`; if no frame is pending,
  `requestAnimationFrame` the update. Collapses multiple moves per frame into one
  DOM update aligned to the compositor.

- **P0.3 — Diff the preview instead of clear-all + re-add every frame.**
  `showPreview` currently calls `clearPreview()` then re-adds classes **every
  frame**, even when the target cell is unchanged. Guard: if computed origin ===
  last origin, do nothing. Only touch the DOM when the previewed cell set changes.

- **P0.4 — Layer/containment hygiene.**
  Confirm the drag path writes only `transform`/`opacity` (ghost already uses
  `translate3d` + `will-change`). Add `contain: layout paint` to the board element
  so preview class changes don't invalidate outside layout.

- **P0.5 — Passive listeners where not preventing default; ensure `touch-action:
  none` on board/tray (tray already has it).**

**Verify:** with Safari Web Inspector (iPad via Mac), confirm `getBoundingClientRect`
per move drops to 0 after P0.1 and frames stay ~16 ms during a drag. P0.1 alone
should fix most of the jank.

---

## P1 — Line-completion highlight during drag

Show which full rows/columns a placement **would complete**, so the player sees
what they'll clear/break before dropping.

- **P1.1 — Core (pure, tested):** `linesCompletedBy(board, shape, origin):
  { rows: number[]; cols: number[] }`. Only when `canPlace`; simulate the fill on a
  copy (or check per line whether every empty cell in that line is covered by the
  piece). No mutation of the real board. Tests: completes 1 row; completes row+col
  simultaneously; completes nothing; invalid placement → empty.
- **P1.2 — BoardView:** `showLineHint(rows, cols)` / `clearLineHint()` add a
  `line-hint` class (distinct from the piece preview) — a soft glow along the full
  line.
- **P1.3 — DragController:** when placement is valid, compute `linesCompletedBy` and
  `showLineHint`; clear when invalid/off-grid. **Compute inside the same
  "origin changed" guard as P0.3** so it adds no per-frame cost.
- **P1.4 — Styling:** `.cell.line-hint` warm glow/outline; compositor-friendly;
  reduced-motion → static glow.
- **P1.5 — A11y:** announce via aria-live ("Placing here clears 2 lines").

---

## P2 — Hints (OFF by default, enabled in Settings)

- **P2.1 — Core:** `firstPlacement(board, shape): Coord | null` — first legal origin
  (row-major), else null. Tests: found; no-fit; exact-fit-at-edge.
- **P2.2 — Settings:** extend `Settings` to `{ sound; haptics; hints }`. **Default
  `hints = false`.** Keep never-throw load/save + corrupt-value fallback. Update
  `storage.test.ts`: hints defaults false; round-trips; corrupt → all defaults.
- **P2.3 — UI:** Settings panel gets a "Hints" toggle. When ON, an in-game "Hint"
  button highlights `firstPlacement` for the first unplaced tray piece that fits
  (reuse valid-preview styling; announce via aria-live). When OFF, the button is not
  rendered at all.

---

## P3 — Gem objective system (Levels redesign)  **[LARGEST — do before P4]**

Replace the identical white-ring targets with **typed, colored diamond** objectives,
some of which **arrive on the player's pieces**.

### Locked decisions

- Objective is **EITHER a per-color gem quota OR a target score — never both.**
  Each level declares `goalType: 'gems' | 'score'`.
- Full row/column clears **free the cells** (existing behavior). Because space is
  recycled, generation only needs `starting_gems + piece_supply >= quota + margin`
  (NOT simultaneous fit on the board).
- Gems ride on **some** piece cells (**possibly zero**). A placed gem sits on the
  board as its color until a line through it clears; the player routes incoming gems
  into completable lines.
- Diamonds, colored per gem, **color-blind-safe** (facet pattern / letter, not hue
  alone).
- HUD shows **remaining-to-clear per color** beside the score.
- **Supply is decremented when gems are DEALT onto pieces, not when cleared** — keeps
  totals bounded and the solvability math honest.

### Data model

- Keep material (0..6) unchanged. Add a **parallel gem channel**:
  - `GemColor` constants (RED=1, BLUE=2, GREEN=3, AMBER=4), 0 = none.
  - `GameState.gems: Uint8Array(64)` — **replaces** the old `targets` mask.
  - `Piece.gems?: readonly GemColor[]` aligned to `shape.cells` (0 = no gem). Shape
    geometry stays immutable/separate so a shape can appear with or without gems.
- Level goal fields on `GameState`:
  - `goalType: 'gems' | 'score'`
  - `quotas: Partial<Record<GemColor, number>>` (gems goal)
  - `gemsCleared: Partial<Record<GemColor, number>>` (progress)
  - `gemSupplyRemaining: Partial<Record<GemColor, number>>`
  - keep `targetScore` (score goal)

### Generation (`generateLevel`, deterministic per level number)

- Decide `goalType` from level. For gem levels: choose colors + quotas; place some
  starting gems (may be far fewer than quota); plan a piece-borne **supply** so
  `start + supply >= quota + margin`. Supply may be spread across many future trays.
- Track `gemSupplyRemaining` in state.
- **Tests (write first):** determinism (same level → identical board/gems/quotas/
  supply); `start + supply >= quota + margin` across a level range; the explicit
  **"quota 20 red, board starts with 6"** case; score-goal levels have no gems.

### Piece generation (gem levels)

- When dealing a tray, draw from `gemSupplyRemaining` and sprinkle gems onto **some**
  cells of **some** pieces (respect "can be 0"; never exceed remaining). Deterministic
  from level seed + piece sequence. **Decrement supply as gems are dealt.**

### Engine (`applyMove`)

- On place: write piece gems into `board.gems` at placed cells; include gems in the
  `placed` event.
- On clear: for each cleared cell with a gem, increment `gemsCleared[color]` and empty
  the gem (cell freed). Emit **`gemsCleared`** event **after `cleared`, before
  `refill`**.
- Win (levels): `goalType==='gems'` → every quota color `cleared >= quota`;
  `goalType==='score'` → `score >= targetScore`. **Never require both** — remove the
  old combined condition, don't just branch around it.
- Dead-end/level-failed unchanged (true no-move). A gem resting on the board is fine.

### Rendering / HUD / A11y

- Replace `.cell.target::after` white ring with a **colored diamond** (rotated
  rounded square or inline SVG) + facet highlight + color-blind-safe marker.
- Draw diamonds on board cells **and** on tray/ghost piece cells carrying a gem.
- HUD (gem levels): per-color chips beside score — colored diamond + `remaining`
  (`quota − cleared`), e.g. `🔴 14 left  🔵 6 left`. Score levels: existing score HUD.
- A11y: color **names** in aria-labels ("red diamond") on board + pieces; announce gem
  clears + remaining ("Cleared 3 red, 11 red left"). Never hue-only.

### Migration

- Endless unaffected (no gems/quotas). Version any persisted level-results blob.

### Execution plan (slices — core-first, test-first, one per commit)

- **Slice 0 — Spike.** Map every read/write of the old `targets` (the blast radius);
  confirm nothing outside levels touches it.
- **Slice 1 — Data model + types.** Add gem channel + goal fields; migrate `targets`→
  `gems` mechanically; keep old behavior by generating only `goalType:'score'` levels
  (gems flag OFF). All existing tests pass.
- **Slice 2 — Generation (test-first).** Write generation invariants tests, then
  implement to satisfy them. Locks the hardest guarantees before any UI.
- **Slice 3 — Engine clear/win (test-first).** Gem write on place; gem count on clear;
  either/or win; cell freed on clear.
- **Slice 4 — Piece-borne gems.** Deterministic dealing from supply; never exceed;
  zero-gem pieces allowed; supply decrements on deal.
- **Slice 5 — Rendering + HUD + a11y (UI only, no logic edits).** Split into
  rendering / HUD / a11y sub-commits if it balloons.
- **Slice 6 — Flag ON for gem levels; tune curve; re-run Lighthouse; update README +
  planning docs.**

---

## P4 — Level Map with per-level history  **[depends on P3]**

**Key insight:** levels are deterministic from their number (`generateLevel(level)`),
so **do NOT persist initial layouts** — replaying level N just regenerates it. Persist
only **results**.

- **P4.1 — Results store (`storage.ts`).** New key `wbp.v1.levelResults`:
  `{ [level]: { completed: boolean; bestScore: number; stars?: number } }`. Add
  `loadLevelResults()` and `saveLevelResult(level, {score, completed})` that **merge**
  (max `bestScore`, OR `completed`). Never-throw; corrupt → empty map. Call from
  `onLevelComplete` alongside existing `saveLevelProgress`. Tests: merge keeps higher
  score; `completed` never regresses; unknown level → not-completed/zero.
- **P4.2 — Stars (optional).** Pure `starsFor(score, targetScore)` (or vs. gem goal),
  1–3 stars; unit-tested.
- **P4.3 — Unlock rule (no new state).** Level unlocked iff `level <=
  loadLevelProgress()` (highest reached). Level 1 always unlocked.
- **P4.4 — Map screen UI ("great UI" is the point).** Scrollable winding "trail" of
  level nodes: number, lock/unlock, stars/best score if completed, a "current" marker
  at highest reached. Locked nodes distinct + not clickable. Tapping an unlocked node
  opens a card (best score, stars, gem goal summary from P3, Play/Replay → existing
  `newLevelsGame`/`startLevel`). Wood theme: carved medallions, rope/grain trail,
  completed nodes gilded. Safe-area aware; portrait frame.
- **P4.5 — Accessibility.** Nodes are real `<button>`s with aria-labels
  ("Level 7, completed, 2 of 3 stars" / "Level 12, locked"); keyboard navigable;
  reduced-motion disables trail animations.
- **P4.6 — Replay guarantee (verify, don't rebuild).** Extend the determinism test to
  assert `generateLevel(N)` yields identical board+gems+quotas+targetScore across
  calls, so "redo a level" is guaranteed by the engine. Replay updates `bestScore`
  (max) but never downgrades `completed`.
- **Home routing:** "Levels" → **map** (not straight into play); "Endless" → play.
  Confirm desired behavior for quick-resume.

---

## P5 — Resume in-progress game  **[independent; high native-feel value]**

Closes the last mid-game data-loss gap (SW updates are already prompt-based). This
**revisits the locked "high-score-only persistence" decision** — proceed since the
owner has requested resume as the planned next step.

- Persist a versioned snapshot under `wbp.v1.save` on each move: board, gems, tray
  (incl. piece gems), score, streak, rngState, pieceSeq, mode, level, quotas/goal.
  Uint8Array fields (`board`/`gems`) need `Array.from` round-trip. Restore on launch
  with a **Continue** button on home; also save on `visibilitychange`. Never-throw on
  corrupt/old saves. Tests: round-trip; corrupt-blob fallback; version mismatch → ignore.

---

## P6 — Hygiene guardrails  **[DONE — commit c2912cc]**

Kept for record; all resolved:

- ✅ README test-count de-hardcoded ("run `npm test`").
- ✅ `"engines": { "node": ">=24" }` added.
- ✅ `scripts` dropped from `tsconfig` include.
- ✅ Lighthouse `--no-sandbox` rationale commented.
- ✅ Icon-generator "mirror" comment corrected + sync note.
- ⏭ Bleeding-edge major pins (TS 7 / Vite 8 / Lighthouse 13 / Vitest 4) — watch only;
  re-run `npm run lighthouse` after any dep bump (SW precache regex + LH category
  iteration are the likeliest to break). See also `Q-DEPBOT`/`Q-CI` in the catalog.
- ✅ (Bonus, same commit) In-game "← Menu" quit-confirm + deferred-intro race guard.

---

## Cross-cutting reminders for the agent

- The **"origin changed" guard** is shared by P0.3 (preview diff), P1.3 (line hint),
  and any future per-frame drag work — compute all of them behind it so drag stays
  free of redundant work.
- New engine events go **after `cleared`, before `refill`** to preserve ordering.
- Gems (P3) must land **before** the Level Map (P4) since the map surfaces gem goals
  and stars per level.
- Keep each slice shippable with green tests; prefer core-first + test-first so the
  objective logic is proven before any pixels are drawn.
- **Do not drop these P0–P5 features in favor of the catalog.** The catalog
  (`agent-analysis-catalog.md`) is a *supplement* — good sources for polish and
  tooling (e.g. colorblind-preview cue, overlay focus-trap, DOM tests, CI/dependabot,
  Lighthouse hardening) to schedule around these owner-directed features.

---

## Appendix A — catalog items merged & scheduled

The broader four-dimension analysis (gameplay/juice, a11y/UX, PWA/perf, testing/DX)
with full `Owns`/effort details lives in **`agent-analysis-catalog.md`**. It is the
*secondary* source — never let an item here displace a P0–P5 feature. Below, each
catalog item is folded into this plan by **status** and **where it slots** (by file
ownership; `src/app.ts` + `src/ui/screens.ts` are the serial **spine**).

### Already implemented (Batch A — verified: 154 tests, Lighthouse 100/100/96/92, installable+offline PASS)

| Catalog item | Owns | Slots at |
| --- | --- | --- |
| P-LHHARDEN — surface `runtimeError`, read precache from `sw.js` | `scripts/run-lighthouse.mjs` | infra (done) |
| P-HEAD + A-ZOOM + P-IOSSPLASH — SEO/OG/`lang`, unlock pinch-zoom (WCAG 1.4.4), per-device iOS splashes | `index.html`, `scripts/generate-icons.mjs` | done |
| A-COLORBLIND — non-color valid/invalid preview cue (✓ / hatch) | `styles/game.css` | complements P1/P3 |
| P-PARTICLESPERF — DPR≤2, dirty-rect, pooled chips | `ui/particles.ts` | distinct from **P0 drag** perf |
| Q-DOMTESTS + Q-COVERAGE — happy-dom component tests + coverage thresholds | `vite.config.ts`, `package.json`, `*.dom.test.ts` | test infra |
| Q-CI — PR-only typecheck/test/build workflow | `.github/workflows/ci.yml` | infra |
| Q-DEPBOT — grouped weekly dependency PRs | `.github/dependabot.yml` | infra |
| Q-DOCS — CONTRIBUTING + ADRs for locked decisions | `CONTRIBUTING.md`, `docs/adr/*` | infra |

> **G-LEVELTUNE (level-curve tuning)** was also built in Batch A but is being **reverted** — it edits `src/core/levels.ts`, which **P3 rewrites** (targets→gems, `goalType`). Fold any curve tuning into **P3 Slice 6** to avoid churning `levels.ts` twice.

### Remaining catalog items — scheduled around P0–P5 (never before them)

| Item | Owns | Schedule / notes |
| --- | --- | --- |
| A-MOTIONCONTRAST — reduced-motion + dim-text contrast sweep | `styles/theme.css`+`game.css` | anytime; disjoint from spine (VISUAL track) |
| A-FOCUSTRAP — overlay focus trap + restoration | `ui/screens.ts`+`app.ts` | **spine**; do with P4 map overlays |
| A-PAUSE + A-INGAMESET — pause + in-game settings | `app.ts`+`ui/screens.ts` | **spine**; co-assign one owner |
| A-SHARE — Web Share on game-over/level-complete | new `platform/share.ts` + spine | after P4 (share level/stars) |
| G-THEMES — palette switcher | `styles/theme.css` + `storage.ts` + spine | VISUAL + small spine wiring |
| G-UNDO — undo last placement | `app.ts` (snapshot stack) + spine | **spine**; after P3 (undo gem state too) |
| G-CELEBRATE — clear/streak celebration polish | `ui/board-view.ts`+`particles.ts`+`hud.ts`+`game.css` | VISUAL; pairs with P3 gem-clear FX |
| G-DAILY — date-seeded daily challenge | `core/game.ts`+`types.ts`+`storage.ts` + spine | core+spine; after P3/P4 |
| G-BLITZ — timed mode | `app.ts`(timer)+`hud.ts`+`core/types.ts`+`storage.ts`+spine | spine; keep wall-clock out of the reducer |
| G-ZEN — no-lose + `discard` move | `core/game.ts`+`types.ts` + spine | core+spine |
| G-BOMB — special bomb block | `core/types.ts`/`pieces.ts`/`game.ts`+ui | **after P3** (shares the board cell-channel model) |
| P-MANIFEST — shortcuts/screenshots/categories | `vite.config.ts` | INFRA; base-relative shortcut URLs |
| P-SWVERSION — cache version + visible build id | `vite.config.ts`+`main.ts`+`screens.ts` | INFRA + small spine |
| P-CODESPLIT — lazy-load in-game modules | `app.ts`+`vite.config.ts`+`main.ts` | **spine, solo** |
| Q-ESLINT — ESLint + Prettier | config + repo-wide format pass | **isolation window** (touches everything) |
| Q-SCREENSREFACTOR — de-dupe overlay builders | `ui/screens.ts`(+`ui/dom.ts`) | **spine, solo**; after DOM tests exist |
| Q-EVENTPRESENTER — extract `handlePlace` event loop | `app.ts`(+`ui/event-presenter.ts`) | **spine, solo**; behavior-preserving |
| Q-E2E — Playwright flows | new `playwright.config.ts`, `e2e/` | own files; keep out of `npm test`/deploy |

### ⚠ Revisits a locked decision — needs explicit owner sign-off before building

- **X-LAYOUT (desktop/landscape "fill-window" layout)** — revisits **ADR-0005 (centered portrait app-frame)**. Not scheduled until signed off.
- **P5 (resume in-progress game)** — revisits **ADR-0001 (high-score-only persistence)**; already owner-approved as the planned next step (kept in the P-series above).

### Parallelization recap

- **Serial spine:** `src/app.ts` + `src/ui/screens.ts` — feature UI wiring goes one at a time.
- **Disjoint tracks that run alongside the spine:** CORE (`src/core/*` — P3 gems, P1/P2 pure fns, G-DAILY/G-ZEN logic), VISUAL (`styles/*` + `board-view`/`hud` — A-MOTIONCONTRAST, G-CELEBRATE, G-THEMES palettes), INFRA (`vite.config.ts`/`package.json` — P-MANIFEST, P-SWVERSION config), and own-file items (share, e2e, docs).
- **Isolation-only (no concurrent edits):** Q-ESLINT format pass, Q-SCREENSREFACTOR, Q-EVENTPRESENTER, P-CODESPLIT.
- Always re-run `npm test && npm run typecheck && npm run build && npm run lighthouse` at each barrier — UI/overlay changes have silently broken first paint before (the NO_FCP regression).
