# 0006 — Resume in-progress game

**Status:** Superseded by [0007](0007-per-context-resume.md) — resume moved from a single shared slot to two per-context slots (Endless + Levels). The core decision (persist & resume the in-progress game, reversing [0001](0001-high-score-only-persistence.md)'s no-persistence clause) still holds; only the slot model + entry points changed. Kept for history.

## Context

[0001](0001-high-score-only-persistence.md) deliberately persisted only lightweight meta and started every launch with a fresh game. In practice that meant an accidental reload, an iOS app-switch, or a service-worker "Refresh" ([0004](0004-prompt-service-worker-updates.md)) silently discarded the current game — the last real "feels like a real app" gap. Backlog item **G-RESUME** called for revisiting this once `GameState` was serializable.

`GameState` is a plain object plus a seedable RNG counter, so a snapshot is mechanical: the only non-JSON fields are the `Uint8Array` `board` + `gems` channels, which round-trip via `Array.from` / `Uint8Array.from`.

## Decision

Persist the full in-progress `GameState` under a versioned key (`wbp.v1.save`) so a game resumes exactly where it left off:

- Save after each committed move, on entering a game (overwriting any stale save), and on backgrounding (`visibilitychange` → hidden, and `pagehide`).
- Clear the save only on true end-states — game-over, level-complete, level-failed — so a finished game is never resumable. Leaving to the menu (in-game "← Menu") is a **pause**, not an abandon: the save is kept and Continue picks it back up. Starting any new game overwrites the save.
- Restore `rngState` verbatim (no re-seed) so the piece sequence continues deterministically.
- Home shows **Continue** only when a valid `status: 'playing'` save exists (no dead button otherwise).
- On a schema-version mismatch, or any corrupt/missing/invalid field, the save is discarded rather than half-restored — never-throw, matching the rest of `storage.ts`.

## Consequences

- The lightweight meta persistence from [0001](0001-high-score-only-persistence.md) (high score, Levels progress, settings, stats, seen-intro) is unchanged; only its "the in-progress board/tray/score is NOT persisted" clause is reversed.
- Serialization now tracks the `GameState` shape: new state fields must be added to the save/validate path, and the schema version must bump on an incompatible change (old blobs are then discarded, not migrated).
- One `localStorage` write per move (plus on backgrounding); acceptable for a small board, no debounce needed.
