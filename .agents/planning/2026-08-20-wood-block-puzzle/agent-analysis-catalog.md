# Wood Block Puzzle — Enhancement Backlog

Post-launch improvement backlog, synthesized from a four-dimension analysis (gameplay/juice, accessibility/UX, PWA/performance, testing/quality/DX) of the shipped codebase. Deduplicated and prioritized, with a **parallel execution plan** keyed to file ownership so batches can be run concurrently without collisions.

**Current baseline:** installable PWA on GitHub Pages; Endless + Levels modes; combo/streak scoring; sound, particles, settings, stats, first-run intro, keyboard play, back-to-menu; 140 unit tests; CI gates deploy on typecheck + test; Lighthouse **100 / 93 / 96 / 91** (Perf/A11y/BP/SEO), installable + offline PASS.

## How to read this

- **Effort:** `S` (<1 focused change), `M` (feature across a few files), `L` (new subsystem).
- **Priority:** `P0` quick win (high value / low effort / own files), `P1` high value, `P2` worthwhile, `P3` large or optional.
- **Owns:** the files an item would edit — the basis for batching. Items with **disjoint** `Owns` sets can run in parallel.

### Locked decisions (guardrails)

These were deliberate; an item that revisits one is flagged **⚠ revisits locked decision** and needs an explicit call before building:

- **High-score-only persistence** (no in-progress save) — *Resume-in-progress* (G-RESUME) revisits this.
- **DOM + CSS-transform rendering** (canvas only for the decorative particle overlay).
- **Uniform-random piece selection** (no weighting / no guaranteed-solvable refill).
- **`prompt` (not autoUpdate) service worker.**
- **Centered portrait app-frame** — *Desktop/landscape layout* (X-LAYOUT) revisits this.
- **Two modes (Endless + Levels), no piece rotation, 8×8 board, triangular line bonus + streak multiplier.**

---

## Catalog

### Gameplay, modes & juice

- **G-THEMES — Alternate themes (palette switcher).** 2–3 palettes (Midnight/Candy/Slate) picked in Settings, persisted; the look is already `--wood-*` + structural CSS vars. *Cheap, high perceived-polish personalization.* — **Effort:** S–M · **Priority:** P0 · **Owns:** `styles/theme.css` (palettes), `platform/storage.ts` (`Settings.theme`), + wiring in `screens.ts`/`app.ts`. Note: `generate-icons.mjs` palette won't follow themes (accepted).
- **G-DAILY — Daily Challenge (date-seeded).** Same board + piece sequence for everyone each calendar day; track per-day best + day-streak. *Biggest retention lever — a daily reason to return.* — **Effort:** M · **Priority:** P1 · **Owns:** `core/game.ts` (`newDailyGame`), `core/types.ts` (`mode:'daily'`), `platform/storage.ts` (`wbp.v1.daily`), + `screens.ts`/`app.ts` wiring. RNG already seedable → low core risk.
- **G-UNDO — Undo last placement.** Revert the last placed piece and its clear/score/refill. *Forgiving, more "thinky" feel.* — **Effort:** M · **Priority:** P1 · **Owns:** `app.ts` (bounded `GameState` snapshot stack — reducer already returns immutable states), in-game top-bar button in `screens.ts`/`hud.ts`, `styles`. Must roll back the `stats`/`bestStreak` bump; consider disabling in Daily/Blitz.
- **G-CELEBRATE — Clear/streak celebration polish.** Board shake on 3+ lines, line-sweep flash, particle intensity + audio pitch scaling with streak, bolder "COMBO ×N!". *Juice = game feel; cheap, high-impact.* — **Effort:** S–M · **Priority:** P1 · **Owns:** `ui/board-view.ts` (`animateCleared`), `ui/particles.ts` (intensity arg), `ui/hud.ts` (`popCombo`), `styles/game.css`. Honor `prefers-reduced-motion`; transform/opacity only.
- **G-LEVELTUNE — Levels difficulty-curve tuning.** Gentler early ramp / steeper late curve in `targetCountForLevel`/`targetScoreForLevel`; optionally guarantee a placeable first tray. *Current linear scaling feels flat mid, brutal late.* — **Effort:** S (+ test updates) · **Priority:** P1 · **Owns:** `core/levels.ts` + `core/levels.test.ts` (determinism tests lock exact layouts — update deliberately). Fully disjoint from UI.
- **G-BLITZ — Timed / Blitz mode.** Countdown that gains seconds on clears; over at zero. *Fast score-chasing loop distinct from the relaxed default.* — **Effort:** M · **Priority:** P2 · **Owns:** `app.ts` (UI-side timer — keep wall-clock OUT of the pure reducer), `ui/hud.ts` (time slot), `core/types.ts` (`mode:'blitz'`), `platform/storage.ts`, `screens.ts`. Timer must pause on overlays/`document.hidden`.
- **G-ZEN — Zen / no-lose mode.** No game-over; when stuck, allow a `discard` Move. *Broadens audience beyond score-chasers.* — **Effort:** M · **Priority:** P2 · **Owns:** `core/game.ts` (+ `discard` action / mode branch suppressing dead-end), `core/types.ts`, + `screens.ts`/`app.ts`, tests. Adds a second `Move` kind — test well; separate stats bucket.
- **G-RESUME — Resume in-progress game. ⚠ revisits locked decision.** Serialize full `GameState` (Uint8Array `board`/`targets` need `Array.from` round-trip) so relaunch/SW-update continues the board. *Removes the "lost my run on reload" papercut.* — **Effort:** M · **Priority:** P2 (pending sign-off) · **Owns:** `platform/storage.ts` (serialize/deserialize + version), `app.ts` (load on boot, save per move + `visibilitychange`).
- **G-BOMB — Special "bomb" block.** Rare tray cell that clears a 3×3 (or row+col) on placement via a `blast` event. *Variety + satisfying big clears.* — **Effort:** L · **Priority:** P3 · **Owns:** `core/types.ts`/`pieces.ts`/`game.ts` (heaviest core change), `ui/board-view.ts`, `platform/audio.ts` + `ui/particles.ts`, new tests. Keep behind a mode/toggle to avoid unbalancing Levels.

### Accessibility & UX

- **A-COLORBLIND — Colorblind-safe placement preview.** Add a non-color cue (✓/✕ or hatch) to the green/red valid/invalid preview. *~8% of men can't reliably read the current cue — and it's core gameplay feedback, not decoration.* — **Effort:** S–M · **Priority:** P0 · **Owns:** `ui/board-view.ts` (`showPreview`), `styles/game.css` (`.cell.preview--*`).
- **A-FOCUSTRAP — Overlay focus trap + restoration.** Overlays focus a control but don't trap Tab (focus can reach hidden home/game controls) or restore focus to the opener on close; add `role="dialog"`/`aria-modal`, a Tab cycle, and a restore-focus handle. *Standard modal expectation; likely lifts a11y past 93.* — **Effort:** M · **Priority:** P1 · **Owns:** `ui/screens.ts` (overlay helpers), `app.ts` (remember opener). Must coexist with the piece-cancel Escape.
- **A-ZOOM — Allow zoom without losing native feel. ⚠ a11y vs feel tradeoff.** Drop `maximum-scale=1/user-scalable=no`; rely on `touch-action:none` (already on play surfaces) to suppress pinch during play while letting menus/text zoom. *Fixes WCAG 1.4.4 — the current a11y ceiling.* — **Effort:** S (+ audit) · **Priority:** P1 · **Owns:** `index.html` (viewport), audit `styles/*` `touch-action`. Test iOS double-tap zoom.
- **A-PAUSE — Pause / resume (freeze without quitting).** True pause via `setInteractive(false)` + a resumable overlay (optionally blur the board). *Mobile play gets interrupted; today you abandon or leave it live.* — **Effort:** M · **Priority:** P1 · **Owns:** `app.ts` + `ui/screens.ts` + `game.css`. Pairs naturally with A-INGAMESET under one in-game-top-bar owner.
- **A-INGAMESET — In-game access to Settings.** Reach Settings (mute/haptics) from the in-game top bar or pause overlay, not just home. *Quick mute mid-run shouldn't require quitting.* — **Effort:** S–M · **Priority:** P1 · **Owns:** `app.ts` (`.game-topbar`), `ui/screens.ts` (`renderSettings` already exists). Co-assign with A-PAUSE.
- **A-SHARE — Share result.** Web Share API (`navigator.share`) on game-over / level-complete with generated text (+ optional canvas image), clipboard fallback. *Casual virality + satisfying end-of-run; offline-friendly.* — **Effort:** M · **Priority:** P2 · **Owns:** new `platform/share.ts` (no-op-when-unavailable pattern), + `screens.ts`/`app.ts` overlay wiring.
- **A-MOTIONCONTRAST — Reduced-motion + dim-text contrast sweep.** Confirm every animation (`score-pop`, combo pop, `sw-toast`, `kb-held`, `screen-enter`) respects `prefers-reduced-motion`; audit `--text-dim` small text (`hud-label` 11px, hints, subtitles) for ≥4.5:1, nudge the token if needed. — **Effort:** S · **Priority:** P1 · **Owns:** `styles/theme.css` + `game.css`. Coordinate with A-COLORBLIND (both touch `game.css`).

### PWA, performance & platform

- **P-LHHARDEN — Harden `run-lighthouse.mjs`.** Replace the fragile `precache\s+(\d+)\s+entries` stdout regex + blind category loop; read precache from the SW manifest and **surface `lhr.runtimeError`** instead of silent `n/a`. *The NO_FCP regression was invisible precisely because this swallowed the error.* — **Effort:** S · **Priority:** P0 · **Owns:** `scripts/run-lighthouse.mjs`. Self-contained.
- **P-HEAD — `<head>` SEO/metadata + `lang`.** Add `<html lang>`, `<meta description>`, canonical, robots, OG/Twitter tags; `theme-color` light/dark pair. *SEO 91 is largely missing description/lang/canonical; near-free, improves share cards.* — **Effort:** S · **Priority:** P0 · **Owns:** `index.html` `<head>`. Coordinate with P-IOSSPLASH + A-ZOOM (all edit `<head>`).
- **P-IOSSPLASH — iOS per-device splash images.** Emit media-query'd, per-device startup-image `<link>`s from `generate-icons.mjs`. *iOS only shows a launch image on an exact-dimension match; today most iPhones flash `background_color`.* — **Effort:** M · **Priority:** P2 · **Owns:** `scripts/generate-icons.mjs` + `index.html` `<head>`. Device table drifts with new Apple sizes.
- **P-MANIFEST — Richer manifest.** Add `id`, `lang`, `dir`, `categories:['games']`, `shortcuts` (Play Endless/Levels), `screenshots` (wide + narrow). *Rich install dialog, app shortcuts, better catalog presentation.* — **Effort:** S–M · **Priority:** P2 · **Owns:** `vite.config.ts` manifest block + screenshot assets. Shortcut `url`s must respect `VITE_BASE`.
- **P-PARTICLESPERF — Scope + cheapen the particle canvas.** Scope the canvas to the board rect, cap DPR at 2, clear only the dirty region, pool chips. *A full-screen 3× clear per frame is wasteful for a decorative effect; the one place 60fps could dip on hi-DPI phones.* — **Effort:** S–M · **Priority:** P2 · **Owns:** `ui/particles.ts` (+ small board-rect hook in `app.ts` if scoping there). Keep reduced-motion no-op + lazy mount.
- **P-SWVERSION — SW caching strategy + visible app version.** Add a navigation/offline fallback route, explicit cache-version/`id`, and a build version string surfaced in Settings + the update toast. *Clearer offline for deep links; a real version makes update/bug-report flows legible.* — **Effort:** M · **Priority:** P2 · **Owns:** `vite.config.ts` (workbox), `main.ts`, generated version constant, `screens.ts` (Settings line).
- **P-CODESPLIT — Lazy-load in-game-only modules.** Dynamic-`import()` audio, particles, and settings/stats/intro overlay code so the home screen's initial JS is smaller. *Faster first load; the menu needs none of it.* — **Effort:** M · **Priority:** P3 · **Owns:** `app.ts` (dynamic imports), `vite.config.ts` (`manualChunks`/budget), `main.ts`. Verify Workbox precaches split chunks. Run solo (heavy `app.ts` edit).
- **X-LAYOUT — Desktop / landscape layout mode. ⚠ revisits locked decision.** Landscape/wide layout (board beside a HUD+tray rail), auto on wide viewports or via a Settings toggle. *Uses desktop/tablet space instead of a narrow centered column.* — **Effort:** L · **Priority:** P3 · **Owns:** `styles/theme.css` + `game.css` (+ `app.ts`/`screens.ts` if DOM order changes, + `storage.ts` if toggle). Biggest CSS item — schedule alone.

### Testing, quality, architecture & DX

- **Q-CI — PR-only CI workflow.** `.github/workflows/ci.yml` running typecheck + test (+ coverage + build) on `pull_request` / non-main pushes; leave `deploy.yml` for `main`. *Today checks only run on push to `main`; a PR gets no gate before merge.* — **Effort:** S · **Priority:** P0 · **Owns:** `.github/workflows/ci.yml` (new).
- **Q-DEPBOT — Dependency-drift automation.** Renovate/Dependabot with grouped weekly PRs. *Bleeding-edge exact pins (TS 7 / Vite 8 / Lighthouse 13 / Vitest 4) go stale/insecure silently; CI + bot-PR surfaces the fragile scrapers on bump.* — **Effort:** S · **Priority:** P0 · **Owns:** `.github/dependabot.yml` or `renovate.json` (new). Depends on Q-CI to gate bot PRs.
- **Q-DOCS — CONTRIBUTING + ADRs.** `CONTRIBUTING.md` + short ADRs for the locked decisions (persistence, DOM-vs-canvas, uniform-random, prompt-SW). *These live only in commit messages / this planning folder; ADRs stop silent reversal.* — **Effort:** S · **Priority:** P0 · **Owns:** `docs/adr/*`, `CONTRIBUTING.md` (new).
- **Q-DOMTESTS — Component/DOM tests (happy-dom).** happy-dom Vitest env + render tests for `board-view`/`tray-view`/`screens`/`app` wiring (ARIA labels update, tray focusability, overlay open/close, confirm focus/Escape). *All 140 tests are pure logic; ~1,600 lines of DOM/interaction are unverified except by manual screenshots — this catches things like the FCP/intro race automatically.* — **Effort:** M · **Priority:** P1 · **Owns:** new `src/**/*.dom.test.ts`, `vite.config.ts` (`environmentMatchGlobs`), `package.json` (`happy-dom`).
- **Q-COVERAGE — Coverage reporting + threshold gate.** Vitest V8 coverage with thresholds (high on `core`/`platform`), `test:coverage` script, CI fail-under. *No visibility into what the 140 tests cover; a threshold prevents silent erosion.* — **Effort:** S · **Priority:** P1 · **Owns:** `vite.config.ts` (`test.coverage`), `package.json`, CI step. Shares `vite.config.ts` `test` block with Q-DOMTESTS — bundle them.
- **Q-ESLINT — ESLint + Prettier.** Flat-config `typescript-eslint` + Prettier, `lint` script + CI step. *No linter/formatter today — floating promises (`void this.install.prompt()`), unused code, and `any` rely on review.* — **Effort:** M · **Priority:** P2 · **Owns:** new `eslint.config.js`, `.prettierrc`, `package.json`, CI. The autofix/format pass touches many files — **run in isolation**, no concurrent edits.
- **Q-SCREENSREFACTOR — De-duplicate `screens.ts` overlays.** Extract shared `button(...)`/`panelOverlay(...)` builders to collapse the 8 near-identical renderers; replace the `panel as HTMLElement & { _cleanup? }` cast with a typed close handle. *581 lines of repeated boilerplate + a fragile escape hatch.* — **Effort:** M · **Priority:** P2 · **Owns:** `ui/screens.ts` (+ new `ui/dom.ts`). Do after Q-DOMTESTS (safety net); don't run alongside other `screens.ts` work.
- **Q-EVENTPRESENTER — Extract event-presenter from `app.ts`.** Pull the ~100-line `handlePlace` event loop into a testable `EventPresenter`. *`app.ts` (~505 lines) mixes navigation, stats, overlays, and event animation; isolating event→view mapping reduces churn and enables unit tests.* — **Effort:** M–L · **Priority:** P3 · **Owns:** `app.ts` (+ new `ui/event-presenter.ts`). Behavior-preserving; do alone, lean on Q-DOMTESTS.
- **Q-E2E — End-to-end tests (Playwright).** Small suite for drag-and-drop, keyboard placement, line-clear+streak, quit-confirm, install/overlay flows. *Real user paths are only manually verified.* — **Effort:** L · **Priority:** P3 · **Owns:** new `playwright.config.ts`, `e2e/`, `package.json`. Keep OUT of `npm test`/deploy hot path (heavy browser download).

---

## Recommended roadmap

1. **P0 quick wins (do first):** Q-CI, Q-DEPBOT, Q-DOCS, P-LHHARDEN, P-HEAD, G-LEVELTUNE, A-COLORBLIND, G-THEMES.
2. **P1 high value:** Q-DOMTESTS + Q-COVERAGE, A-FOCUSTRAP, A-PAUSE + A-INGAMESET, G-UNDO, G-CELEBRATE, G-DAILY, A-MOTIONCONTRAST, A-ZOOM.
3. **P2 worthwhile:** P-MANIFEST, P-PARTICLESPERF, P-SWVERSION, A-SHARE, G-BLITZ, G-ZEN, Q-ESLINT, Q-SCREENSREFACTOR, G-RESUME *(needs sign-off)*.
4. **P3 large/optional:** G-BOMB, Q-E2E, Q-EVENTPRESENTER, P-CODESPLIT, X-LAYOUT.

---

## Parallel execution plan

The **serialization spine is `src/app.ts` + `src/ui/screens.ts`** — most player-facing features wire through both, so those features must run **one at a time**. Everything that owns other files can run **concurrently**. Group work by disjoint `Owns` sets.

### Wave 1 — fully parallel (7 items, all disjoint own-files, mostly P0)

Run these together — no shared files:

| Item | Owns |
| --- | --- |
| Q-CI | `.github/workflows/ci.yml` (new) |
| Q-DEPBOT | `.github/dependabot.yml` (new) |
| Q-DOCS | `docs/adr/*`, `CONTRIBUTING.md` (new) |
| P-LHHARDEN | `scripts/run-lighthouse.mjs` |
| G-LEVELTUNE | `src/core/levels.ts` (+ its test) |
| P-PARTICLESPERF | `src/ui/particles.ts` |
| **HEAD bundle** = P-HEAD (+ A-ZOOM decision + P-IOSSPLASH) | `index.html` `<head>` + `scripts/generate-icons.mjs` |

> The three `<head>` items (P-HEAD, A-ZOOM, P-IOSSPLASH) all edit `index.html` — assign them to **one** agent so they don't collide.

### Concurrent tracks (run in parallel with each other — disjoint files — but serial *within* a track)

- **Track INFRA** (owns `vite.config.ts` + `package.json` + new test files): **Q-DOMTESTS → Q-COVERAGE → P-MANIFEST → P-SWVERSION.** All touch `vite.config.ts`/`package.json`, so one owner, sequential. (Runs fine alongside Wave 1 and the other tracks.)
- **Track VISUAL** (owns `styles/theme.css` + `game.css` + `board-view.ts` + `hud.ts`): **A-COLORBLIND → A-MOTIONCONTRAST → G-CELEBRATE.** All touch the CSS/view files; one owner, sequential. *(G-CELEBRATE also touches `particles.ts` — schedule it after Wave 1's P-PARTICLESPERF.)*
- **Track CORE-MODES** (owns `core/game.ts`/`types.ts`/`pieces.ts` + tests): the core half of **G-DAILY / G-ZEN / G-BOMB / G-BLITZ**, sequential among themselves. Produces additive APIs the UI track then wires.
- **Track FEATURES = the spine** (owns `app.ts` + `screens.ts`, one at a time): **A-FOCUSTRAP → (A-PAUSE + A-INGAMESET together) → G-UNDO → G-THEMES-apply → G-DAILY-wire → A-SHARE → G-BLITZ-wire → G-ZEN-wire.** Each is a solo agent editing the spine; do not overlap them.

### Isolation-required (no concurrent edits at all)

- **Q-ESLINT** — the format/autofix pass rewrites many files; land it in a clean tree with nothing else in flight.
- **Q-SCREENSREFACTOR** — broad `screens.ts` rewrite; run after Q-DOMTESTS exists, alone.
- **Q-EVENTPRESENTER** / **P-CODESPLIT** / **X-LAYOUT** — each is a heavy edit of a spine/CSS file; schedule solo.

### Suggested sequencing

1. **Batch A (parallel):** all of Wave 1 + kick off Track INFRA (Q-DOMTESTS+Q-COVERAGE) + Track VISUAL (A-COLORBLIND) + Track CORE-MODES (G-LEVELTUNE is in Wave 1; start G-DAILY core). Verify (typecheck/test/build/Lighthouse) at the barrier.
2. **Batch B (parallel):** Track FEATURES starts (A-FOCUSTRAP, then Pause+in-game-settings) while Track INFRA continues (P-MANIFEST/P-SWVERSION) and Track VISUAL continues (A-MOTIONCONTRAST → G-CELEBRATE). Verify.
3. **Batch C:** remaining features one-at-a-time on the spine (G-UNDO, themes-apply, daily-wire, share…); P2/P3 infra + refactors slotted in isolation windows.
4. Run **Q-ESLINT** and the big refactors (Q-SCREENSREFACTOR, Q-EVENTPRESENTER) in dedicated solo windows once the feature churn settles.

**Always** re-run `npm run typecheck && npm test && npm run build && npm run lighthouse` at each batch barrier — the FCP/NO_FCP regression showed that UI/overlay changes can silently break first paint, and Lighthouse is the guard.
