# Implementation Plan: Wood Block Puzzle (PWA)

Test-driven, incremental steps. Each step yields a working, demoable increment, builds on the previous, and ends by wiring into the app. Tests are written alongside the functionality they cover (no test-only steps). The **core playable loop is reachable at Step 5**.

## Progress Checklist

- [ ] **Step 1** — Project scaffold, tooling, PWA config, home screen, seedable RNG
- [ ] **Step 2** — Core data model: types, shape set, board primitives (pure, tested)
- [ ] **Step 3** — Static rendering: BoardView + TrayView from a fixed state
- [ ] **Step 4** — Piece generation, scoring, and the GameEngine reducer (pure, tested)
- [ ] **Step 5** — Drag-and-drop input wired to the engine → **playable core loop**
- [ ] **Step 6** — Game over, restart, and persisted high score + HUD
- [ ] **Step 7** — Native-feel polish: animations, haptics, install affordance
- [ ] **Step 8** — Icons/splash, offline + Lighthouse verification, README

---

## Step 1: Project scaffold, tooling, PWA config, home screen, and seedable RNG

**Objective:** Stand up a runnable, buildable, testable Vite + TypeScript project that shows a styled, native-feeling **home screen** and is configured as a PWA. Introduce the first pure core module (`rng`) to establish the test-driven pattern.

**Implementation guidance:**
- Init Vite (vanilla-ts) with pinned deps; add `vite-plugin-pwa` and `vitest`. Scripts: `dev`, `build`, `preview`, `test`.
- `index.html`: viewport meta with `viewport-fit=cover`, `theme-color`, and iOS meta tags (`apple-mobile-web-app-capable`, `-status-bar-style`, `apple-touch-icon`). Root container.
- `src/styles/theme.css`: wood palette custom properties, `env(safe-area-inset-*)` padding, and app-frame base rules (`user-select:none`, `-webkit-touch-callout:none`, `overscroll-behavior:none`, `touch-action:none` on the play surface, no pinch-zoom).
- `src/ui/screens.ts` + `src/app.ts` + `src/main.ts`: render a home screen (title, Play button) centered in the portrait app-frame (capped max-width on desktop). Play button is a no-op stub for now.
- `vite.config.ts`: configure `vite-plugin-pwa` with a minimal manifest (name, standalone, portrait, colors) and one placeholder icon; enable dev SW so it can be exercised later.
- `src/core/rng.ts`: `seedState`, `nextRandom`, `nextInt` (mulberry32).

**Tests (alongside):** Vitest unit tests for `rng` — same seed → identical stream; `nextInt(state, n)` always in `[0, n)`; state advances deterministically. Confirms the test harness runs.

**Integration:** Establishes the app shell, theme tokens, PWA config, and the pure-core/test pattern every later step reuses.

**Demo:** `npm run dev` shows a warm-wood, full-viewport home screen with a Play button that feels app-like (no scroll/zoom/selection); `npm run build` emits static files to `dist/`; `npm test` passes the rng suite.

---

## Step 2: Core data model — types, shape set, and board primitives

**Objective:** Implement the pure, DOM-free game data model and board mechanics that everything else depends on.

**Implementation guidance:**
- `src/core/types.ts`: `Coord`, `Shape`, `Piece`, `Board` (flat `Uint8Array(64)`), `GameState`, `Move`, `GameEvent`, `MoveResult`, plus `BOARD_SIZE`/`TRAY_SIZE`.
- `src/core/shapes.ts`: `makeShape(id, offsets)` (normalizes offsets, computes `size`/`width`/`height`) and the enumerated `SHAPES` list (single; lines 2–5 h/v; 2×2; 3×3; small corners ×4; big-L ×4; T ×4; S/Z; J/L) exactly as in the design.
- `src/core/board.ts`: `createBoard`, `idx`, `inBounds`, `canPlace`, `place` (returns new board + filled cells), `findFullLines`, `clearLines` (returns new board + cleared cells, deduped), `hasAnyPlacement`. All pure — inputs never mutated.

**Tests (alongside):**
- `shapes`: every entry normalized (min row/col = 0); `size/width/height` consistent with `cells`; unique ids; no duplicate cells.
- `board`: `canPlace` true on empty fit, false on each out-of-bounds edge and on overlap; `place` returns a new board with exactly the right cells/material; `findFullLines` finds rows, cols, several at once, and none on empty; `clearLines` empties exactly the targets, dedupes row∩col, preserves the rest; `hasAnyPlacement` true/false cases.

**Integration:** These primitives are consumed directly by the renderer (Step 3) and the engine (Step 4).

**Demo:** `npm test` shows the full board/shape mechanics suite green — placement validation, multi-line clearing, and "any placement" detection all proven on hand-built boards.

---

## Step 3: Static rendering — BoardView and TrayView from a fixed state

**Objective:** Turn a `GameState`-shaped value into pixels: a wood-themed 8×8 board and a tray of 3 real shapes. No interaction yet.

**Implementation guidance:**
- `src/ui/board-view.ts`: build the 8×8 grid once; `renderBoard(board)` reconciles filled cells to wood-tone blocks (material index → `--wood-n`) with rounded/tactile CSS depth. Expose geometry helpers `cellSize()` and `clientToCoord(x, y)` (used later by dragging).
- `src/ui/tray-view.ts`: `renderTray(tray)` renders each unplaced piece as a mini-grid preserving shape proportions; placed pieces render as empty slots.
- `src/styles/game.css`: board, cell, block, and tray styling in the wood theme.
- In `app.ts`, mount an in-game view driven by a **hardcoded sample state** (a partially filled board + 3 sample shapes) reachable from the Play button, so the render path is exercised end-to-end.

**Tests (alongside):** Unit-test the pure geometry helper `clientToCoord` (given a board rect + cell size, a client point maps to the expected `Coord`, and out-of-bounds points are rejected). View DOM wiring is verified in the demo.

**Integration:** BoardView/TrayView become the render surface the engine drives in Step 5; `clientToCoord` feeds the drag controller.

**Demo:** Press Play → a polished wood 8×8 board with some pre-filled blocks and a tray of 3 distinct shapes appears, correctly laid out in the portrait app-frame on both phone and desktop widths.

---

## Step 4: Piece generation, scoring, and the GameEngine reducer

**Objective:** Complete the pure core: generate pieces, score moves, and drive all state transitions through an immutable, event-emitting engine.

**Implementation guidance:**
- `src/core/pieces.ts`: `generatePieces(rngState, startSeq, count)` — draws `count` shapes uniformly from `SHAPES`, assigns a random material and unique id, threads and returns the rng state and next seq.
- `src/core/scoring.ts`: `placementScore(n) = n`; `lineClearScore(k) = 10 * k*(k+1)/2`.
- `src/core/game.ts`: `newGame(seed, highScore)`, `startGame`, `applyMove`, `restart`, `isGameOver`. `applyMove` validates → returns `{ ok:false, reason }` (unchanged state) or applies placement, clears lines, updates score, refills when the tray empties (before the game-over check), sets `gameover` when no unplaced piece fits — emitting ordered events (`placed`, `cleared?`, `scored×1–2`, `refill?`, `gameover?`). Inputs never mutated.

**Tests (alongside):**
- `pieces`: returns exactly `count` pieces, deterministic under a fixed seed, valid materials/unique ids.
- `scoring`: `placementScore` identity; `lineClearScore` = 10/30/60/100 for k=1..4, 0 for k=0.
- `game`: `startGame` fills a 3-piece tray; happy-path place (score + placed flag, state unmutated); line-completing place emits `cleared` + clear `scored`; rejection returns `{ ok:false, reason }` with identical state; placing the 3rd piece emits `refill`; game-over detection on a constructed no-fit board (and false when room exists), evaluated against the post-refill tray; `restart` resets board/tray/score and preserves high score.

**Integration:** The engine becomes the single source of truth that Step 5 wires to input and rendering.

**Demo:** `npm test` shows a full engine suite green, including a scripted multi-move sequence that places pieces, clears a combo, refills, and reaches game over with the expected score.

---

## Step 5: Drag-and-drop input wired to the engine — playable core loop

**Objective:** Make it playable end to end: drag tray pieces onto the board with a live preview, commit valid drops through the engine, bounce invalid ones back, and render the results.

**Implementation guidance:**
- `src/input/drag-controller.ts`: Pointer Events (`pointerdown/move/up/cancel`) with `setPointerCapture`. On pickup, compute the **anchor** (shape cell under the pointer) and lift a `position:fixed` ghost moved via `translate3d`. On move, map pointer→`Coord` (via `clientToCoord` + anchor), call `canPlace`, and drive a valid/invalid preview highlight. On up, emit a `place` `Move` if valid, else animate the ghost back. `onPlace(cb)`, `setInteractive(enabled)`.
- `app.ts`: hold the `GameState`; on Play call `startGame` and render; subscribe to `onPlace` → `applyMove` → apply new state to BoardView/TrayView and play emitted events (basic placed/cleared visual updates + HUD score text). Gate input during updates with `setInteractive`.
- Extract any remaining pointer math into pure helpers where practical to keep it testable.

**Tests (alongside):** Unit-test the anchor/target math (pointer position + anchor → intended origin `Coord`, including edge clamping/rejection). Engine behavior is already covered by Step 4.

**Integration:** Brings together core (Step 4), rendering (Step 3), and input into the actual game loop — nothing from prior steps is left unwired.

**Demo:** A fully playable game: drag the 3 pieces onto the board, see green/red placement previews, invalid drops spring back, full rows/columns clear, the score rises (with combos), and the tray refills when emptied.

---

## Step 6: Game over, restart, and persisted high score

**Objective:** Close the gameplay loop with an end state and cross-session high score.

**Implementation guidance:**
- `src/platform/storage.ts`: `loadHighScore` (0 on missing/corrupt/unavailable) and `saveHighScore` (silent no-op on failure), wrapped in try/catch; version-prefixed key.
- `src/ui/screens.ts`: game-over overlay (final score, high-score badge, Restart, Home) with in-place enter/exit; extend `hud.ts` with a persisted high-score display, score count-up, and floating `+N` pop-ups on scoring.
- `app.ts`: on the `gameover` event, persist a new high score and show the overlay; Restart calls `restart` and returns to play; Home returns to the home screen. Load the high score into `newGame` at startup.

**Tests (alongside):** `storage` — save→load round-trip; missing/corrupt/`localStorage`-unavailable all yield `0` without throwing (mocked `localStorage`). Game-over/restart transitions are covered by the engine tests from Step 4.

**Integration:** Completes the home → playing → game-over → restart state machine and persists results across reloads.

**Demo:** Play until no piece fits → game-over overlay with final score; Restart starts fresh; beating the high score and reloading the page shows the high score persisted.

---

## Step 7: Native-feel polish — animations, haptics, and install affordance

**Objective:** Make it feel like a real installed app: smooth compositor-only animations, tactile feedback, and an install flow.

**Implementation guidance:**
- Polish CSS transitions/keyframes for placing, line-clear (flash/collapse), score pop-ups, and the game-over transition — animating only `transform`/`opacity` (with `will-change` where it helps) for 60fps. Confirm safe-area insets, no scroll/bounce/zoom/selection across screens.
- `src/platform/haptics.ts`: feature-detected `navigator.vibrate` wrapper; call on placement and on line-clear (distinct short patterns).
- `src/platform/install.ts`: capture `beforeinstallprompt` (Android/desktop), expose `canPrompt`/`prompt`; detect iOS and standalone mode. Add an "Install app" affordance on the home screen that triggers the native prompt where available and shows iOS "Add to Home Screen" guidance otherwise; hide it when already installed.

**Tests (alongside):** `haptics` no-ops when `navigator.vibrate` is absent and calls it with the expected pattern when present (mocked). `install` controller state logic — `canPrompt` flips only after the captured event, `prompt` resolves to accepted/dismissed/unavailable, iOS/standalone detection (mocked UA/`matchMedia`).

**Integration:** Layers feel and installability onto the fully playable game without changing core logic.

**Demo:** On Android/desktop Chrome the Install button fires the native prompt and installs to a standalone window; on iOS the Add-to-Home-Screen guidance shows; dragging is buttery, haptics fire on supported hardware, and animations are smooth.

---

## Step 8: Icons/splash assets, offline + Lighthouse verification, and README

**Objective:** Ship the full PWA deliverable — real assets, verified offline capability, an automated installability check, and documentation.

**Implementation guidance:**
- `scripts/generate-icons.mjs`: generate wood-themed icons from an SVG source into all required PNG sizes (192, 512, 512-maskable, apple-touch-180) plus a splash appearance; wire outputs into the manifest and `index.html`.
- Confirm `vite-plugin-pwa` precaches all built assets so the app loads and plays fully offline after first visit.
- `scripts/run-lighthouse.mjs`: build, serve `dist` on localhost, run Lighthouse headless-Chrome programmatically, assert installability + offline/PWA criteria, print the result, exit non-zero on failure.
- `README.md`: game rules; `npm install`/`dev`/`build`/`preview`/`test` steps; HTTPS/localhost note; install instructions for Android (Chrome), iOS (Safari → Add to Home Screen), and desktop; and an explicit "verified automatically vs. requires a device" section including the captured Lighthouse result.

**Tests (alongside):** The Lighthouse script itself is the automated verification for this step (asserts PWA thresholds and fails the build otherwise); it runs against the production build.

**Integration:** Finalizes all deliverables (source, manifest, service worker, assets, tests, Lighthouse report, README) into a complete, installable, offline-capable app.

**Demo:** Install the built app on desktop/Android and relaunch it offline to play with no network; `npm run lighthouse` prints a passing PWA/installability result; the README walks a new user through running, building, and installing on every platform.

---

## Post-core suggestions (deferred; not in the checklist)

Only after the core loop and PWA are solid: sound effects, richer haptics, combo streak multipliers, undo, resume-in-progress game (the serializable `GameState` makes this clean), additional themes, and the optional transparent-canvas particle overlay for line clears.
