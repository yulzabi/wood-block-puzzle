# 0005 — Centered portrait app-frame layout

**Status:** Accepted

## Context

The game must feel like a native app on phones (full-viewport, safe-area aware) while also running in desktop browsers, where a full-width portrait game would look awkward.

## Decision

Render inside a **phone-like portrait app-frame**: on phones it fills the viewport (safe-area aware); on wider/desktop screens it scales up with viewport height (`dvh`-based) but stays a centered portrait column capped at a max width. A single layout, no landscape mode in core scope.

## Consequences

- Reads as "the app" on every screen size; the board sizes to the frame width and reads its live rect (so drag geometry stays correct at any size).
- On very wide desktops there is intentional side margin (a centered column).
- A landscape / "fill-the-window" desktop layout (backlog **X-LAYOUT**) would revisit this ADR.
