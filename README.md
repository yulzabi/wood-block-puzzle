# 🌳 Wood Block Puzzle

A cozy, wood-themed **block-placement puzzle** (in the spirit of *1010!* / *Block Blast!*), built as an **installable Progressive Web App**. It runs in any modern desktop browser, installs to the home screen on iOS and Android, and — after the first load — works **fully offline**. No backend, no ads, no accounts, no tracking.

Live demo: `https://<user>.github.io/<repo>/` *(fill in after deploying — see [Deployment](#deployment))*

---

## How to play

- The board is an **8×8 grid**. Below it, a **tray of 3 pieces** (wood-block polyominoes — singles, lines, squares, L/T/S/Z shapes).
- **Drag** a piece onto the board. It only fits where all its cells land on empty cells (a green preview means valid, red means blocked). Pieces **don't rotate**.
- Fill a **whole row or column** (all 8 cells) to **clear** it. Clear **several lines at once** for a big bonus.
- **Scoring:** `+1` per placed cell, plus a line-clear bonus of `10 × k(k+1)/2` for `k` lines cleared at once → **1 line = 10, 2 = 30, 3 = 60, 4 = 100**.
- When the tray empties, you get **3 new pieces**.
- **Game over** when none of your 3 pieces fit anywhere. Your **high score** is saved on your device.

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
  core/       # PURE game logic (no DOM): types, shapes, rng, board, pieces, scoring, game engine
  ui/         # DOM rendering: board, tray, HUD, screens
  input/      # Pointer-Events drag-and-drop controller
  platform/   # localStorage high score, haptics, install controller
  styles/     # wood theme tokens + in-game styles
  app.ts      # orchestrator: wires the engine's events to the views
scripts/      # icon generation + Lighthouse runner
```

- **Stack:** TypeScript + Vite + Vitest, `vite-plugin-pwa` (Workbox) for the manifest + service worker.
- **Rendering:** DOM elements animated with GPU-friendly CSS `transform`/`opacity` (60fps drag; no canvas needed).
- **Engine:** an immutable reducer — `applyMove(state, move)` returns a new state plus semantic events (`placed`, `cleared`, `scored`, `refill`, `gameover`) that the UI animates. A seedable RNG makes piece generation deterministic for tests.

---

## What's verified — automatically vs. manually

**Automated (in this repo):**

- ✅ **Unit tests — 79 passing** across the core + platform (placement validation, line clearing, scoring, game-over detection, piece generation, RNG determinism, storage safety, and the pure drag/geometry helpers). Run `npm test`.
- ✅ **Type safety** — strict `tsc --noEmit` passes.
- ✅ **Lighthouse + PWA check** (`npm run lighthouse`) on the production build via headless Chrome. Latest local result:

  | Category | Score |
  | --- | --- |
  | Performance | **100** |
  | Best Practices | **96** |
  | SEO | **91** |
  | Accessibility | **86** |

  - **Installability:** ✅ PASS — valid installable manifest (name, `start_url`, `standalone`, 192 + 512 + maskable icons) and a reachable service worker.
  - **Offline:** ✅ PASS — **15 assets precached** (HTML, JS, CSS, icons), so the app loads and plays with no network.

  > Note: Lighthouse **≥ 12 removed the dedicated "PWA" category** and its installability/offline audits. This project therefore reports the standard Lighthouse scores **and** verifies installability + offline explicitly against the served build (the same criteria the old audits used). See `scripts/run-lighthouse.mjs`.

**Requires a real device / manual check (can't be automated headlessly):**

- **iOS install** — Safari → Share → *Add to Home Screen*, then confirm standalone launch, status bar, splash, and offline play (needs a Mac + iPhone).
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
