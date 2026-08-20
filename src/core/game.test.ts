import { describe, expect, it } from 'vitest';
import { applyMove, isGameOver, newGame, restart, startGame } from './game';
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
