# 0003 — Uniform-random piece selection

**Status:** Accepted

## Context

Each round deals 3 tray pieces from a fixed shape set. Selection policy controls difficulty and how often a game ends: uniform random, weighted toward easy shapes, or a guaranteed-solvable refill.

## Decision

Draw each of the 3 pieces **independently and uniformly** from the shape set, via a **seedable RNG whose state lives in `GameState`** (so runs are deterministic and unit-testable). There is **no weighting and no guaranteed-placeable refill** — an unlucky deal can end the game, exactly like the classic genre.

## Consequences

- Faithful to 1010!/Block Blast!; simple and deterministic (seeded per level for Levels/Daily).
- Game-over is a genuine possibility on refill (there's a test for the refill-into-dead-end case).
- If difficulty tuning is needed, prefer adjusting the shape set or level pre-fill (see **G-LEVELTUNE**) over changing this selection policy; weighting/guaranteed-solvable would supersede this ADR.
