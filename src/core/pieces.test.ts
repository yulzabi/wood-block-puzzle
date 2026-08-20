import { describe, expect, it } from 'vitest';
import { generatePieces } from './pieces';
import { seedState } from './rng';
import { MATERIAL_COUNT, TRAY_SIZE } from './types';
import { SHAPES } from './shapes';

const shapeIds = new Set(SHAPES.map((s) => s.id));

describe('generatePieces', () => {
  it('returns exactly `count` unplaced pieces', () => {
    const { pieces } = generatePieces(seedState(1), 0, TRAY_SIZE);
    expect(pieces).toHaveLength(TRAY_SIZE);
    expect(pieces.every((p) => !p.placed)).toBe(true);
  });

  it('assigns valid shapes, materials, and unique ids from the sequence', () => {
    const { pieces, nextSeq } = generatePieces(seedState(42), 10, 3);
    expect(pieces.map((p) => p.id)).toEqual(['p-10', 'p-11', 'p-12']);
    expect(nextSeq).toBe(13);
    for (const p of pieces) {
      expect(shapeIds.has(p.shape.id)).toBe(true);
      expect(p.material).toBeGreaterThanOrEqual(1);
      expect(p.material).toBeLessThanOrEqual(MATERIAL_COUNT);
    }
  });

  it('is deterministic for a given seed and advances the rng state', () => {
    const s = seedState(7);
    const a = generatePieces(s, 0, 3);
    const b = generatePieces(s, 0, 3);
    expect(a.pieces.map((p) => p.shape.id)).toEqual(b.pieces.map((p) => p.shape.id));
    expect(a.pieces.map((p) => p.material)).toEqual(b.pieces.map((p) => p.material));
    expect(a.rngState).toBe(b.rngState);
    expect(a.rngState).not.toBe(s);
  });

  it('produces a different stream after the state advances', () => {
    const first = generatePieces(seedState(99), 0, 3);
    const second = generatePieces(first.rngState, first.nextSeq, 3);
    // Not asserting inequality of shapes (could coincide), but state + ids must move on.
    expect(second.pieces.map((p) => p.id)).toEqual(['p-3', 'p-4', 'p-5']);
    expect(second.rngState).not.toBe(first.rngState);
  });
});
