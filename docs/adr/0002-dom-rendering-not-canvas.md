# 0002 — DOM + CSS rendering, not canvas

**Status:** Accepted

## Context

An 8×8 board plus a 3-piece tray needs a renderer that looks tactile (wood gradients, depth, rounded corners), animates placement/clears smoothly at 60fps, is easy to hit-test for drag, and is accessible.

## Decision

Render the board, pieces, HUD, and overlays as **DOM elements animated with CSS transforms/opacity**. Reserve `<canvas>` only for the optional decorative line-clear **particle overlay**.

## Consequences

- Wood theming, shadows, rounded blocks, and transitions come "for free" from CSS; hit-testing is grid math; the board is naturally accessible (ARIA `grid`/`gridcell`).
- ~64 cells + a few pieces is trivial for the DOM; drags move a single GPU-composited layer.
- The particle canvas is decorative only (lazy-mounted, reduced-motion aware, never affects first paint) — see backlog **P-PARTICLESPERF**.
- A full canvas/WebGL renderer was rejected: it would force us to hand-roll all visual polish, text, hit-testing, animation, and accessibility for no benefit at this scale.
