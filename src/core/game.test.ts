import { describe, expect, it } from 'vitest';
import {
  applyMove,
  isGameOver,
  newGame,
  newLevelsGame,
  nextLevel,
  restart,
  retryLevel,
  startGame,
} from './game';
import { generateLevel } from './levels';
import { generatePieces } from './pieces';
import { createBoard, idx } from './board';
import { makeShape } from './shapes';
import { BOARD_SIZE, TRAY_SIZE } from './types';
import type { GameEvent, GameState, GoalType, Piece, Shape } from './types';

const single = makeShape('single', [[0, 0]]);
const square2 = makeShape('square2', [[0, 0], [0, 1], [1, 0], [1, 1]]);
const line3v = makeShape('line3-v', [[0, 0], [1, 0], [2, 0]]);

function piece(id: string, shape: Shape, material = 1, placed = false): Piece {
  return { id, shape, material, placed };
}

function playing(
  board: Uint8Array,
  tray: Piece[],
  score = 0,
  highScore = 0,
  streak = 0,
  rngState = 123456789,
): GameState {
  return {
    board,
    tray,
    score,
    highScore,
    status: 'playing',
    rngState,
    pieceSeq: tray.length,
    streak,
    mode: 'endless',
    level: 0,
    goalType: 'score',
    targetScore: 0,
    gems: createBoard(),
    quotas: {},
    gemsCleared: {},
    gemSupplyRemaining: {},
  };
}

const maskCount = (a: Uint8Array): number => a.reduce((n, v) => n + (v ? 1 : 0), 0);
const sumCounts = (c: Readonly<Record<number, number>>): number =>
  Object.values(c).reduce((n, v) => n + v, 0);
/** Per-color counts of the gems in a channel (mirrors generateLevel's quotas). */
function quotasFromMask(gems: Uint8Array): Record<number, number> {
  const q: Record<number, number> = {};
  for (const v of gems) if (v !== 0) q[v] = (q[v] ?? 0) + 1;
  return q;
}

/** Build a Levels-mode 'playing' state for engine tests. */
function levelsState(opts: {
  board: Uint8Array;
  gems: Uint8Array;
  tray: Piece[];
  score?: number;
  targetScore?: number;
  level?: number;
  highScore?: number;
  goalType?: GoalType;
  quotas?: Record<number, number>;
  gemsCleared?: Record<number, number>;
}): GameState {
  return {
    board: opts.board,
    tray: opts.tray,
    score: opts.score ?? 0,
    highScore: opts.highScore ?? 0,
    status: 'playing',
    rngState: 123456789,
    pieceSeq: opts.tray.length,
    streak: 0,
    mode: 'levels',
    level: opts.level ?? 1,
    goalType: opts.goalType ?? 'score',
    targetScore: opts.targetScore ?? 100,
    gems: opts.gems,
    quotas: opts.quotas ?? quotasFromMask(opts.gems),
    gemsCleared: opts.gemsCleared ?? {},
    gemSupplyRemaining: {},
  };
}

const types = (events: readonly GameEvent[]): string[] => events.map((e) => e.type);

describe('newGame / startGame', () => {
  it('starts on the home screen with no tray', () => {
    const g = newGame(1, 0);
    expect(g.status).toBe('home');
    expect(g.tray).toHaveLength(0);
    expect(g.score).toBe(0);
  });

  it('deals a fresh 3-piece tray and enters play', () => {
    const res = startGame(newGame(1, 40));
    expect(res.ok).toBe(true);
    expect(res.state.status).toBe('playing');
    expect(res.state.tray).toHaveLength(TRAY_SIZE);
    expect(res.state.tray.every((p) => !p.placed)).toBe(true);
    expect(res.state.score).toBe(0);
    expect(res.state.highScore).toBe(40);
    expect(res.state.board.every((v) => v === 0)).toBe(true);
  });
});

describe('applyMove — happy path', () => {
  it('places a piece, scores its cells, marks it placed, and does not mutate the input', () => {
    const board = createBoard();
    const tray = [piece('a', square2, 2), piece('b', single, 3)];
    const state = playing(board, tray);

    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(res.state.score).toBe(4);
    expect(res.state.tray.find((p) => p.id === 'a')?.placed).toBe(true);
    expect(res.state.tray.find((p) => p.id === 'b')?.placed).toBe(false);
    expect(res.state.status).toBe('playing');
    expect(types(res.events)).toEqual(['placed', 'scored']);

    // input untouched
    expect(board.every((v) => v === 0)).toBe(true);
    expect(state.tray[0]?.placed).toBe(false);
    expect(state.score).toBe(0);
  });
});

describe('applyMove — line clearing', () => {
  it('clears a completed row and awards placement + clear score', () => {
    const board = createBoard();
    for (let col = 1; col < BOARD_SIZE; col++) board[idx(0, col)] = 1; // row 0 missing only (0,0)
    const tray = [piece('s', single, 4), piece('big', square2, 5)];
    const state = playing(board, tray);

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).toEqual(['placed', 'cleared', 'scored', 'scored', 'combo']);

    const cleared = res.events.find((e) => e.type === 'cleared');
    expect(cleared).toMatchObject({ rows: [0], cols: [] });

    const scored = res.events.filter((e) => e.type === 'scored');
    expect(scored[0]).toMatchObject({ kind: 'placement', delta: 1, total: 1 });
    expect(scored[1]).toMatchObject({ kind: 'clear', delta: 10, total: 11 });

    expect(res.state.score).toBe(11);
    // row 0 has been emptied again
    for (let col = 0; col < BOARD_SIZE; col++) expect(res.state.board[idx(0, col)]).toBe(0);
  });
});

describe('applyMove — rejections leave state unchanged', () => {
  it('rejects an occupied target', () => {
    const board = createBoard();
    board[idx(0, 0)] = 1;
    const state = playing(board, [piece('a', single)]);
    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('occupied');
    expect(res.state).toBe(state);
    expect(res.events).toEqual([]);
  });

  it('rejects an out-of-bounds target', () => {
    const state = playing(createBoard(), [piece('a', square2)]);
    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 7, col: 7 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('out-of-bounds');
  });

  it('rejects an unknown piece id', () => {
    const state = playing(createBoard(), [piece('a', single)]);
    const res = applyMove(state, { type: 'place', pieceId: 'zzz', at: { row: 0, col: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-found');
  });

  it('rejects an already-placed piece', () => {
    const state = playing(createBoard(), [piece('a', single, 1, true), piece('b', single)]);
    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('already-placed');
  });
});

describe('applyMove — refill', () => {
  it('deals a fresh tray of 3 when the last piece is placed', () => {
    const tray = [piece('a', single, 1, true), piece('b', single, 1, true), piece('c', single)];
    const state = playing(createBoard(), tray);

    const res = applyMove(state, { type: 'place', pieceId: 'c', at: { row: 4, col: 4 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).toContain('refill');
    expect(res.state.tray).toHaveLength(TRAY_SIZE);
    expect(res.state.tray.every((p) => !p.placed)).toBe(true);
    // fresh ids continue the sequence
    expect(res.state.tray.map((p) => p.id)).toEqual(['p-3', 'p-4', 'p-5']);
  });
});

describe('game over', () => {
  it('isGameOver is false with room and true with none', () => {
    expect(isGameOver(playing(createBoard(), [piece('a', square2)]))).toBe(false);
    const full = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    expect(isGameOver(playing(full, [piece('a', single)]))).toBe(true);
  });

  it('emits a gameover event when the last move leaves no fitting piece', () => {
    // A realistic near-dead board: exactly two empty cells per row AND per column
    // (a circulant pattern), so NO row/column is full (nothing to clear) and no
    // column ever has 3 vertically-consecutive empties (a vertical-3 can't fit).
    const board = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    for (let r = 0; r < BOARD_SIZE; r++) {
      board[idx(r, r)] = 0;
      board[idx(r, (r + 1) % BOARD_SIZE)] = 0;
    }
    // Place 'a' (single) at (0,0): row 0 & col 0 keep their other empty, so no line
    // completes; remaining piece 'b' (vertical line of 3) cannot fit anywhere.
    const state = playing(board, [piece('a', single), piece('b', line3v)]);

    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).not.toContain('cleared');
    expect(types(res.events)).toContain('gameover');
    expect(res.state.status).toBe('gameover');
    const over = res.events.find((e) => e.type === 'gameover');
    expect(over).toMatchObject({ finalScore: res.state.score });
  });
});

describe('restart', () => {
  it('resets board, tray, and score while keeping the high score', () => {
    const dirty = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    const state: GameState = {
      board: dirty,
      tray: [piece('x', single, 1, true)],
      score: 30,
      highScore: 55,
      status: 'gameover',
      rngState: 987654321,
      pieceSeq: 9,
      streak: 0,
      mode: 'endless',
      level: 0,
      goalType: 'score',
      targetScore: 0,
      gems: createBoard(),
      quotas: {},
      gemsCleared: {},
      gemSupplyRemaining: {},
    };

    const res = restart(state);

    expect(res.ok).toBe(true);
    expect(res.state.status).toBe('playing');
    expect(res.state.score).toBe(0);
    expect(res.state.highScore).toBe(55);
    expect(res.state.tray).toHaveLength(TRAY_SIZE);
    expect(res.state.tray.every((p) => !p.placed)).toBe(true);
    expect(res.state.board.every((v) => v === 0)).toBe(true);
  });
});

describe('levels — start / progression', () => {
  it('newLevelsGame level 1 is a playing score goal (no gems)', () => {
    const g = newLevelsGame(1, 7, 25);
    expect(g.mode).toBe('levels');
    expect(g.status).toBe('playing');
    expect(g.level).toBe(1);
    expect(g.tray).toHaveLength(TRAY_SIZE);
    expect(g.score).toBe(0);
    expect(g.highScore).toBe(25);
    expect(g.goalType).toBe('score');
    expect(g.targetScore).toBeGreaterThan(0);
    expect(maskCount(g.gems)).toBe(0);
    expect(sumCounts(g.quotas)).toBe(0);
  });

  it('newLevelsGame level 2+ is a gem goal with quotas and fewer board gems than quota', () => {
    const g = newLevelsGame(2, 7, 25);
    expect(g.mode).toBe('levels');
    expect(g.status).toBe('playing');
    expect(g.goalType).toBe('gems');
    expect(sumCounts(g.quotas)).toBeGreaterThan(0);
    // Only a portion of the objective is on the board; the rest arrives as supply.
    expect(maskCount(g.gems)).toBeLessThan(sumCounts(g.quotas));
  });

  it('nextLevel advances and retryLevel rebuilds the same level (board matches generateLevel)', () => {
    const g = newLevelsGame(1, 5, 20);
    const nx = nextLevel(g).state;
    expect(nx.level).toBe(2);
    expect(nx.status).toBe('playing');
    expect(nx.highScore).toBe(20);
    expect(Array.from(nx.board)).toEqual(Array.from(generateLevel(2).board));

    const rt = retryLevel(g).state;
    expect(rt.level).toBe(1);
    expect(Array.from(rt.board)).toEqual(Array.from(generateLevel(1).board));
  });
});

describe('levels — applyMove resolution (either/or win)', () => {
  it('emits gemsCleared after cleared and before refill, tallying per color', () => {
    // Row 0 filled cols 1..7 with gems of color 3; complete it with a single at (0,0).
    const board = createBoard();
    const gems = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) {
      board[idx(0, c)] = 3;
      gems[idx(0, c)] = 3;
    }
    // Whole tray is this one piece so its placement triggers a refill too.
    const tray = [piece('s', single, 4)];
    const state = levelsState({
      board,
      gems,
      tray,
      goalType: 'gems',
      quotas: { 3: 20 }, // far from met, so the level stays playing
      gemsCleared: { 3: 2 }, // pre-existing progress accumulates
    });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    const seq = types(res.events);
    // Ordering contract: cleared -> gemsCleared -> refill.
    expect(seq.indexOf('gemsCleared')).toBeGreaterThan(seq.indexOf('cleared'));
    expect(seq.indexOf('gemsCleared')).toBeLessThan(seq.indexOf('refill'));

    const gc = res.events.find((e) => e.type === 'gemsCleared');
    expect(gc).toMatchObject({ cleared: { 3: 7 }, totals: { 3: 9 } }); // 2 + 7
    expect(res.state.gemsCleared).toEqual({ 3: 9 });
    // The cleared row's gems are gone from the board.
    for (let c = 0; c < BOARD_SIZE; c++) expect(res.state.gems[idx(0, c)]).toBe(0);
    expect(res.state.status).toBe('playing'); // 9 < quota 20

    // Input channel untouched (purity).
    expect(state.gems[idx(0, 1)]).toBe(3);
    expect(state.gemsCleared).toEqual({ 3: 2 });
  });

  it('gem goal completes when every quota is met — regardless of score', () => {
    const board = createBoard();
    const gems = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) {
      board[idx(0, c)] = 1;
      gems[idx(0, c)] = 1;
    }
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    // Need 7 of color 1; the row holds exactly 7. targetScore huge + irrelevant.
    const state = levelsState({ board, gems, tray, goalType: 'gems', quotas: { 1: 7 }, targetScore: 9999, level: 2 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.gemsCleared).toEqual({ 1: 7 });
    expect(res.state.status).toBe('levelcomplete'); // quota met even though score << 9999
    expect(res.events.find((e) => e.type === 'levelcomplete')).toMatchObject({ level: 2 });
  });

  it('gem goal stays playing when quotas are unmet — even with a high score', () => {
    // score alone must NOT win a gem level (either/or: the combined && is gone).
    const board = createBoard();
    const gems = createBoard();
    board[idx(5, 5)] = 2;
    gems[idx(5, 5)] = 1; // an isolated gem we will NOT clear
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, gems, tray, goalType: 'gems', quotas: { 1: 1 }, score: 9999, targetScore: 10 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.status).toBe('playing');
    expect(res.state.score).toBeGreaterThanOrEqual(9999);
    expect(maskCount(res.state.gems)).toBe(1); // quota still unmet
  });

  it('score goal completes on reaching the score — regardless of remaining gems', () => {
    // gems present but not fully cleared; reaching the score still wins (either/or).
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1;
    const gems = createBoard();
    gems[idx(5, 5)] = 1; // a gem far away that we will NOT clear
    board[idx(5, 5)] = 1;
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, gems, tray, goalType: 'score', score: 0, targetScore: 10, level: 2 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    // placement (+1) + row clear (+10) = 11 >= 10 -> complete, even with a gem left.
    expect(res.state.score).toBe(11);
    expect(maskCount(res.state.gems)).toBe(1);
    expect(res.state.status).toBe('levelcomplete');
    expect(res.events.find((e) => e.type === 'levelcomplete')).toMatchObject({ level: 2, score: 11 });
  });

  it('score goal stays playing below the target score', () => {
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1;
    const gems = createBoard();
    gems[idx(0, 1)] = 1;
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, gems, tray, goalType: 'score', score: 0, targetScore: 9999 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.status).toBe('playing'); // score 11 < 9999
  });

  it('fails the level on a dead-end that is not yet complete', () => {
    // Circulant near-dead board (2 non-adjacent empties per row/col): no line is
    // full and no vertical-3 fits. One gem sits on a filled cell.
    const board = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    for (let r = 0; r < BOARD_SIZE; r++) {
      board[idx(r, r)] = 0;
      board[idx(r, (r + 1) % BOARD_SIZE)] = 0;
    }
    const gems = createBoard();
    gems[idx(0, 2)] = 1; // (0,2) is filled
    const tray = [piece('a', single), piece('b', line3v)];
    const state = levelsState({ board, gems, tray, score: 0, targetScore: 9999, level: 3 });

    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).not.toContain('cleared');
    expect(res.state.status).toBe('levelfailed');
    expect(types(res.events)).toContain('levelfailed');
    expect(res.events.find((e) => e.type === 'levelfailed')).toMatchObject({ level: 3 });
  });
});

describe('applyMove — streak / combo', () => {
  it('starts a streak at 1 on the first clear and emits a combo event', () => {
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1; // row 0 missing only (0,0)
    const state = playing(board, [piece('s', single, 4), piece('z', square2, 5)]);

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.streak).toBe(1);
    expect(res.events.find((e) => e.type === 'combo')).toMatchObject({ streak: 1, multiplier: 1, lines: 1 });
    // first clear: bonus = round(10 * 1) = 10
    expect(res.events.find((e) => e.type === 'scored' && e.kind === 'clear')).toMatchObject({ delta: 10 });
  });

  it('multiplies the clear bonus by the streak multiplier', () => {
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1; // row 0 missing only (0,0)
    // Enter with streak 2 so this clear makes it 3 -> multiplier 2.
    const state = playing(board, [piece('s', single, 4), piece('z', square2, 5)], 0, 0, 2);

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.streak).toBe(3);
    expect(res.events.find((e) => e.type === 'combo')).toMatchObject({ streak: 3, multiplier: 2, lines: 1 });
    // clear bonus = round(10 * 2) = 20; total = placement(1) + 20 = 21
    expect(res.events.find((e) => e.type === 'scored' && e.kind === 'clear')).toMatchObject({ delta: 20, total: 21 });
    expect(res.state.score).toBe(21);
  });

  it('resets the streak to 0 on a placement that clears nothing (no combo event)', () => {
    const state = playing(createBoard(), [piece('s', single, 4), piece('z', square2, 5)], 50, 50, 5);

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 4, col: 4 } });

    expect(res.state.streak).toBe(0);
    expect(types(res.events)).not.toContain('combo');
    expect(types(res.events)).not.toContain('cleared');
  });
});

describe('applyMove — a refill can immediately end the game', () => {
  // Board filled except isolated (non-adjacent) empties — two per row/col spaced 4
  // apart — so ONLY a 1x1 `single` can ever be placed here.
  const isolatedBoard = (): Uint8Array => {
    const b = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    for (let r = 0; r < BOARD_SIZE; r++) {
      b[idx(r, r)] = 0;
      b[idx(r, (r + 4) % BOARD_SIZE)] = 0;
    }
    return b;
  };
  // An rngState whose next 3-piece deal contains no `single` (the only shape that
  // could fit the isolated board), so the refill is guaranteed unplaceable.
  const noSingleRng = (): number => {
    for (let s = 1; s < 1_000_000; s++) {
      const { pieces } = generatePieces(s, 0, TRAY_SIZE);
      if (pieces.every((p) => p.shape.id !== 'single')) return s;
    }
    throw new Error('no no-single rng found');
  };

  it('endless: exhausting the tray into an unplaceable refill ends in gameover', () => {
    const tray = [piece('a', single, 1, true), piece('b', single, 1, true), piece('c', single)];
    const state = playing(isolatedBoard(), tray, 0, 0, 0, noSingleRng());

    // Place the last piece in an isolated empty: no line completes, so no clear.
    const res = applyMove(state, { type: 'place', pieceId: 'c', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).toContain('refill');
    expect(types(res.events)).not.toContain('cleared');
    expect(res.state.tray.every((p) => !p.placed)).toBe(true); // the fresh, unplaceable hand
    expect(res.state.status).toBe('gameover');
    expect(types(res.events)).toContain('gameover');
  });

  it('levels: an unplaceable refill fails the level', () => {
    const gems = createBoard();
    gems[idx(2, 2)] = 1; // a gem on a filled cell -> survives, so not complete
    const tray = [piece('a', single, 1, true), piece('b', single, 1, true), piece('c', single)];
    const state: GameState = {
      board: isolatedBoard(),
      tray,
      score: 0,
      highScore: 0,
      status: 'playing',
      rngState: noSingleRng(),
      pieceSeq: tray.length,
      streak: 0,
      mode: 'levels',
      level: 4,
      goalType: 'score',
      targetScore: 9999,
      gems,
      quotas: { 1: 1 },
      gemsCleared: {},
      gemSupplyRemaining: {},
    };

    const res = applyMove(state, { type: 'place', pieceId: 'c', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).toContain('refill');
    expect(res.state.status).toBe('levelfailed');
    expect(types(res.events)).toContain('levelfailed');
  });
});
