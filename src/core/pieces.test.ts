import { describe, expect, it } from 'vitest';
import { attachGems, generatePieces } from './pieces';
import { seedState } from './rng';
import { MATERIAL_COUNT, TRAY_SIZE } from './types';
import { SHAPES } from './shapes';
import type { Piece } from './types';

const shapeIds = new Set(SHAPES.map((s) => s.id));

/** Total gems per color across a set of pieces. */
function tallyGems(pieces: readonly Piece[]): Record<number, number> {
  const t: Record<number, number> = {};
  for (const p of pieces) {
    if (!p.gems) continue;
    for (const color of Object.values(p.gems)) t[color] = (t[color] ?? 0) + 1;
  }
  return t;
}

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

describe('attachGems', () => {
  const draw = (seed: number, count: number): Piece[] => generatePieces(seedState(seed), 0, count).pieces;

  it('never deals more of a color than supply, and decrements supply by what it dealt', () => {
    const supply = { 1: 3, 2: 5 };
    const res = attachGems(draw(5, 60), seedState(123), supply);
    const dealt = tallyGems(res.pieces);
    expect(dealt[1] ?? 0).toBeLessThanOrEqual(3);
    expect(dealt[2] ?? 0).toBeLessThanOrEqual(5);
    // supplyRemaining == initial - dealt, per color.
    expect(res.supplyRemaining[1]).toBe(3 - (dealt[1] ?? 0));
    expect(res.supplyRemaining[2]).toBe(5 - (dealt[2] ?? 0));
    // input supply is not mutated (purity).
    expect(supply).toEqual({ 1: 3, 2: 5 });
    // each gemmed piece carries at most one gem, on a valid shape-cell index.
    for (const p of res.pieces) {
      if (!p.gems) continue;
      expect(Object.keys(p.gems).length).toBe(1);
      const cellIdx = Number(Object.keys(p.gems)[0]);
      expect(cellIdx).toBeGreaterThanOrEqual(0);
      expect(cellIdx).toBeLessThan(p.shape.cells.length);
    }
  });

  it('drains the full supply given plenty of pieces (gems are dealt, i.e. decremented, here)', () => {
    const res = attachGems(draw(9, 400), seedState(7), { 1: 4, 2: 2 });
    expect(res.supplyRemaining).toEqual({ 1: 0, 2: 0 });
    expect(tallyGems(res.pieces)).toEqual({ 1: 4, 2: 2 });
  });

  it('allows zero-gem pieces and never gems when supply is empty', () => {
    const emptyRes = attachGems(draw(3, 10), seedState(1), {});
    expect(emptyRes.pieces.every((p) => p.gems === undefined)).toBe(true);
    expect(emptyRes.supplyRemaining).toEqual({});
    // With supply available but a per-piece chance below 100%, some pieces still
    // come out gemless across a batch.
    const someRes = attachGems(draw(2, 12), seedState(2), { 1: 100 });
    expect(someRes.pieces.some((p) => p.gems === undefined)).toBe(true);
  });

  it('is deterministic for the same rng state + supply', () => {
    const pcs = draw(11, 9);
    const a = attachGems(pcs, seedState(50), { 1: 3, 2: 3 });
    const b = attachGems(pcs, seedState(50), { 1: 3, 2: 3 });
    expect(a.pieces.map((p) => p.gems ?? null)).toEqual(b.pieces.map((p) => p.gems ?? null));
    expect(a.rngState).toBe(b.rngState);
    expect(a.supplyRemaining).toEqual(b.supplyRemaining);
  });
});
