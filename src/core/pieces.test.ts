import { describe, expect, it } from 'vitest';
import {
  attachGems,
  generateBiasedTray,
  generatePieces,
  generateSolvableTray,
  trayHasPlacement,
} from './pieces';
import { seedState } from './rng';
import { BOARD_SIZE, MATERIAL_COUNT, TRAY_SIZE } from './types';
import { createBoard, idx } from './board';
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

// --- P8a: solvability guarantee (opening tray always has a legal move) ---

/** A completely full board (nothing can ever be placed). */
const fullBoard = (): Uint8Array => new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);

/**
 * A board whose only empty cells are isolated (no two orthogonally adjacent),
 * so ONLY a 1x1 `single` can ever be placed.
 */
const onlySinglesFit = (): Uint8Array => {
  const b = fullBoard();
  for (let r = 0; r < BOARD_SIZE; r++) {
    b[idx(r, r)] = 0;
    b[idx(r, (r + 4) % BOARD_SIZE)] = 0;
  }
  return b;
};

/** A seeded rng state whose next 3-piece deal contains no `single`. */
const firstDrawNoSingle = (): number => {
  for (let s = 1; s < 1_000_000; s++) {
    const state = seedState(s);
    const { pieces } = generatePieces(state, 0, TRAY_SIZE);
    if (pieces.every((p) => p.shape.id !== 'single')) return state;
  }
  throw new Error('no no-single seed found');
};

describe('trayHasPlacement', () => {
  it('is true when any unplaced piece fits and false when none do', () => {
    const tray = generatePieces(seedState(1), 0, TRAY_SIZE).pieces;
    expect(trayHasPlacement(createBoard(), tray)).toBe(true); // empty board fits anything
    expect(trayHasPlacement(fullBoard(), tray)).toBe(false); // full board fits nothing
  });

  it('ignores already-placed pieces (a placed fitter does not count)', () => {
    // Board full except a single empty cell — only a 1x1 can go there.
    const board = fullBoard();
    board[idx(0, 0)] = 0;
    const single = SHAPES.find((s) => s.id === 'single')!;
    const square = SHAPES.find((s) => s.id === 'square2')!;
    const tray: Piece[] = [
      { id: 'a', shape: single, material: 1, placed: true }, // fits, but already placed
      { id: 'b', shape: square, material: 1, placed: false }, // 2x2 cannot fit one cell
    ];
    expect(trayHasPlacement(board, tray)).toBe(false);
    // The same single, unplaced, would make it placeable.
    expect(trayHasPlacement(board, [{ ...tray[0]!, placed: false }, tray[1]!])).toBe(true);
  });
});

describe('generateSolvableTray', () => {
  it('leaves a placeable opening tray unchanged (no re-draw on an empty board)', () => {
    const solved = generateSolvableTray(createBoard(), seedState(42), 0, TRAY_SIZE);
    const plain = generatePieces(seedState(42), 0, TRAY_SIZE);
    expect(solved.pieces.map((p) => p.shape.id)).toEqual(plain.pieces.map((p) => p.shape.id));
    expect(solved.rngState).toBe(plain.rngState); // advanced by exactly one draw
    expect(solved.nextSeq).toBe(plain.nextSeq);
  });

  it('re-draws an unplaceable opening tray until a piece fits', () => {
    const board = onlySinglesFit();
    const state = firstDrawNoSingle();
    const first = generatePieces(state, 0, TRAY_SIZE);
    expect(trayHasPlacement(board, first.pieces)).toBe(false); // the raw draw is stuck

    const solved = generateSolvableTray(board, state, 0, TRAY_SIZE, 200);
    expect(trayHasPlacement(board, solved.pieces)).toBe(true); // re-drawn to a fitting hand
    expect(solved.pieces.map((p) => p.shape.id)).not.toEqual(first.pieces.map((p) => p.shape.id));
  });

  it('is deterministic — same board + seed yields the same final tray', () => {
    const board = onlySinglesFit();
    const a = generateSolvableTray(board, seedState(3), 0, TRAY_SIZE, 200);
    const b = generateSolvableTray(board, seedState(3), 0, TRAY_SIZE, 200);
    expect(a.pieces.map((p) => p.shape.id)).toEqual(b.pieces.map((p) => p.shape.id));
    expect(a.rngState).toBe(b.rngState);
    expect(a.nextSeq).toBe(b.nextSeq);
  });

  it('terminates at the retry cap on a board where nothing fits (never hangs)', () => {
    const cap = 5;
    const solved = generateSolvableTray(fullBoard(), seedState(1), 0, TRAY_SIZE, cap);
    expect(solved.pieces).toHaveLength(TRAY_SIZE); // returns a fallback tray, does not hang
    expect(trayHasPlacement(fullBoard(), solved.pieces)).toBe(false); // still unfittable
    // One initial draw + `cap` re-draws advanced the id sequence by (cap + 1) hands.
    expect(solved.nextSeq).toBe(TRAY_SIZE * (cap + 1));
  });
});

// --- P8b: post-loss anti-frustration tray bias (rescues, never guarantees) ---

describe('generateBiasedTray', () => {
  // A fixed batch of seeds; the properties are statistical over the batch but
  // fully deterministic (no Math.random).
  const SEEDS = Array.from({ length: 60 }, (_, i) => seedState(i + 1));
  const isSingle = (p: Piece): boolean => p.shape.id === 'single';

  it('favors fitting shapes over a uniform draw (the bias is real)', () => {
    const board = onlySinglesFit(); // only the 1x1 `single` fits anywhere
    let biasedFit = 0;
    let uniformFit = 0;
    for (const s of SEEDS) {
      biasedFit += generateBiasedTray(board, s, 0, TRAY_SIZE).pieces.filter(isSingle).length;
      uniformFit += generatePieces(s, 0, TRAY_SIZE).pieces.filter(isSingle).length;
    }
    expect(biasedFit).toBeGreaterThan(uniformFit); // clearly more fitting pieces on retry
  });

  it('is bounded — it does NOT guarantee an all-fitting tray (skilled play can still lose)', () => {
    const board = onlySinglesFit();
    // At least one biased tray still contains a non-fitting piece...
    const anyNonFitting = SEEDS.some((s) =>
      generateBiasedTray(board, s, 0, TRAY_SIZE).pieces.some((p) => !isSingle(p)),
    );
    expect(anyNonFitting).toBe(true);
    // ...and it never fully rescues EVERY deal (would cross into "can't lose").
    const everyTrayAllFitting = SEEDS.every((s) =>
      generateBiasedTray(board, s, 0, TRAY_SIZE).pieces.every(isSingle),
    );
    expect(everyTrayAllFitting).toBe(false);
  });

  it('falls back to a plain uniform draw when no shape fits (never hangs)', () => {
    const board = fullBoard(); // fitting subset is empty
    const biased = generateBiasedTray(board, seedState(5), 0, TRAY_SIZE);
    const uniform = generatePieces(seedState(5), 0, TRAY_SIZE);
    expect(biased.pieces).toHaveLength(TRAY_SIZE);
    // With nothing to bias toward, the deal is inert — identical to the uniform stream.
    expect(biased.pieces.map((p) => p.shape.id)).toEqual(uniform.pieces.map((p) => p.shape.id));
    expect(biased.rngState).toBe(uniform.rngState);
  });

  it('is deterministic — same board + seed yields the same tray', () => {
    const board = onlySinglesFit();
    const a = generateBiasedTray(board, seedState(3), 0, TRAY_SIZE);
    const b = generateBiasedTray(board, seedState(3), 0, TRAY_SIZE);
    expect(a.pieces.map((p) => p.shape.id)).toEqual(b.pieces.map((p) => p.shape.id));
    expect(a.rngState).toBe(b.rngState);
    expect(a.nextSeq).toBe(b.nextSeq);
  });
});
