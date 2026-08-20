/**
 * Piece generation (pure).
 *
 * Draws pieces uniformly at random from the shape set, threading the seedable
 * RNG state so generation is fully reproducible in tests.
 */

import type { Piece } from './types';
import { MATERIAL_COUNT } from './types';
import { SHAPES } from './shapes';
import { nextInt } from './rng';

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
