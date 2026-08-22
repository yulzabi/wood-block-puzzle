# Wood Block Puzzle — Zero-Jank Performance Plan

> A clean-slate performance audit and plan for the existing game. Supersedes all
> earlier performance planning. Scope: **performance and smoothness only** — no new
> features, no gameplay changes. Goal: **no lag and no experience-breaking hitches on
> the weakest device we care about (an older iPad), and instant loads everywhere.**
>
> Status: PROPOSED — plan only, nothing implemented. Owner approves before any slice.

---

## 1. Definition of done

The game is "done" performance-wise when all of these hold **on the oldest target
device**, not just on a dev Mac:

1. **Dragging a piece never stutters.** Sustained 60 fps for a full-board sweep with a
   5-cell piece, previews and line-hints active.
2. **Dropping a piece never hitches.** The place → clear → effects moment stays within
   one frame of budget; a first-ever placement feels identical to the hundredth.
3. **No long tasks during play.** Zero main-thread tasks > 50 ms from game start to
   game over.
4. **Loads feel instant.** First contentful paint well under 1.5 s on a mid-tier
   device; repeat visits paint from the SW cache immediately.
5. **Nothing breaks the experience.** No stuck ghosts, dropped inputs, mis-mapped
   drops, surprise reloads, or runaway memory over a long session.

---

## 2. Frame-budget model (the contract every fix is judged against)

| Interaction | Budget | Why |
| ----------- | ------ | --- |
| Drag (per frame) | ≤ 3 ms main thread, **zero** layout reads, **zero** per-frame rasterization | 60 Hz leaves 16.7 ms; old-GPU composite + browser overhead eats most of it |
| Drop / placement (single frame) | ≤ 16 ms total including render, audio, haptics, effects | It's discrete tap feedback — one borderline frame is invisible, two reads as lag |
| Line clear w/ effects | Animations compositor-only; effect setup ≤ 4 ms | Runs on top of the drop frame |
| Cold load | FCP ≤ 1.5 s mid-tier mobile; interactive ≤ 2.5 s | "Instant" threshold for a casual puzzle |
| First-visit transfer | ≤ 300 KB total; SW precache ≤ 150 KB | Installability on poor networks |
| Long session (30 min) | Flat DOM node count, listener count, and heap | No slow decay of smoothness |

---

## 3. Audit — where the time goes today

Fresh reading of the current code, organized by rendering-pipeline stage. Each finding
carries evidence and a severity for the *old-iPad / weak-GPU* case.

### 3.1 Compositor stage — the drag ghost re-rasterizes every frame · **HIGH**

`.drag-ghost` carries `filter: drop-shadow(…)` (`src/styles/game.css`, drag-ghost
block). A CSS `filter` on the one element that moves every frame forces WebKit to
re-rasterize that layer per frame instead of just recompositing it. This is the classic
"smooth on desktop, laggy on old iPad" signature: desktop GPUs absorb it, old mobile
GPUs don't. Everything else on the drag hot path is already compositor-clean (the ghost
moves via `translate3d` with `will-change: transform`).

### 3.2 Paint stage — expensive pixels on 64 cells · **HIGH (weak GPUs only)**

- `.cell.filled` and `.block` each stack `linear-gradient` + two `color-mix()` + three
  `box-shadow`s (`game.css`). 64 board cells + tray pieces + the ghost all pay it.
  Any cell invalidation (preview class flips while dragging, fill changes on drop,
  clear animations) repaints at that cost.
- Line clears animate `transform: scale` on up to 24+ cells at once (`cell-clear`
  keyframes): each becomes a temporary composited layer — a layer-creation storm plus
  raster of the expensive style above, exactly at the moment audio/haptics/particles
  also fire.
- `.screen.overlay` uses `backdrop-filter: blur(3px)` — one of the most expensive
  effects on older iPads; felt when opening the pause/settings overlay mid-game.
- The valid-preview checkmark uses `filter: drop-shadow` per previewed cell
  (`game.css`, `.cell.preview--valid::before`) — repainted on every cell change while
  dragging.

### 3.3 DOM/style stage — the drop frame does 64 cells of churn · **MEDIUM**

`BoardView.renderBoard()` (`src/ui/board-view.ts:91-110`) runs on **every** placement
and unconditionally touches all 64 cells: classList writes, a `--block` style write,
and a freshly built `aria-label` + `setAttribute` per cell. A typical move actually
changes ≤ 21 cells. Costs: style invalidation, and accessibility-tree churn on every
move — which also spams VoiceOver users (a perf *and* a11y issue).

Compounding it: on a refill move the tray is fully rebuilt **twice** in the same frame
— `handlePlace` renders it up front (`src/app.ts:368`) and the `refill` event renders
it again (`src/app.ts:417`), even though `applyMove` already returned the final
post-refill tray.

### 3.4 Main-thread I/O inside the drop frame · **MEDIUM**

- `saveStats()` executes a synchronous `localStorage` write on **every move**
  (`src/app.ts:434`), even when no stat changed (they only change on clears/new
  bests). `localStorage` is synchronous disk-backed I/O; on old iOS it can spike
  several ms — inside the placement frame.
- The **first placement of a session** lazily constructs the `AudioContext`
  (`src/platform/audio.ts`, `getCtx()` via `playPlace()`): context creation + resume
  lands in the same frame as render + haptics + animations. A one-time but very
  perceivable "first move stutters" hitch on slow hardware.
- Everything decorative (particles, score/combo pop-ups, announcements, persistence)
  runs synchronously inside the `pointerup` handler alongside the state render —
  the frame's cost is the *sum* of all of it.

### 3.5 Network / install — the service worker precaches 2 MB of pixels · **HIGH (load)**

Measured from the current `dist/`: app code is tiny (JS 14.7 KB gz, CSS 3.1 KB gz),
but the Workbox precache manifest includes **all 10 iOS splash PNGs (~2.0 MB of a
2.2 MB total)** via `globPatterns: ['**/*.{js,css,html,svg,png,ico}']`
(`vite.config.ts`). iOS fetches splash images directly at add-to-home-screen time and
never reads them through the SW — so ~98 % of the first-visit/install payload buys
nothing, and re-downloads on every deploy that touches them.

### 3.6 Verified clean — leave alone

These were checked and are already right; the plan explicitly protects them:

- Drag input pipeline: grid geometry cached (zero `getBoundingClientRect` per move),
  `pointermove` coalesced to one update per rAF, preview DOM writes keyed on
  (origin, validity) so same-cell motion does no DOM work.
- Pure engine: O(64) over a `Uint8Array(64)`; per-move allocations are negligible.
- Particles: pooled, DPR-capped, dirty-rect clearing, loop self-stops, lazy canvas.
- No idle loops: HUD tween and particles stop themselves; no polling anywhere.
- SW updates are prompt-based — a deploy can never reload mid-game.
- No web fonts; system font stack.

---

## 4. The plan

Five tiers, ordered by user-perceived impact. Every tier ends with an on-device check.

### Tier 1 — Compositor-pure drag (kills the drag lag)

| Change | Detail |
| ------ | ------ |
| 1.1 Remove `filter` from `.drag-ghost` | Move the lifted-shadow look onto the ghost's `.block`s as a `box-shadow` (painted once; the layer then only recomposites). Visually near-identical. |
| 1.2 Audit the ghost layer | Confirm nothing else re-rasters it mid-drag: no filters, no animated shadows, no size changes. |
| 1.3 De-filter the preview checkmark | Replace its `drop-shadow` with a shadow-free high-contrast stroke (or a cheap `text-shadow`-equivalent border). |

**Verify:** full-board 5-cell drag sweep on the old iPad — no stutter; if Web
Inspector is available, the ghost layer shows zero paint events while moving.

### Tier 2 — A calm drop frame (kills the placement hitch)

| Change | Detail |
| ------ | ------ |
| 2.1 Diff `renderBoard` | Keep a last-rendered `(material, target)` snapshot per cell; skip *all* DOM writes (classes, style, `aria-label`) for unchanged cells. Typical move: 64 → ≤ 21 cells touched. Also quiets VoiceOver. |
| 2.2 Render the tray once per move | `applyMove` returns the final post-refill tray; drop the redundant second `renderTray` in the `refill` event branch. |
| 2.3 Persist stats off the hot path | Write `localStorage` only when a stat actually changed, and defer to idle (`requestIdleCallback` with a `visibilitychange`/`pagehide` flush so nothing is lost). Same for the high score. |
| 2.4 Pre-warm audio | Create/resume the `AudioContext` at game entry (a user-gesture context, so autoplay policy is satisfied) instead of inside the first placement. Keep all never-throw / mute guarantees. |
| 2.5 Stagger decorations | Keep truth synchronous (board + tray render, audio, haptics — latency-sensitive), start particles and score/combo pop-ups on the next rAF. Splits the spike across two frames with zero perceivable difference. |

**Verify:** Performance trace of 20 consecutive placements incl. a first-move and a
multi-line clear: no task > 16 ms on device, no `localStorage` calls inside the
`pointerup` task. Unit guard: re-rendering an identical board performs **zero**
attribute/class mutations (spy-based test).

### Tier 3 — Adaptive quality for weak GPUs (paint budget)

Principle: **degrade pixels, never interaction** — and do it declaratively in CSS
(media queries), no JS device sniffing.

| Change | Detail |
| ------ | ------ |
| 3.1 Flat block styling on `@media (pointer: coarse)` | Flat `var(--block)` fill + un-blurred inset highlight instead of gradient + 2×`color-mix` + 3 shadows. Desktop keeps the rich look. Must still read as "wood" — owner eyeballs it. |
| 3.2 Gate the overlay blur | `backdrop-filter` only under `(pointer: fine)`; slightly more opaque solid background on coarse pointers. |
| 3.3 Tame the clear-animation layer storm | Keep transform/opacity-only (already true); with 3.1 the per-layer raster cost drops. If still heavy, cap the visual: animate the cleared *lines* as ≤ 4 grouped flashes rather than 24 individual cells. Only if measurements demand it. |

**Verify:** trigger a 3-line clear on the old iPad with particles + pop-ups + audio —
no dropped frames. Confirm valid/invalid preview remains distinguishable by shape
(colorblind cue) after any styling change.

### Tier 4 — Instant loads and honest installs

| Change | Detail |
| ------ | ------ |
| 4.1 Precache diet | Exclude `icons/splash*.png` from the Workbox precache (`globIgnores`); keep the manifest icons (~43 KB). First-visit SW payload: ~2.2 MB → < 150 KB. iOS still gets splash screens — it fetches them itself at install time. |
| 4.2 Budget enforcement | Extend `scripts/run-lighthouse.mjs` to fail loudly on: perf score < 95, precache > 150 KB, JS gz > 25 KB. Today it reports; it should gate. |
| 4.3 (Optional) pre-JS shell | FCP currently waits for the JS module. With ~15 KB gz this is likely already fine — only add a static HTML shell if Lighthouse on a throttled profile shows FCP > 1.5 s. Measure first, don't build speculatively. |

**Verify:** fresh install → airplane mode → full game playable offline; Lighthouse
budgets green; deploy-to-deploy delta download is a few KB.

### Tier 5 — Experience-robustness sweep (the "issues that break UX" half)

Not fps — the failure modes that *feel* like the game broke. Audit found the code
largely defends these already; this tier turns "looks right" into "proven right":

| Concern | Current state | Action |
| ------- | ------------- | ------ |
| Stuck ghost / lost piece | `pointercancel` + `lostpointercapture` handled; listeners unbound from the pickup element; cleanup double-fire is idempotent | Add a DOM test: cancel mid-drag → ghost removed, piece restored, next drag works |
| Multi-touch chaos | Second `pointerdown` ignored while a session is active | Add a test: two concurrent pointers → exactly one session, correct drop |
| Pinch-zoom vs. cached geometry | Metrics re-measured at every pickup; zoom during a drag is blocked by `touch-action: none` | Manual device check: zoom a menu, enter game, drag — drops land where the finger is |
| Mid-game reload | SW `prompt` mode — safe | Keep; assert in a test that no `autoUpdate` regression sneaks in via config |
| Live-region spam while dragging | Line-hint announcements fire on every cell change | Throttle announcements to ≥ 500 ms apart during an active drag (AT users get smoothness too) |
| Long-session decay | Pop-ups/particles self-clean; screens re-render in place | 30-min soak: DOM node + listener counts flat (probe from Tier 6) |

### Tier 6 — Measurement harness (lands FIRST so every tier has numbers)

1. **On-device probe behind `?perf=1`:** rAF-delta FPS counter + `PerformanceObserver`
   (`longtask`) + DOM-node/listener counters. Completely absent (no listeners, no DOM)
   without the flag.
2. **Device matrix per tier:** old iPad (the pain device), a current iPhone, desktop
   Chrome + Safari. Record before/after FPS + long-task counts in this doc.
3. **Unit guards:** the Tier-2 no-op-render test; existing 173-test suite and coverage
   gates stay green on every slice.

---

## 5. Explicit non-goals

- **No canvas/WebGL rewrite** — DOM rendering stays (ADR-0002); nothing above needs it.
- **No engine optimization** — it's already O(64) on typed arrays; not on any hot path.
- **No bundle splitting / lazy routes** — 15 KB gz of JS; splitting adds latency.
- **No input throttling below rAF** — if a frame misses, make the frame cheaper.
- **No JS device detection** — capability comes from CSS media queries only.

---

## 6. Sequencing (each slice shippable, tests green, stop-and-ask before commit)

1. Tier 6 probe + Lighthouse budget gates (numbers first).
2. Tier 1 (compositor-pure drag) → old-iPad check.
3. Tier 4.1/4.2 (precache diet + gates) — isolated, biggest byte win.
4. Tier 2 (drop frame: diff render, single tray render, idle persistence, audio
   pre-warm, staggered decorations) → device trace.
5. Tier 3 (adaptive quality) → owner look-check + device clear-storm test.
6. Tier 5 (robustness tests + announce throttle + soak).
7. Record final before/after numbers in §7; done when §1's five criteria all pass.

## 7. Results log (fill as slices land)

| Date | Slice | Device | Before | After |
| ---- | ----- | ------ | ------ | ----- |
| 2026-08-22 | Probe baseline, measured AFTER Tier 1 (ghost de-filter, `578bc58`) + Tier 4.1 (precache diet, `539af18`) | old iPad | — | idle **60 fps** · drag sweep **< 20 fps** · line clear **~35 fps** · after 2 min: 215 nodes / 46 listeners (healthy absolutes; trend TBD) |
| 2026-08-22 | Tier 3 paint diet (`15d0539`: coarse-pointer flat blocks, inset-only line-hint, de-filtered gems) | old iPad | drag < 20 fps | drag **25–35 fps**, dips to **18** on very fast sweeps — improved but **below the 40 fps escalation line → plan B**. **REGRESSION (owner-reported):** full-line highlight invisible on touch — the coarse `@media` `.cell.filled` override (game.css:305) sits later than `.cell.line-hint` (261) and `.cell.preview--*` (212) at equal specificity, so filled cells lose the hint ring and the invalid-preview tint on coarse pointers. Hotfix: split the media overrides to sit directly after each base rule. Plan B removes the fragility permanently (highlights leave the cells). |
| 2026-08-22 | Slice A cascade hotfix (`da1921b`) + Slice B overlay highlights (`76668ca`) | old iPad | drag 25–35 fps (18 fast) | drag **60 fps sustained** — §1 criterion 1 (drag never stutters) **MET**. Open: owner reports the full-row/col line-hint ring sits visibly **too high vs the wood bricks** — **iPad only** (owner: desktop clean; CDP-measured Chrome delta **0.00 px** at all corners). Photo confirms a sub-cell uniform upward shift of the rings. Theory: iOS WebKit misplaces the overlay's **composited layer** (layout agrees, compositor doesn't) — the `will-change: transform` + `contain: strict` promotion combo. Dispatched: `slice-ipad-overlay-alignment.md` (probe gains an on-device `hlΔ` readout + promotion switched to `translateZ(0)` / `contain: layout paint`). |

**2026-08-22 reading.** Tier 1 alone did not fix the drag: the ghost is
compositor-pure, so the remaining per-frame cost is **board-cell repaint churn**
— each cell-boundary crossing toggles ≤ 10 preview cells + up to 24 line-hint
cells, each repainting at gradient + 2×`color-mix` + triple-shadow cost; the
line-hint's outer glow (`0 0 9px`) bleeds past cell bounds and inflates damage
rects; and gem cells add an SVG repainted through `filter: drop-shadow`
(`game.css` `.gem`) — a second filter on the drag path, found after the plan was
written. Line-clear 35 fps is the Tier 2 drop-frame work, now bigger than
planned: `saveGame(state)` serializes the full game state to localStorage on
**every move** (`app.ts`), added by the resume feature after the audit — fold it
into Tier 2.3's idle-deferred persistence.

**2026-08-22 discriminating test (old iPad): diagnosis CONFIRMED.** Off-board
drag (ghost moving every frame, zero highlight churn) holds **60 fps**; over the
board it collapses to < 20 — **identically in Endless and Levels**. Conclusions:
(a) the entire remaining drag lag is preview/line-hint repaint churn on the
heavy wood-cell styles; (b) gems are NOT the dominant cost (Endless has none) —
de-filter them anyway, but the win must come from the cell paint diet + the
inset-only line-hint. Next slice = Tier 3, in that shape. Plan B if the diet
isn't enough: move preview/line-hint highlights to a dedicated overlay layer so
board cells never repaint during a drag.

**Probe caveat (baseline 157 nodes / 23 listeners → 215 / 46 after 2 min):**
the listener counter is net add/remove calls. `once: true` listeners (score/
combo pop-ups' `animationend`, spring-back `transitionend`) are auto-removed by
the browser without calling `removeEventListener`, so the counter increments
forever by ~1 per pop-up — **counter artifact, not a leak**. Node count includes
transient pop-ups/tray rebuilds; +58 over 2 min of play is consistent with that.
Optional probe fix later: count only non-`once` listeners.
