# 🌳 Wood Block Puzzle

A cozy, wood-themed **block-placement puzzle** (in the spirit of *1010!* / *Block Blast!*), built as an **installable Progressive Web App**. It runs in any modern desktop browser, installs to the home screen on iOS and Android, and — after the first load — works **fully offline**. No backend, no ads, no accounts, no tracking.

Two modes: **Endless** (survive as long as your pieces keep fitting) and **Levels** (clear the pre-placed target blocks *and* reach a target score to advance). Playable by **mouse/touch drag or keyboard**, with synthesized **sound**, optional **haptics**, a wood-chip **particle** flourish on clears, local **stats**, and a first-run **how-to-play** intro.

Live demo: **https://yulzabi.github.io/wood-block-puzzle/**

---

## How to play

- The board is an **8×8 grid**. Below it, a **tray of 3 pieces** (wood-block polyominoes — singles, lines, squares, L/T/S/Z shapes). Pieces **don't rotate**.
- Place a piece where all its cells land on empty cells (a green preview means valid, red means blocked). When the tray empties, you get **3 new pieces**.
- Fill a **whole row or column** (all 8 cells) to **clear** it. Clear **several lines at once** for a big bonus.

**Controls**

- **Mouse / touch:** drag a piece from the tray onto the board and release.
- **Keyboard:** `Tab` to a tray piece, `Enter`/`Space` to pick it up, **arrow keys** to move it on the board, `Enter`/`Space` to drop, `Esc` to cancel.

**Scoring**

- `+1` per placed cell.
- **Simultaneous multi-line bonus:** `10 × k(k+1)/2` for `k` lines cleared at once → **1 line = 10, 2 = 30, 3 = 60, 4 = 100**.
- **Streak multiplier:** consecutive line-clearing placements build a streak that multiplies the clear bonus — `1 + 0.5·(streak−1)`, capped at **×4** (streak 2 = ×1.5, 3 = ×2, …). A placement that clears nothing resets the streak.

**Modes**

- **Endless:** play until none of your 3 pieces fit anywhere. Your **high score** is saved on your device.
- **Levels:** each level starts with **pre-placed target blocks** (ringed) that you clear by completing their rows/columns. Beat a level by clearing **all** target blocks **and** reaching the level's **target score** (both required). Levels are procedurally generated and get harder (more blocks, higher target) as you progress; hitting a dead-end lets you **retry** the level. Your current level is saved on your device.

**Extras**

- **Sound & haptics:** a soft wood *clack* on placement and a chime on clears (pitch rises with your streak), synthesized with WebAudio — no audio files. A **Settings** panel on the home screen toggles **Sound** and **Haptics** (both saved).
- **Particles:** clearing lines sprays short-lived wood chips (a decorative canvas overlay that respects `prefers-reduced-motion`).
- **Stats:** a local, offline **Stats** panel tracks games played, total lines cleared, best streak, and best score.
- **How to play:** a 3-step intro appears on first launch and is re-openable anytime from the home screen.

---

## Run it locally

Requires **Node 24+**.

```bash
npm install       # install dependencies (uses the public npm registry, see below)
npm run dev       # start the dev server (hot reload) at http://localhost:5173
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot-module reload. |
| `npm run build` | Production build → static files in `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm test` | Run the unit tests (Vitest). |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm run icons` | Regenerate the wood-themed PWA icons + splash into `public/icons/`. |
| `npm run lighthouse` | Build, serve, and run Lighthouse + a PWA installability/offline check. |

> **HTTPS / localhost requirement.** Service workers and "install" only work in a **secure context** — that means `http://localhost` during development, or **HTTPS** in production. Opening the built files directly from `file://`, or serving over plain `http://` on a LAN IP, will not register the service worker or offer install.

> **npm registry note.** This project ships a local `.npmrc` pinning the **public** npm registry (`registry.npmjs.org`). Keep it — it avoids picking up a corporate/CodeArtifact registry from your global npm config.

---

## Install as an app

First load the site over HTTPS (or `localhost`). Then:

- **Desktop (Chrome/Edge):** click the **install icon** in the address bar (or use the **Install app** button on the home screen). The game opens in its own standalone window.
- **Android (Chrome):** tap the **Install app** button on the home screen, or use **⋮ → Install app / Add to Home screen**.
- **iOS (Safari):** tap **Share** → **Add to Home Screen**. (iOS has no automatic install prompt, so the app shows this guidance on the home screen.) Launch from the new icon for a full-screen, browser-chrome-free experience.

Once installed, it launches full-screen (no address bar), respects notches / the home indicator (safe-area insets), and plays offline.

---

## Architecture

Clean separation between a **pure, framework-free game core** and a thin **presentation/platform layer** — the core has no DOM dependency and is fully unit-tested.

```
src/
  core/       # PURE game logic (no DOM): types, shapes, rng, board, pieces, scoring, levels, game engine
  ui/         # DOM rendering: board, tray, HUD, screens
  input/      # drag-and-drop (Pointer Events) + keyboard placement controllers
  platform/   # localStorage (high score, level progress, settings, stats, intro flag), haptics, sound (WebAudio), install controller
  styles/     # wood theme tokens + in-game styles
  app.ts      # orchestrator: wires the engine's events to the views
scripts/      # icon generation + Lighthouse runner
```

- **Stack:** TypeScript + Vite + Vitest, `vite-plugin-pwa` (Workbox) for the manifest + service worker.
- **Rendering:** the board, pieces, and UI are DOM elements animated with GPU-friendly CSS `transform`/`opacity` (60fps drag); a single transparent `<canvas>` overlay is used **only** for the decorative line-clear particle burst.
- **Engine:** an immutable reducer — `applyMove(state, move)` returns a new state plus semantic events (`placed`, `cleared`, `scored`, `combo`, `refill`, `gameover`, `levelcomplete`, `levelfailed`) that the UI animates and announces. A seedable RNG makes piece generation and level layouts deterministic for tests.
- **Persistence:** all in `localStorage` through fail-safe (never-throw) wrappers — high score (`wbp.v1.highscore`), Levels progress (`wbp.v1.level`), settings (`wbp.v1.settings`), stats (`wbp.v1.stats`), and the first-run intro flag (`wbp.v1.seenIntro`).
- **Accessibility:** the board is an ARIA `grid` of labeled `gridcell`s, tray pieces are focusable labeled buttons, a full keyboard placement path mirrors the pointer flow, and an `aria-live` region announces scores, clears/streaks, and level/game-over outcomes.

---

## What's verified — automatically vs. manually

**Automated (in this repo):**

- ✅ **Unit tests** — the full suite (run `npm test`) covers the core, platform, and pure UI/input helpers (placement validation, line clearing, scoring + streak multiplier, game-over/level-complete/level-failed detection including a refill-into-dead-end case, level generation determinism + count floor, piece generation, RNG determinism, storage safety for all persisted blobs, the audio mute/unavailable gate, the keyboard `clampOrigin` + pickup/drop path, and `describePiece` labels).
- ✅ **Type safety** — strict `tsc --noEmit` passes.
- ✅ **Lighthouse + PWA check** (`npm run lighthouse`) on the production build via headless Chrome.

  - **Installability:** ✅ PASS — verified on the current build (every run): valid installable manifest (name, `start_url`, `standalone`, 192 + 512 + maskable icons) and a reachable service worker.
  - **Offline:** ✅ PASS — verified on the current build: **15 assets precached** (HTML, JS, CSS, icons), so the app loads and plays with no network.
  - **Category scores:**

    | Category | Score |
    | --- | --- |
    | Performance | **100** |
    | Best Practices | **96** |
    | Accessibility | **93** |
    | SEO | **91** |

  > Note: Lighthouse **≥ 12 removed the dedicated "PWA" category** and its installability/offline audits. This project therefore verifies installability + offline **explicitly** against the served build (the same criteria the old audits used) and reports the standard Lighthouse category scores. Re-run `npm run lighthouse` locally for fresh numbers. See `scripts/run-lighthouse.mjs`.

  > **Deliberate accessibility tradeoff:** the viewport is set with `maximum-scale=1, user-scalable=no` to disable pinch-zoom and give the installed game a native, non-scrolling feel. This is an intentional choice for a full-screen game (Lighthouse/axe may flag it), and it's offset by full keyboard play and ARIA labeling.

**Requires a real device / manual check (can't be automated headlessly):**

- **iOS install** — Safari → Share → *Add to Home Screen*, then confirm standalone launch, status bar, and offline play (needs a Mac + iPhone). Note: iOS only shows a custom launch image when it matches the device's exact dimensions via per-size media queries; with the single generic `apple-touch-startup-image` here, most devices simply show the `background_color` on launch rather than the splash art.
- **On-device install & offline** on Android/desktop — install, go offline (airplane mode / DevTools → Network → Offline), relaunch, and confirm it still plays.
- **Interactive drag-and-drop feel** — 60fps dragging, valid/invalid preview, snap/return, and haptics on supported hardware. (The *logic* behind drops is unit-tested; the touch interaction itself is a manual check.)

---

## Deployment

A ready-to-use GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and publishes to **GitHub Pages** on every push to `main`.

**One-time setup:**

1. Create a GitHub repo and push this project to the `main` branch.
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Push to `main`. The workflow builds and deploys; the live URL appears in the workflow's **deploy** job and under **Settings → Pages**.

**Base path (important):**

- For a **project-site** repo (the common case), the site is served at `https://<user>.github.io/<repo>/`. The workflow automatically builds with `VITE_BASE=/<repo>/`, so all asset URLs, the service-worker scope, and the manifest `start_url` line up. No manual change needed.
- For a **user-site** repo named `<user>.github.io` (served at the domain root) or a **custom domain**, edit the workflow's `VITE_BASE` to `/`.

Locally, the base defaults to `/` — `npm run dev/build/preview/lighthouse` all work without setting anything.

---

## License

Personal project — do as you like.
