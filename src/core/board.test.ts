import { describe, expect, it } from 'vitest';
import {
  canPlace,
  clearLines,
  createBoard,
  findFullLines,
  firstPlacement,
  hasAnyPlacement,
  idx,
  inBounds,
  linesCompletedBy,
  place,
} from './board';
import { makeShape } from './shapes';
import { BOARD_SIZE } from './types';

const single = makeShape('single', [[0, 0]]);
const square2 = makeShape('square2', [[0, 0], [0, 1], [1, 0], [1, 1]]);
const line5h = makeShape('line5-h', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);

function fillRow(board: Uint8Array, row: number, material = 1): void {
  for (let col = 0; col < BOARD_SIZE; col++) board[idx(row, col)] = material;
}
function fillCol(board: Uint8Array, col: number, material = 1): void {
  for (let row = 0; row < BOARD_SIZE; row++) board[idx(row, col)] = material;
}

describe('inBounds / idx', () => {
  it('accepts on-board cells and rejects off-board ones', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(7, 7)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, -1)).toBe(false);
    expect(inBounds(8, 0)).toBe(false);
    expect(inBounds(0, 8)).toBe(false);
    expect(idx(2, 3)).toBe(19);
  });
});

describe('canPlace', () => {
  it('is true for an empty in-bounds fit', () => {
    const b = createBoard();
    expect(canPlace(b, square2, { row: 0, col: 0 })).toBe(true);
    expect(canPlace(b, square2, { row: 6, col: 6 })).toBe(true);
  });

  it('is false past each edge', () => {
    const b = createBoard();
    expect(canPlace(b, single, { row: -1, col: 0 })).toBe(false); // top
    expect(canPlace(b, single, { row: 0, col: -1 })).toBe(false); // left
    expect(canPlace(b, single, { row: 8, col: 0 })).toBe(false); // bottom
    expect(canPlace(b, single, { row: 0, col: 8 })).toBe(false); // right
    expect(canPlace(b, line5h, { row: 0, col: 4 })).toBe(false); // overruns right edge
    expect(canPlace(b, square2, { row: 7, col: 0 })).toBe(false); // overruns bottom
  });

  it('is false when any target cell is occupied', () => {
    const b = createBoard();
    b[idx(1, 1)] = 3;
    expect(canPlace(b, square2, { row: 0, col: 0 })).toBe(false);
    expect(canPlace(b, single, { row: 1, col: 1 })).toBe(false);
    expect(canPlace(b, single, { row: 2, col: 2 })).toBe(true);
  });
});

describe('place', () => {
  it('returns a new board without mutating the input and writes the material', () => {
    const b = createBoard();
    const res = place(b, square2, { row: 2, col: 3 }, 4);

    // input unchanged
    expect(b.every((v) => v === 0)).toBe(true);
    // new board has exactly the four cells filled with material 4
    expect(res.board[idx(2, 3)]).toBe(4);
    expect(res.board[idx(2, 4)]).toBe(4);
    expect(res.board[idx(3, 3)]).toBe(4);
    expect(res.board[idx(3, 4)]).toBe(4);
    expect(res.board.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)).toBe(4);
    // reports the absolute cells
    expect(res.cells).toHaveLength(4);
    expect(res.cells).toContainEqual({ row: 2, col: 3 });
    expect(res.cells).toContainEqual({ row: 3, col: 4 });
  });
});

describe('findFullLines', () => {
  it('finds nothing on an empty board', () => {
    expect(findFullLines(createBoard())).toEqual({ rows: [], cols: [] });
  });

  it('finds a full row', () => {
    const b = createBoard();
    fillRow(b, 5);
    expect(findFullLines(b)).toEqual({ rows: [5], cols: [] });
  });

  it('finds a full column', () => {
    const b = createBoard();
    fillCol(b, 2);
    expect(findFullLines(b)).toEqual({ rows: [], cols: [2] });
  });

  it('finds several at once', () => {
    const b = createBoard();
    fillRow(b, 0);
    fillRow(b, 7);
    fillCol(b, 3);
    const res = findFullLines(b);
    expect(res.rows).toEqual([0, 7]);
    expect(res.cols).toEqual([3]);
  });

  it('does not flag a nearly-full line', () => {
    const b = createBoard();
    fillRow(b, 4);
    b[idx(4, 4)] = 0; // punch a hole
    expect(findFullLines(b).rows).toEqual([]);
  });
});

describe('clearLines', () => {
  it('empties exactly the given rows and columns, deduping the intersection', () => {
    const b = createBoard();
    fillRow(b, 2, 1);
    fillCol(b, 3, 1);
    b[idx(6, 6)] = 5; // an untouched filled cell elsewhere

    const res = clearLines(b, [2], [3]);

    // 8 + 8 - 1 shared cell (2,3)
    expect(res.cells).toHaveLength(15);
    const keys = res.cells.map((c) => `${c.row},${c.col}`);
    expect(new Set(keys).size).toBe(15);

    // cleared cells are empty; the unrelated cell survives
    expect(res.board[idx(2, 0)]).toBe(0);
    expect(res.board[idx(0, 3)]).toBe(0);
    expect(res.board[idx(2, 3)]).toBe(0);
    expect(res.board[idx(6, 6)]).toBe(5);

    // input untouched
    expect(b[idx(2, 3)]).toBe(1);
  });
});

describe('hasAnyPlacement', () => {
  it('is true on an empty board', () => {
    const b = createBoard();
    expect(hasAnyPlacement(b, square2)).toBe(true);
    expect(hasAnyPlacement(b, line5h)).toBe(true);
  });

  it('is false when the board is completely full', () => {
    const b = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    expect(hasAnyPlacement(b, single)).toBe(false);
  });

  it('is true when a single gap remains for a single cell', () => {
    const b = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    b[idx(4, 4)] = 0;
    expect(hasAnyPlacement(b, single)).toBe(true);
    expect(hasAnyPlacement(b, square2)).toBe(false);
  });
});

describe('firstPlacement', () => {
  it('returns the first legal origin in row-major order', () => {
    const b = createBoard();
    // Empty board: the very first origin scanned is the top-left.
    expect(firstPlacement(b, square2)).toEqual({ row: 0, col: 0 });

    // Block the top-left cell: the scan skips it and takes the next column.
    b[idx(0, 0)] = 1;
    expect(firstPlacement(b, single)).toEqual({ row: 0, col: 1 });
  });

  it('returns null when the shape fits nowhere', () => {
    const full = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    expect(firstPlacement(full, single)).toBeNull();

    // A single gap is too small for a 2x2 square.
    const oneGap = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    oneGap[idx(4, 4)] = 0;
    expect(firstPlacement(oneGap, square2)).toBeNull();
  });

  it('finds the only fit when it sits in a corner (exact-fit-at-edge)', () => {
    // Fill everything, then clear exactly the bottom-right 2x2 so square2 fits
    // in one place only — the corner origin (6,6).
    const b = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    b[idx(6, 6)] = 0;
    b[idx(6, 7)] = 0;
    b[idx(7, 6)] = 0;
    b[idx(7, 7)] = 0;
    expect(firstPlacement(b, square2)).toEqual({ row: 6, col: 6 });
  });
});

describe('linesCompletedBy', () => {
  const LAST = BOARD_SIZE - 1;

  it('reports a single row a valid placement would complete', () => {
    const b = createBoard();
    for (let col = 0; col < LAST; col++) b[idx(0, col)] = 1; // row 0 full except (0, last)
    const res = linesCompletedBy(b, single, { row: 0, col: LAST });
    expect(res.rows).toEqual([0]);
    expect(res.cols).toEqual([]);
  });

  it('reports a row and column completed at once', () => {
    const b = createBoard();
    for (let col = 0; col < LAST; col++) b[idx(0, col)] = 1; // row 0 full except (0, last)
    for (let row = 1; row < BOARD_SIZE; row++) b[idx(row, LAST)] = 1; // col last full except (0, last)
    const res = linesCompletedBy(b, single, { row: 0, col: LAST });
    expect(res.rows).toEqual([0]);
    expect(res.cols).toEqual([LAST]);
  });

  it('reports nothing when the placement completes no line', () => {
    const res = linesCompletedBy(createBoard(), single, { row: 0, col: 0 });
    expect(res.rows).toEqual([]);
    expect(res.cols).toEqual([]);
  });

  it('returns empty for an invalid (overlapping) placement, even over a full-looking line', () => {
    const b = createBoard();
    for (let col = 0; col < BOARD_SIZE; col++) b[idx(0, col)] = 1; // row 0 already occupied
    const res = linesCompletedBy(b, single, { row: 0, col: LAST }); // invalid: cell occupied
    expect(res.rows).toEqual([]);
    expect(res.cols).toEqual([]);
  });

  it('completes multiple rows at once with a multi-row piece', () => {
    const b = createBoard();
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < BOARD_SIZE - 2; col++) b[idx(row, col)] = 1; // rows 0,1 full except last 2 cols
    }
    const res = linesCompletedBy(b, square2, { row: 0, col: BOARD_SIZE - 2 });
    expect(res.rows).toEqual([0, 1]);
    expect(res.cols).toEqual([]);
  });
});
