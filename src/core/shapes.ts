/**
 * The shape set the game draws from.
 *
 * No rotation: each orientation we want in play is a distinct entry. Shapes are
 * pure data — balance changes need only edits here, no logic changes.
 */

import type { Coord, Shape } from './types';

/**
 * Build a normalized Shape from raw `(row, col)` offsets: the bounding box is
 * shifted so its top-left is `(0, 0)`, and `size`/`width`/`height` are derived
 * from the cells so they can never silently desync from the data.
 */
export function makeShape(id: string, offsets: readonly [number, number][]): Shape {
  if (offsets.length === 0) {
    throw new Error(`Shape "${id}" must have at least one cell`);
  }
  let minRow = Infinity;
  let minCol = Infinity;
  for (const [r, c] of offsets) {
    if (r < minRow) minRow = r;
    if (c < minCol) minCol = c;
  }
  const cells: Coord[] = offsets.map(([r, c]) => ({ row: r - minRow, col: c - minCol }));

  let maxRow = 0;
  let maxCol = 0;
  const seen = new Set<string>();
  for (const { row, col } of cells) {
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
    const key = `${row},${col}`;
    if (seen.has(key)) {
      throw new Error(`Shape "${id}" has a duplicate cell at (${row}, ${col})`);
    }
    seen.add(key);
  }

  return {
    id,
    cells,
    size: cells.length,
    width: maxCol + 1,
    height: maxRow + 1,
  };
}

/** The full, ordered shape set (drawn from uniformly). */
export const SHAPES: readonly Shape[] = [
  // Monomino
  makeShape('single', [[0, 0]]),

  // Dominoes
  makeShape('line2-h', [[0, 0], [0, 1]]),
  makeShape('line2-v', [[0, 0], [1, 0]]),

  // Lines 3-5
  makeShape('line3-h', [[0, 0], [0, 1], [0, 2]]),
  makeShape('line3-v', [[0, 0], [1, 0], [2, 0]]),
  makeShape('line4-h', [[0, 0], [0, 1], [0, 2], [0, 3]]),
  makeShape('line4-v', [[0, 0], [1, 0], [2, 0], [3, 0]]),
  makeShape('line5-h', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]),
  makeShape('line5-v', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]),

  // Squares
  makeShape('square2', [[0, 0], [0, 1], [1, 0], [1, 1]]),
  makeShape('square3', [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ]),

  // Small corners / L-tromino (3 cells), 4 orientations
  makeShape('corner-tl', [[0, 0], [0, 1], [1, 0]]),
  makeShape('corner-tr', [[0, 0], [0, 1], [1, 1]]),
  makeShape('corner-bl', [[0, 0], [1, 0], [1, 1]]),
  makeShape('corner-br', [[0, 1], [1, 0], [1, 1]]),

  // Big corners / L-pentomino (5 cells), 4 orientations
  makeShape('bigL-tl', [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]),
  makeShape('bigL-tr', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]),
  makeShape('bigL-br', [[2, 0], [2, 1], [2, 2], [0, 2], [1, 2]]),
  makeShape('bigL-bl', [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]),

  // T-tetromino (4 cells), 4 orientations
  makeShape('T-up', [[0, 0], [0, 1], [0, 2], [1, 1]]),
  makeShape('T-down', [[1, 0], [1, 1], [1, 2], [0, 1]]),
  makeShape('T-left', [[0, 1], [1, 0], [1, 1], [2, 1]]),
  makeShape('T-right', [[0, 0], [1, 0], [1, 1], [2, 0]]),

  // S / Z (4 cells), horizontal + vertical
  makeShape('S-h', [[1, 0], [1, 1], [0, 1], [0, 2]]),
  makeShape('S-v', [[0, 0], [1, 0], [1, 1], [2, 1]]),
  makeShape('Z-h', [[0, 0], [0, 1], [1, 1], [1, 2]]),
  makeShape('Z-v', [[0, 1], [1, 0], [1, 1], [2, 0]]),

  // J / L tetromino (4 cells)
  makeShape('J4', [[0, 1], [1, 1], [2, 1], [2, 0]]),
  makeShape('L4', [[0, 0], [1, 0], [2, 0], [2, 1]]),
];
