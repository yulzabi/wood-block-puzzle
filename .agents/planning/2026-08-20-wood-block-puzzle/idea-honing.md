# Idea Honing: Wood Block Puzzle (PWA)

Requirements clarification Q&A. Each entry captures a single question and the user's final decision.

## Q1: Tech stack — language, build tool, and test framework?

The prompt leaves the exact stack open ("TypeScript or vanilla JS", build tooling unspecified). The choice shapes the whole project skeleton. Options considered:

- **TypeScript + Vite + Vitest (recommended):** Type safety for game logic, instant dev server with HMR, `vite build` outputs static files, `vite-plugin-pwa` handles manifest + service worker generation. Vitest reuses the Vite config for fast unit tests. Minimal, pinned deps.
- **Vanilla JS + Vite + Vitest:** No TS build step in the sense of types, still modern tooling. Less safety for the logic layer.
- **Zero-tooling (plain HTML/CSS/JS, no bundler):** Simplest possible; hand-write the service worker and manifest. No build step, but no HMR, no TS, manual asset management.

**Answer:** TypeScript + Vite + Vitest. Type-safe game logic, Vite dev server + static build, `vite-plugin-pwa` for the manifest/service worker, Vitest for unit tests. Dependencies kept minimal and pinned.

## Q2: Board rendering — DOM elements or `<canvas>`?

The prompt says to pick whichever gives smoother drag animations and justify it. Options:

- **DOM elements (recommended):** Board cells and blocks are styled `<div>`s. Drag preview and the dragged piece are separate DOM layers moved with CSS `transform: translate3d(...)` (GPU-composited, 60fps). Pros: trivial to get warm wood gradients/shadows/rounded corners with CSS, easy hit-testing via grid math, accessible, animations via CSS transitions/keyframes. Cons: many nodes (64 cells + pieces) — fine at this scale.
- **`<canvas>`:** Draw everything imperatively each frame. Pros: full control, one element. Cons: must hand-roll all visual polish (shadows, rounded blocks, text), hit-testing, and animations; harder to make it look "tactile" and accessible; more code for the same result at 8×8 scale.

**Answer:** DOM + CSS transforms for the board, pieces, UI, and all core animations. Reserve an *optional* transparent `<canvas>` overlay for line-clear particle effects only (a later polish extra, not part of the core loop). This is the "justify briefly" decision the prompt calls for, and it will be stated explicitly in the design.

## Q3: Exact scoring formula?

The prompt specifies "points per placed cell + line-clear bonus, with a larger combo bonus for multiple simultaneous clears" but leaves the numbers open. Options (all include **+1 point per placed cell**):

- **Triangular combo bonus (recommended):** clearing `k` lines at once awards `10 × k(k+1)/2` → 1 line = 10, 2 = 30, 3 = 60, 4 = 100. Strongly rewards setting up multi-line clears; simple, deterministic, easy to unit-test.
- **Flat per line:** each cleared line = 10 points, no simultaneity bonus (2 lines = 20). Simplest; doesn't reward combos as the prompt asks, so weaker fit.
- **Consecutive-placement streak multiplier (Block Blast style):** a running combo that grows when consecutive placements each clear ≥1 line, resets when a placement clears nothing. More engaging but more state and harder to test — better as an optional extra on top of the recommended base.

**Answer:** Triangular combo bonus. **+1 point per placed cell**, plus a line-clear bonus of `10 × k(k+1)/2` where `k` = lines cleared simultaneously (1→10, 2→30, 3→60, 4→100). Rows and columns both count toward `k`.

## Q4: Piece generation — how are the 3 tray pieces selected each round?

The prompt says pieces are "randomly selected each round from a defined shape set." The selection policy controls difficulty and how often the game ends. Options:

- **Uniform random (recommended — faithful to prompt):** each of the 3 pieces drawn independently and uniformly from the shape set. No solvability guarantee; the game can end on an unlucky draw, exactly like the classic genre. Simplest, most testable (seedable RNG).
- **Weighted random:** bias toward smaller / more flexible shapes to soften difficulty; still no guarantee. More tuning knobs.
- **Guaranteed-placeable refill:** when generating a new set of 3, ensure at least one of them fits somewhere on the current board (re-roll otherwise). Reduces "instant dead" refills and feels kinder; still allows game-over mid-set after 1–2 placements. Slightly more logic, fully testable.

**Answer:** Uniform random — each of the 3 pieces drawn independently and uniformly from the shape set via a seedable RNG (seedable for deterministic unit tests). No solvability guarantee; game can end on an unlucky draw, faithful to the genre and the prompt.

## Q5: Layout across form factors (mobile portrait vs desktop browser)?

The prompt requires portrait orientation, full-viewport fill, and safe-area insets — clearly mobile-first. But it also "runs locally on a computer browser," where a full-width portrait game looks awkward. Options:

- **Centered portrait app-frame (recommended):** on phones the game fills the viewport (safe-area aware). On wider/desktop screens it renders as a phone-like portrait column with a capped max-width, centered on a warm wood backdrop — so it reads as "the app" everywhere. One layout, minimal extra work.
- **Fully responsive (portrait + landscape):** in landscape, board and tray sit side-by-side and scale to fill. Best use of desktop space but noticeably more layout/CSS and testing.
- **Portrait-only, mobile-first:** target portrait only; on desktop just center and fit-to-height, no special landscape handling. Simplest, but desktop feels like a tall strip.

**Answer:** Centered portrait app-frame. Phones: full-viewport, safe-area aware. Desktop/wide screens: a phone-like portrait column with a capped max-width, centered on a warm wood backdrop. Single layout that reads as "the app" everywhere.

## Q6: Persistence scope (localStorage)?

The prompt requires a persisted high score. The open question is whether to persist more for a stronger native-app feel. Options:

- **High score only (recommended — faithful to prompt):** persist the high score; every launch starts a fresh game. Minimal state, simplest to test.
- **High score + resume in-progress game:** also serialize board state, current tray, and current score so relaunching resumes exactly where you left off (very native-app feel). Adds save/load logic and serialization tests; also a natural "undo" foundation.
- **High score + settings only:** persist high score plus user preferences (sound/haptics on-off), but not the in-progress board.

**Answer:** High score only. Persist the high score in localStorage; each launch starts a fresh game. Resume-in-progress and settings persistence are noted as optional extras.

## Q7: Verification & acceptance criteria (given no iOS device/simulator in this environment)?

The prompt's Process section asks to run tests, verify playability in a browser, and verify PWA installability/offline (reporting the Lighthouse result). Real on-device iOS "Add to Home Screen" install can only be verified manually on a Mac + iPhone/Safari. What should the plan target? Options:

- **Unit tests + automated Lighthouse + documented manual (recommended):** Vitest unit tests for all core logic (placement, line clearing, scoring, game-over, piece gen); a scripted headless-Chrome Lighthouse run reporting the PWA/installability/offline result; and README-documented manual steps for the parts that need real devices (iOS Add-to-Home-Screen, on-device install/offline). Honest about what's automated vs. manual.
- **Unit tests only:** core-logic unit tests; PWA/Lighthouse/install verification described as manual steps only, no automation wired up. Leanest.
- **Unit + Lighthouse + Playwright E2E:** add end-to-end browser tests (drag-drop placement, line clear, game-over, install affordance) on top. Highest confidence, heavier deps/setup and slower.

**Answer:** Unit tests + automated Lighthouse + documented manual steps. Vitest unit tests cover all core logic; a scripted headless-Chrome Lighthouse run reports PWA installability/offline; the README documents the device-only manual checks (iOS Add-to-Home-Screen, on-device install/offline). The plan will be explicit about what is automated vs. verified manually.

---

## Items to be defined in the design (not blocking questions — flag if you want any as an explicit decision)

- **Concrete shape set:** the full polyomino list (1–5 cells: single; dominoes; lines of 2–5; 2×2; 3×3; L/J/T/S/Z tri- and tetrominoes; corners) will be enumerated in the design for review.
- **Icon/splash assets:** placeholder wood-themed icons generated from a small SVG source at build time into all required PNG sizes (maskable + apple-touch), plus theme/background colors.
- **Optional extras (deferred):** sound effects, haptics tuning, combo streaks, undo, resume-in-progress, additional themes, and the canvas particle overlay are out of the core scope and will be listed as post-core suggestions.

