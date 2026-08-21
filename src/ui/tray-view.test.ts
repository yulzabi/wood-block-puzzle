import { describe, it, expect } from 'vitest';
import { describePiece } from './tray-view';
import { SHAPES } from '../core/shapes';
import type { Shape } from '../core/types';

function byId(id: string): Shape {
  const s = SHAPES.find((x) => x.id === id);
  if (!s) throw new Error(`no shape ${id}`);
  return s;
}

describe('describePiece', () => {
  it('single block', () => {
    expect(describePiece(byId('single'))).toBe('single block, 1 cell');
  });
  it('horizontal line', () => {
    expect(describePiece(byId('line3-h'))).toBe('horizontal line, 3 cells');
  });
  it('vertical line', () => {
    expect(describePiece(byId('line4-v'))).toBe('vertical line, 4 cells');
  });
  it('square 2x2', () => {
    expect(describePiece(byId('square2'))).toBe('square, 4 cells');
  });
  it('square 3x3', () => {
    expect(describePiece(byId('square3'))).toBe('square, 9 cells');
  });
  it('T-shape', () => {
    expect(describePiece(byId('T-up'))).toBe('T-shape, 4 cells');
  });
  it('S-shape', () => {
    expect(describePiece(byId('S-h'))).toBe('S-shape, 4 cells');
  });
  it('Z-shape', () => {
    expect(describePiece(byId('Z-h'))).toBe('Z-shape, 4 cells');
  });
  it('L-family tetromino (L4)', () => {
    expect(describePiece(byId('L4'))).toBe('L-shape, 4 cells');
  });
  it('L-family tromino (corner)', () => {
    expect(describePiece(byId('corner-tl'))).toBe('L-shape, 3 cells');
  });
});
