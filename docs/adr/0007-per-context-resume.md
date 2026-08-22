# 0007 — Per-context resume (two save slots)

**Status:** Accepted — supersedes the "in-progress game is NOT persisted" clause of [0001](0001-high-score-only-persistence.md), and supersedes [0006](0006-resume-in-progress-game.md) (which resumed via a single slot).

## Context

[0006](0006-resume-in-progress-game.md) added resume, but via one shared save slot (`wbp.v1.save`) surfaced as a Home "Continue" button. That conflated the two modes: starting an Endless game overwrote a paused Level (and vice versa), and a single Home button can't say *which* game it resumes. Players expect Endless and their Levels run to survive independently, and to resume from where they left off (the mode button / the level on the map), not a generic Home button.

## Decision

Persist the in-progress `GameState` in **two independent, per-context slots**, and make resume **contextual**:

- **Slots:** `wbp.v1.save.endless` and `wbp.v1.save.levels` (one shared Levels slot — you resume your current/next level, not a per-level save). `saveGame(state)` routes by `state.mode`; each slot loads/clears independently. The legacy single `wbp.v1.save` key is ignored and cleaned up.
- **Resume entry points (no Home "Continue" button):**
  - **Endless** button → if a resumable Endless save exists, a *Continue / New game* prompt; otherwise start fresh.
  - **Level Map** node → the node matching the saved Levels game offers **Continue**; it also offers **Start over** (one-tap fresh start). Other nodes show Play/Replay.
- **Pause keeps the save:** leaving via the in-game "← Menu" is a **pause** — it saves and does NOT clear, so the game stays resumable. Only true end-states clear the *matching* slot: game-over → Endless slot; level-complete / level-failed → Levels slot. Starting a game fresh (New game / Start over / Play / Replay) overwrites or clears that slot.
- Save timing, serialization, validation, and `rngState`-verbatim restore are unchanged from [0006](0006-resume-in-progress-game.md): save after each move / on enter / on backgrounding; `Uint8Array` channels round-trip via `Array.from` / `Uint8Array.from`; schema-versioned; discard-not-half-restore; never-throw.

## Consequences

- Endless and Levels resume independently — one never clobbers the other. Two slots (bounded), not per-level saves.
- The lightweight meta persistence from [0001](0001-high-score-only-persistence.md) (high score, Levels progress, settings, stats, seen-intro) is unchanged; only its "in-progress board is NOT persisted" clause is reversed.
- New `GameState` fields must be added to the save/validate path; the schema version bumps on an incompatible change (old blobs discarded, not migrated).
