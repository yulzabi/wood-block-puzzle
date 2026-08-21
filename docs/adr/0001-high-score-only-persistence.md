# 0001 — High-score-only persistence

**Status:** Accepted

## Context

The game is a casual, offline PWA. We had to decide how much state survives a reload/close: nothing, just the high score, or the full in-progress game.

## Decision

Persist only lightweight meta in `localStorage` (versioned keys): the high score, the current Levels progress, settings, aggregate stats, and the "seen intro" flag. **The in-progress board/tray/score is intentionally NOT persisted** — every launch starts a fresh game.

## Consequences

- Minimal, trivially-testable persisted state; no serialization of the `Uint8Array` board.
- A reload (including a service-worker update) discards the current game — an accepted trade-off, mitigated by prompt-based SW updates ([0004](0004-prompt-service-worker-updates.md)) and the in-game quit-confirm.
- Adding "resume in-progress game" (backlog item **G-RESUME**) would revisit this ADR and requires serializing `GameState` (board/targets need `Array.from` round-trips) — supersede this record if implemented.
