import { describe, expect, it } from 'vitest';
import { pointToCell, type GridMetrics } from './board-view';

// 8 cells of 20px with a 4px gap, board origin at (100, 200).
const m: GridMetrics = { left: 100, top: 200, cell: 20, gap: 4, size: 8 };
const step = m.cell + m.gap; // 24

describe('pointToCell', () => {
  it('maps the top-left of cell (0,0)', () => {
    expect(pointToCell(m, 100, 200)).toEqual({ row: 0, col: 0 });
  });

  it('maps a point inside a mid-grid cell', () => {
    // col 3, row 2 -> starts at (100+3*24, 200+2*24) = (172, 248)
    expect(pointToCell(m, 172 + 5, 248 + 5)).toEqual({ row: 2, col: 3 });
  });

  it('maps the last cell (7,7)', () => {
    const x = m.left + 7 * step + 1;
    const y = m.top + 7 * step + 1;
    expect(pointToCell(m, x, y)).toEqual({ row: 7, col: 7 });
  });

  it('returns null left/above the grid', () => {
    expect(pointToCell(m, 99, 250)).toBeNull();
    expect(pointToCell(m, 150, 199)).toBeNull();
  });

  it('returns null past the last row/col', () => {
    const past = m.left + 8 * step + 1;
    expect(pointToCell(m, past, 250)).toBeNull();
    expect(pointToCell(m, 150, m.top + 8 * step + 1)).toBeNull();
  });

  it('returns null when the step is degenerate', () => {
    expect(pointToCell({ ...m, cell: 0, gap: 0 }, 100, 200)).toBeNull();
  });

  it('treats a point in the trailing gap as still belonging to the cell', () => {
    // 22px into col 0's 24px step is within the gap after the 20px cell.
    expect(pointToCell(m, 100 + 22, 200 + 1)).toEqual({ row: 0, col: 0 });
  });
});
