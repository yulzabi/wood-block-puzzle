/**
 * Piece generation (pure).
 *
 * Draws pieces uniformly at random from the shape set, threading the seedable
 * RNG state so generation is fully reproducible in tests. On gem-goal levels,
 * `attachGems` then rides gems onto some of those pieces, draining the level's
 * supply gradually as trays are dealt.
 */

import type { Board, Piece } from './types';
import { MATERIAL_COUNT } from './types';
import { hasAnyPlacement } from './board';
import { SHAPES } from './shapes';
import { nextInt } from './rng';

/**
 * Per-piece chance (percent) that a freshly-dealt piece carries a gem, when the
 * level still has gems to supply. Kept modest so gems trickle in across the
 * level rather than dumping onto the first tray. Tunable.
 */
const GEM_DEAL_PERCENT = 50;

/**
 * Draw `count` pieces uniformly from SHAPES, assigning each a random material
 * (1..MATERIAL_COUNT) and a unique id. Returns the drawn pieces plus the
 * advanced RNG state and the next id sequence value.
 */
export function generatePieces(
  rngState: number,
  startSeq: number,
  count: number,
): { pieces: Piece[]; rngState: number; nextSeq: number } {
  const pieces: Piece[] = [];
  let state = rngState;
  let seq = startSeq;

  for (let i = 0; i < count; i++) {
    const shapePick = nextInt(state, SHAPES.length);
    state = shapePick.state;
    const shape = SHAPES[shapePick.value]!;

    const materialPick = nextInt(state, MATERIAL_COUNT);
    state = materialPick.state;
    const material = materialPick.value + 1; // 1..MATERIAL_COUNT

    pieces.push({ id: `p-${seq}`, shape, material, placed: false });
    seq++;
  }

  return { pieces, rngState: state, nextSeq: seq };
}

/**
 * True iff at least one UNPLACED piece in `tray` has a legal placement on
 * `board` (reuses the board's `hasAnyPlacement`). Already-placed pieces are
 * ignored — they cannot rescue a stuck hand. Pure.
 */
export function trayHasPlacement(board: Board, tray: readonly Piece[]): boolean {
  return tray.some((p) => !p.placed && hasAnyPlacement(board, p.shape));
}

/**
 * Draw an OPENING tray that is guaranteed to have a legal move against `board`
 * (the solvability guarantee): if the drawn hand fits nowhere, re-draw —
 * advancing the seeded RNG and the id sequence each time — until one fits or the
 * retry cap is hit. Deterministic: a given `(board, rngState, startSeq)` always
 * yields the same final tray, since the re-draws are part of the seeded
 * sequence. Terminates unconditionally: on the (pathological) full board where
 * nothing can fit, it returns the last draw after `retryLimit` re-draws rather
 * than looping forever. Endless/score levels open on roomy boards, so this
 * almost always returns the first draw unchanged.
 */
export function generateSolvableTray(
  board: Board,
  rngState: number,
  startSeq: number,
  count: number,
  retryLimit = 20,
): { pieces: Piece[]; rngState: number; nextSeq: number } {
  let draw = generatePieces(rngState, startSeq, count);
  let attempts = 0;
  while (!trayHasPlacement(board, draw.pieces) && attempts < retryLimit) {
    draw = generatePieces(draw.rngState, draw.nextSeq, count);
    attempts++;
  }
  return draw;
}

/** Total gems remaining across all colors. */
function totalRemaining(supply: Record<number, number>): number {
  let n = 0;
  for (const v of Object.values(supply)) n += v;
  return n;
}

/**
 * Pick a color from `supply` weighted by its remaining count (colors iterate in
 * ascending order, so the choice is deterministic). Caller guarantees the total
 * is positive. Returns the chosen color and the advanced RNG state.
 */
function pickWeightedColor(
  supply: Record<number, number>,
  rngState: number,
): { color: number; state: number } {
  const total = totalRemaining(supply);
  const roll = nextInt(rngState, total);
  let acc = 0;
  for (const [color, n] of Object.entries(supply)) {
    acc += n;
    if (roll.value < acc) return { color: Number(color), state: roll.state };
  }
  // Unreachable when total > 0; return the last color defensively.
  const keys = Object.keys(supply);
  return { color: Number(keys[keys.length - 1]), state: roll.state };
}

/**
 * Ride gems onto freshly-dealt pieces, draining `supply` per color. Each piece
 * has a `GEM_DEAL_PERCENT` chance to carry a single gem (on one of its shape
 * cells) whose color is drawn weighted by remaining supply; a piece may end up
 * with zero gems. Never deals more of a color than remains — supply is
 * decremented as gems are dealt (on deal, not on clear). Pure + deterministic:
 * threads the RNG and returns a fresh `supplyRemaining` without mutating input.
 */
export function attachGems(
  pieces: readonly Piece[],
  rngState: number,
  supply: Record<number, number>,
): { pieces: Piece[]; rngState: number; supplyRemaining: Record<number, number> } {
  let state = rngState;
  const remaining: Record<number, number> = { ...supply };
  const out: Piece[] = [];

  for (const piece of pieces) {
    if (totalRemaining(remaining) <= 0) {
      out.push(piece); // nothing left to deal
      continue;
    }
    const roll = nextInt(state, 100);
    state = roll.state;
    if (roll.value >= GEM_DEAL_PERCENT) {
      out.push(piece); // this piece stays gemless
      continue;
    }

    const picked = pickWeightedColor(remaining, state);
    state = picked.state;
    const cellPick = nextInt(state, piece.shape.cells.length);
    state = cellPick.state;

    remaining[picked.color] = (remaining[picked.color] ?? 0) - 1;
    out.push({ ...piece, gems: { [cellPick.value]: picked.color } });
  }

  return { pieces: out, rngState: state, supplyRemaining: remaining };
}
