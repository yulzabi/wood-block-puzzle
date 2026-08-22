# 0001 — High-score-only persistence

**Status:** Accepted — the meta-persistence stands, but the "in-progress game is NOT persisted" clause is superseded by [0007](0007-per-context-resume.md) (via [0006](0006-resume-in-progress-game.md)).

## Context

The game is a casual, offline PWA. We had to decide how much state survives a reload/close: nothing, just the high score, or the full in-progress game.

## Decision

Persist only lightweight meta in `localStorage` (versioned keys): the high score, the current Levels progress, settings, aggregate stats, and the "seen intro" flag. **The in-progress board/tray/score is intentionally NOT persisted** — every launch starts a fresh game.

## Consequences

- Minimal, trivially-testable persisted state; no serialization of the `Uint8Array` board.
- A reload (including a service-worker update) discards the current game — an accepted trade-off, mitigated by prompt-based SW updates ([0004](0004-prompt-service-worker-updates.md)) and the in-game quit-confirm.
- Adding "resume in-progress game" (backlog item **G-RESUME**) would revisit this ADR and requires serializing `GameState` (board/gems need `Array.from` round-trips). **Implemented — see [0007](0007-per-context-resume.md) (per-context resume), which supersedes this clause.**
