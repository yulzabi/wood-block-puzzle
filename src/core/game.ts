/**
 * The game engine: a pure reducer over `(GameState, Move)`.
 *
 * `applyMove` returns a NEW state plus an ordered list of semantic events for
 * the UI to animate. It never mutates its input. Event order for a valid move:
 *   placed, [cleared], scored (x1-2), [refill], [gameover].
 */

import type { GameEvent, GameState, Move, MoveResult, Piece, RejectReason } from './types';
import { TRAY_SIZE } from './types';
import { canPlace, clearLines, createBoard, findFullLines, hasAnyPlacement, inBounds, place } from './board';
import { generatePieces } from './pieces';
import { lineClearScore, placementScore } from './scoring';
import { seedState } from './rng';

/** Fresh state on the home screen (no tray yet; `startGame` deals the first hand). */
export function newGame(seed: number, highScore: number): GameState {
  return {
    board: createBoard(),
    tray: [],
    score: 0,
    highScore: Math.max(0, Math.floor(highScore) || 0),
    status: 'home',
    rngState: seedState(seed),
    pieceSeq: 0,
  };
}

/** Internal: begin a fresh round (fresh board + a new tray of 3), preserving RNG + high score. */
function beginPlaying(state: GameState): GameState {
  const { pieces, rngState, nextSeq } = generatePieces(state.rngState, state.pieceSeq, TRAY_SIZE);
  return {
    board: createBoard(),
    tray: pieces,
    score: 0,
    highScore: state.highScore,
    status: 'playing',
    rngState,
    pieceSeq: nextSeq,
  };
}

/** Transition home -> playing: deal the first tray of 3, status='playing'. */
export function startGame(state: GameState): MoveResult {
  return { ok: true, state: beginPlaying(state), events: [] };
}

/** Restart after game over: fresh board + tray, score 0, keep highScore, status='playing'. */
export function restart(state: GameState): MoveResult {
  return { ok: true, state: beginPlaying(state), events: [] };
}

/** True iff no unplaced tray piece has any placement on the board. */
export function isGameOver(state: GameState): boolean {
  const unplaced = state.tray.filter((p) => !p.placed);
  if (unplaced.length === 0) return false;
  return unplaced.every((p) => !hasAnyPlacement(state.board, p.shape));
}

/** Determine why a placement is invalid (out-of-bounds takes precedence over occupied). */
function rejectionReason(state: GameState, piece: Piece, at: Move['at']): RejectReason | null {
  for (const c of piece.shape.cells) {
    if (!inBounds(at.row + c.row, at.col + c.col)) return 'out-of-bounds';
  }
  if (!canPlace(state.board, piece.shape, at)) return 'occupied';
  return null;
}

/**
 * Apply a placement. Validates first; on rejection returns { ok:false, reason }
 * with the unchanged state. On success: writes the piece, clears full lines,
 * updates score, refills the tray when all 3 are placed, and flips to 'gameover'
 * when no unplaced piece fits anywhere.
 */
export function applyMove(state: GameState, move: Move): MoveResult {
  const piece = state.tray.find((p) => p.id === move.pieceId);
  if (!piece) return { ok: false, state, events: [], reason: 'not-found' };
  if (piece.placed) return { ok: false, state, events: [], reason: 'already-placed' };

  const reason = rejectionReason(state, piece, move.at);
  if (reason) return { ok: false, state, events: [], reason };

  const events: GameEvent[] = [];

  // 1. Write the piece.
  const placed = place(state.board, piece.shape, move.at, piece.material);
  events.push({ type: 'placed', cells: placed.cells, material: piece.material });

  // 2. Clear any completed lines.
  const { rows, cols } = findFullLines(placed.board);
  const lineCount = rows.length + cols.length;
  let board = placed.board;
  if (lineCount > 0) {
    const cleared = clearLines(placed.board, rows, cols);
    board = cleared.board;
    events.push({ type: 'cleared', rows, cols, cells: cleared.cells });
  }

  // 3. Score: placement first, then the line-clear bonus.
  const placementPts = placementScore(piece.shape.size);
  let score = state.score + placementPts;
  events.push({ type: 'scored', delta: placementPts, total: score, kind: 'placement' });
  if (lineCount > 0) {
    const clearPts = lineClearScore(lineCount);
    score += clearPts;
    events.push({ type: 'scored', delta: clearPts, total: score, kind: 'clear' });
  }

  // 4. Mark the piece placed; refill when the whole tray is exhausted.
  let tray: Piece[] = state.tray.map((p) => (p.id === move.pieceId ? { ...p, placed: true } : p));
  let rngState = state.rngState;
  let pieceSeq = state.pieceSeq;
  if (tray.every((p) => p.placed)) {
    const refill = generatePieces(state.rngState, state.pieceSeq, TRAY_SIZE);
    tray = refill.pieces;
    rngState = refill.rngState;
    pieceSeq = refill.nextSeq;
    events.push({ type: 'refill', pieces: refill.pieces });
  }

  // 5. High score + game-over (evaluated against the post-refill tray).
  const highScore = Math.max(state.highScore, score);
  const unplaced = tray.filter((p) => !p.placed);
  const gameOver = unplaced.length > 0 && unplaced.every((p) => !hasAnyPlacement(board, p.shape));
  const status = gameOver ? 'gameover' : 'playing';
  if (gameOver) {
    events.push({ type: 'gameover', finalScore: score, highScore });
  }

  return {
    ok: true,
    state: { board, tray, score, highScore, status, rngState, pieceSeq },
    events,
  };
}
