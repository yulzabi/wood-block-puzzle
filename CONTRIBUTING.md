# Contributing

Thanks for helping improve **Wood Block Puzzle** — a dependency-light, offline-capable PWA block puzzle.

## Prerequisites

- **Node ≥ 24** (enforced via `package.json` `engines`).
- npm. The repo ships a local `.npmrc` pinning the public registry, so `npm install` works regardless of any global registry config.

## Setup

```bash
npm install
npm run dev        # Vite dev server (hot reload)
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` (static) |
| `npm run preview` | Serve the built `dist/` |
| `npm test` | Run the unit suite (Vitest, single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Unit suite with coverage + thresholds |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run icons` | Regenerate wood-themed icons + splashes into `public/icons/` |
| `npm run lighthouse` | Build, serve, and run Lighthouse + a PWA installability/offline check |

## Architecture at a glance

- `src/core/` — **pure, DOM-free game logic** (board, shapes, piece generation, scoring + streak, level generation, and a reducer-style `GameEngine` that returns new state + an event stream). Fully unit-tested; keep it pure and deterministic (RNG state lives in `GameState`).
- `src/platform/` — thin browser wrappers (storage, haptics, audio, install), each a no-op when its API is unavailable.
- `src/ui/` — DOM rendering (board, tray, HUD, screens/overlays, particles).
- `src/input/` — pointer drag + keyboard placement controllers.
- `src/app.ts` — orchestrator wiring core ↔ views ↔ input ↔ platform.

## Testing

- Pure logic runs in the `node` environment; DOM/component tests use `happy-dom` via the `*.dom.test.ts` filename convention.
- Add or update tests alongside any behavior change. Core/platform carry high coverage thresholds — see `vite.config.ts`.

## Pull requests

- CI (`.github/workflows/ci.yml`) runs **typecheck + test + build** on every PR; `main` additionally deploys via `.github/workflows/deploy.yml`. Keep the tree green.
- After changing dependencies, build config, or the icon/Lighthouse scripts, run `npm run lighthouse` locally — its SW-precache read and Lighthouse category iteration are the spots most likely to break on a tool bump.

## Decisions

Deliberate, load-bearing choices are recorded as ADRs in [`docs/adr/`](docs/adr/). Read them before reversing something that looks "wrong" — e.g. high-score-only persistence, DOM (not canvas) rendering, uniform-random pieces, and prompt-based (not silent) service-worker updates.
