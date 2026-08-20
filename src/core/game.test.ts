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
import { createBoard, idx } from './board';
import { makeShape } from './shapes';
import { BOARD_SIZE, TRAY_SIZE } from './types';
import type { GameEvent, GameState, Piece, Shape } from './types';

const single = makeShape('single', [[0, 0]]);
const square2 = makeShape('square2', [[0, 0], [0, 1], [1, 0], [1, 1]]);
const line3v = makeShape('line3-v', [[0, 0], [1, 0], [2, 0]]);

function piece(id: string, shape: Shape, material = 1, placed = false): Piece {
  return { id, shape, material, placed };
}

function playing(board: Uint8Array, tray: Piece[], score = 0, highScore = 0): GameState {
  return {
    board,
    tray,
    score,
    highScore,
    status: 'playing',
    rngState: 123456789,
    pieceSeq: tray.length,
    mode: 'endless',
    level: 0,
    targetScore: 0,
    targets: createBoard(),
    targetsTotal: 0,
  };
}

const maskCount = (a: Uint8Array): number => a.reduce((n, v) => n + (v ? 1 : 0), 0);

/** Build a Levels-mode 'playing' state for engine tests. */
function levelsState(opts: {
  board: Uint8Array;
  targets: Uint8Array;
  tray: Piece[];
  score?: number;
  targetScore?: number;
  level?: number;
  highScore?: number;
}): GameState {
  return {
    board: opts.board,
    tray: opts.tray,
    score: opts.score ?? 0,
    highScore: opts.highScore ?? 0,
    status: 'playing',
    rngState: 123456789,
    pieceSeq: opts.tray.length,
    mode: 'levels',
    level: opts.level ?? 1,
    targetScore: opts.targetScore ?? 100,
    targets: opts.targets,
    targetsTotal: maskCount(opts.targets),
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
    expect(types(res.events)).toEqual(['placed', 'cleared', 'scored', 'scored']);

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
      mode: 'endless',
      level: 0,
      targetScore: 0,
      targets: createBoard(),
      targetsTotal: 0,
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
  it('newLevelsGame starts a playing level with targets and a target score', () => {
    const g = newLevelsGame(1, 7, 25);
    expect(g.mode).toBe('levels');
    expect(g.status).toBe('playing');
    expect(g.level).toBe(1);
    expect(g.tray).toHaveLength(TRAY_SIZE);
    expect(g.score).toBe(0);
    expect(g.highScore).toBe(25);
    expect(g.targetScore).toBeGreaterThan(0);
    expect(g.targetsTotal).toBeGreaterThan(0);
    expect(maskCount(g.targets)).toBe(g.targetsTotal);
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

describe('levels — applyMove resolution', () => {
  it('clearing a line removes its target cells and does not mutate the input mask', () => {
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1; // row 0 missing only (0,0)
    const targets = createBoard();
    targets[idx(0, 1)] = 1;
    targets[idx(0, 2)] = 1;
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, targets, tray, score: 0, targetScore: 9999 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).toContain('cleared');
    expect(maskCount(res.state.targets)).toBe(0);
    expect(res.state.status).toBe('playing'); // targets gone but score < targetScore
    // input mask untouched
    expect(state.targets[idx(0, 1)]).toBe(1);
  });

  it('stays playing when the score is reached but targets remain', () => {
    const board = createBoard();
    const targets = createBoard();
    board[idx(5, 5)] = 2;
    targets[idx(5, 5)] = 1; // an isolated target we will NOT clear
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, targets, tray, score: 100, targetScore: 10 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    expect(res.state.status).toBe('playing');
    expect(res.state.score).toBeGreaterThanOrEqual(10);
    expect(maskCount(res.state.targets)).toBe(1);
  });

  it('completes the level only when BOTH targets are cleared and the score is reached', () => {
    const board = createBoard();
    for (let c = 1; c < BOARD_SIZE; c++) board[idx(0, c)] = 1;
    const targets = createBoard();
    targets[idx(0, 3)] = 1;
    const tray = [piece('s', single, 4), piece('z', square2, 5)];
    const state = levelsState({ board, targets, tray, score: 0, targetScore: 10, level: 2 });

    const res = applyMove(state, { type: 'place', pieceId: 's', at: { row: 0, col: 0 } });

    // placement (+1) + row clear (+10) = 11 >= 10, and the only target was in row 0
    expect(res.state.score).toBe(11);
    expect(maskCount(res.state.targets)).toBe(0);
    expect(res.state.status).toBe('levelcomplete');
    expect(types(res.events)).toContain('levelcomplete');
    expect(res.events.find((e) => e.type === 'levelcomplete')).toMatchObject({ level: 2, score: 11 });
  });

  it('fails the level on a dead-end that is not yet complete', () => {
    // Circulant near-dead board (2 non-adjacent empties per row/col): no line is
    // full and no vertical-3 fits. One target sits on a filled cell.
    const board = new Uint8Array(BOARD_SIZE * BOARD_SIZE).fill(1);
    for (let r = 0; r < BOARD_SIZE; r++) {
      board[idx(r, r)] = 0;
      board[idx(r, (r + 1) % BOARD_SIZE)] = 0;
    }
    const targets = createBoard();
    targets[idx(0, 2)] = 1; // (0,2) is filled
    const tray = [piece('a', single), piece('b', line3v)];
    const state = levelsState({ board, targets, tray, score: 0, targetScore: 9999, level: 3 });

    const res = applyMove(state, { type: 'place', pieceId: 'a', at: { row: 0, col: 0 } });

    expect(res.ok).toBe(true);
    expect(types(res.events)).not.toContain('cleared');
    expect(res.state.status).toBe('levelfailed');
    expect(types(res.events)).toContain('levelfailed');
    expect(res.events.find((e) => e.type === 'levelfailed')).toMatchObject({ level: 3 });
  });
});
