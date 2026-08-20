import { describe, expect, it } from 'vitest';
import { SHAPES, makeShape } from './shapes';

describe('makeShape', () => {
  it('normalizes offsets so the bounding box starts at (0,0)', () => {
    const s = makeShape('t', [
      [2, 3],
      [2, 4],
      [3, 3],
    ]);
    const keys = s.cells.map((c) => `${c.row},${c.col}`).sort();
    expect(keys).toEqual(['0,0', '0,1', '1,0']);
    expect(s.size).toBe(3);
    expect(s.width).toBe(2);
    expect(s.height).toBe(2);
  });

  it('throws on an empty shape', () => {
    expect(() => makeShape('empty', [])).toThrow();
  });

  it('throws on duplicate cells', () => {
    expect(() => makeShape('dup', [[0, 0], [0, 0]])).toThrow();
  });
});

describe('SHAPES', () => {
  it('has a rich set of pieces', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(25);
  });

  it('has unique ids', () => {
    const ids = SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every shape is normalized with consistent size/width/height and no duplicate cells', () => {
    for (const s of SHAPES) {
      const minRow = Math.min(...s.cells.map((c) => c.row));
      const minCol = Math.min(...s.cells.map((c) => c.col));
      expect(minRow, `${s.id} minRow`).toBe(0);
      expect(minCol, `${s.id} minCol`).toBe(0);

      expect(s.size, `${s.id} size`).toBe(s.cells.length);
      expect(s.width, `${s.id} width`).toBe(Math.max(...s.cells.map((c) => c.col)) + 1);
      expect(s.height, `${s.id} height`).toBe(Math.max(...s.cells.map((c) => c.row)) + 1);

      const keys = new Set(s.cells.map((c) => `${c.row},${c.col}`));
      expect(keys.size, `${s.id} unique cells`).toBe(s.cells.length);

      expect(s.size, `${s.id} size range`).toBeGreaterThanOrEqual(1);
      expect(s.size, `${s.id} size range`).toBeLessThanOrEqual(9);
    }
  });

  it('includes the expected signature shapes', () => {
    const ids = SHAPES.map((s) => s.id);
    for (const id of ['single', 'line5-h', 'square2', 'square3', 'T-up', 'S-h', 'bigL-tl']) {
      expect(ids).toContain(id);
    }
  });
});
