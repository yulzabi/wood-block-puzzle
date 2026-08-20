import { describe, expect, it } from 'vitest';
import { resolveOrigin } from './drag-controller';

describe('resolveOrigin', () => {
  it('grabbing the origin cell places at the pointer cell', () => {
    expect(resolveOrigin({ row: 4, col: 5 }, { row: 0, col: 0 })).toEqual({ row: 4, col: 5 });
  });

  it('subtracts the grabbed cell offset from the pointer cell', () => {
    // Grabbed the (1,2) cell of the piece; pointer over board cell (4,4).
    expect(resolveOrigin({ row: 4, col: 4 }, { row: 1, col: 2 })).toEqual({ row: 3, col: 2 });
  });

  it('can produce a negative (out-of-bounds) origin, left for canPlace to reject', () => {
    expect(resolveOrigin({ row: 0, col: 0 }, { row: 1, col: 1 })).toEqual({ row: -1, col: -1 });
  });
});
