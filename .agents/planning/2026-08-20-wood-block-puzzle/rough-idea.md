# Rough Idea: Wood Block Puzzle (PWA)

Build a "Wood Block Puzzle" game — a casual drag-and-drop block-placement puzzle in the style of the classic wood-themed block puzzle (like 1010! / Block Blast!). Deliver it as an installable Progressive Web App (PWA) that runs locally on a computer browser and installs to the home screen on iOS and Android. It must look and feel like a real native app, not a web page.

## Platform & stack
- Plain HTML5 + CSS + TypeScript (or vanilla JS), no heavy framework required. Render the board with either DOM elements or `<canvas>` — pick whichever gives smoother drag animations and justify the choice briefly.
- Ship a complete PWA: a web app manifest (name, icons in all required sizes, `display: standalone`, theme/background colors, portrait orientation) and a service worker that caches all assets so the game works fully offline after first load.
- No backend, no ads, no accounts, no third-party network calls.
- Provide a simple local dev setup (e.g., `npm install && npm run dev`) and a production build (`npm run build`) that outputs static files. Include instructions to serve it over HTTPS/localhost (required for PWA install and service workers).

## Native-app feel (this is a hard requirement)
- Standalone display: launches without browser chrome (address bar) when installed; add iOS-specific meta tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, apple touch icons) and a splash/launch appearance.
- Full-viewport, app-like layout: fills the screen, respects safe-area insets (notches/home indicator) via `env(safe-area-inset-*)`, no page scrolling or bounce, no text selection or long-press context menus on game elements, no pinch-zoom.
- Touch-first, 60fps interactions: buttery drag-and-drop with pointer events (works for touch + mouse), momentum-free precise dragging, and GPU-friendly CSS transforms for animations. Add subtle haptic feedback on placement/clear where supported (`navigator.vibrate`).
- Polished visuals: warm wood theme, rounded tactile blocks with depth/shadow, smooth animations for placing pieces, clearing lines, score pop-ups, and a game-over transition. Custom app icon and consistent theme color.
- App-like navigation: a start/home screen, in-game view, and game-over overlay — with transitions, not full page reloads.
- Include an "Install app" prompt/affordance (handle `beforeinstallprompt` on Android/desktop; show iOS "Add to Home Screen" guidance since iOS has no programmatic prompt).

## Core gameplay
- Board: 8×8 grid of square cells, wood-themed.
- Pieces: Show 3 pieces at a time in a tray below the board. Pieces are polyomino shapes of 1–5 cells (single, 2×2, 3×3, L/T/S shapes, straight lines of 2–5, etc.), randomly selected each round from a defined shape set. No rotation.
- Placement: Drag a piece onto the grid; it may only be placed if all its cells land on empty cells. Show a live preview highlight while dragging; reject invalid drops and animate the piece back to the tray.
- Refill: When all 3 tray pieces are placed, generate a new set of 3.
- Line clearing: Clear any full row or column (all 8 cells); multiple lines can clear at once.
- Scoring: Points per placed cell + line-clear bonus, with a larger combo bonus for multiple simultaneous clears. Show current score and a persisted high score (localStorage).
- Game over: Ends when none of the 3 current pieces can fit anywhere. Show a Game Over overlay with final score and Restart.

## Technical structure
- Separate game logic (board state, piece generation, placement validation, line clearing, scoring, game-over detection) from rendering/input/PWA plumbing, so logic is unit-testable in isolation.
- Keep dependencies minimal and pinned.

## Deliverables
1. Complete source, runnable locally and buildable to static files.
2. Web app manifest, service worker, and all icon/splash assets (generate placeholder wood-themed icons if none provided).
3. README.md: game rules, local run/build steps, and install instructions for Android (Chrome), iOS (Safari → Add to Home Screen), and desktop.
4. Unit tests for core logic: placement validation, line clearing, scoring, game-over detection.
5. A Lighthouse PWA/installability check — report the score and confirm it passes installability + offline criteria.

## Process
- First outline the data model, file structure, and shape set; then implement incrementally.
- After implementing, run the tests, verify the game is playable in a browser, and verify PWA installability/offline (report exactly what you checked, including the Lighthouse result).
- Deliver the core loop + PWA/native-feel first; only then suggest optional extras (sound effects, combo streaks, undo, additional themes).
