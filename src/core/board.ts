/**
 * Pure board operations over a flat Uint8Array(64).
 *
 * All mutating-looking helpers return a NEW board and never touch their input,
 * so the engine can stay a pure function of its state.
 */

import type { Board, Coord, Shape } from './types';
import { BOARD_SIZE } from './types';

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

/** A fresh, empty board (all zeros). */
export function createBoard(): Board {
  return new Uint8Array(CELL_COUNT);
}

/** Flat index for a `(row, col)`. Assumes in-bounds. */
export function idx(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

/** True iff `(row, col)` is on the board. */
export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Absolute cells a shape would occupy if placed with its origin at `at`. */
function absCells(shape: Shape, at: Coord): Coord[] {
  return shape.cells.map((c) => ({ row: at.row + c.row, col: at.col + c.col }));
}

/** True iff every cell of `shape` placed at `at` is in-bounds and empty. */
export function canPlace(board: Board, shape: Shape, at: Coord): boolean {
  for (const c of shape.cells) {
    const row = at.row + c.row;
    const col = at.col + c.col;
    if (!inBounds(row, col)) return false;
    if (board[idx(row, col)] !== 0) return false;
  }
  return true;
}

/**
 * Returns a NEW board with `shape` written using `material`, plus the absolute
 * cells that were filled. Callers should `canPlace` first; this does not verify.
 */
export function place(
  board: Board,
  shape: Shape,
  at: Coord,
  material: number,
): { board: Board; cells: Coord[] } {
  const next = board.slice();
  const cells = absCells(shape, at);
  for (const { row, col } of cells) {
    next[idx(row, col)] = material;
  }
  return { board: next, cells };
}

/** The full rows and full columns currently on the board. */
export function findFullLines(board: Board): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    let full = true;
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[idx(row, col)] === 0) {
        full = false;
        break;
      }
    }
    if (full) rows.push(row);
  }

  for (let col = 0; col < BOARD_SIZE; col++) {
    let full = true;
    for (let row = 0; row < BOARD_SIZE; row++) {
      if (board[idx(row, col)] === 0) {
        full = false;
        break;
      }
    }
    if (full) cols.push(col);
  }

  return { rows, cols };
}

/**
 * Returns a NEW board with the given rows and columns emptied, plus the distinct
 * cleared cells (row∩column intersections are de-duplicated).
 */
export function clearLines(
  board: Board,
  rows: number[],
  cols: number[],
): { board: Board; cells: Coord[] } {
  const next = board.slice();
  const cells: Coord[] = [];
  const seen = new Set<number>();

  const clearCell = (row: number, col: number): void => {
    const i = idx(row, col);
    next[i] = 0;
    if (!seen.has(i)) {
      seen.add(i);
      cells.push({ row, col });
    }
  };

  for (const row of rows) {
    for (let col = 0; col < BOARD_SIZE; col++) clearCell(row, col);
  }
  for (const col of cols) {
    for (let row = 0; row < BOARD_SIZE; row++) clearCell(row, col);
  }

  return { board: next, cells };
}

/** True iff `shape` can be placed at any position on the board. */
export function hasAnyPlacement(board: Board, shape: Shape): boolean {
  const maxRow = BOARD_SIZE - shape.height;
  const maxCol = BOARD_SIZE - shape.width;
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      if (canPlace(board, shape, { row, col })) return true;
    }
  }
  return false;
}
