/**
 * The game engine: a pure reducer over `(GameState, Move)`.
 *
 * `applyMove` returns a NEW state plus an ordered list of semantic events for
 * the UI to animate. It never mutates its input. Event order for a valid move:
 *   placed, [cleared], scored (x1-2), [combo], [refill], [gameover/levelcomplete/levelfailed].
 */

import type { Coord, GameEvent, GameState, GameStatus, Move, MoveResult, Piece, RejectReason } from './types';
import { TRAY_SIZE } from './types';
import { canPlace, clearLines, createBoard, findFullLines, hasAnyPlacement, idx, inBounds, place } from './board';
import { generatePieces } from './pieces';
import { generateLevel } from './levels';
import { lineClearScore, placementScore, streakMultiplier } from './scoring';
import { seedState } from './rng';

/** Count the set cells in a 0/1 mask. */
function countMask(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) n++;
  return n;
}

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
    streak: 0,
    mode: 'endless',
    level: 0,
    targetScore: 0,
    targets: createBoard(),
    targetsTotal: 0,
  };
}

/** Internal: begin a fresh endless round (fresh board + a new tray of 3), preserving RNG + high score. */
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
    streak: 0,
    mode: 'endless',
    level: 0,
    targetScore: 0,
    targets: createBoard(),
    targetsTotal: 0,
  };
}

/** Internal: begin a fresh Levels round for `level`, preserving RNG + high score. */
function beginLevel(state: GameState, level: number): GameState {
  const gen = generateLevel(level);
  const { pieces, rngState, nextSeq } = generatePieces(state.rngState, state.pieceSeq, TRAY_SIZE);
  return {
    board: gen.board,
    tray: pieces,
    score: 0,
    highScore: state.highScore,
    status: 'playing',
    rngState,
    pieceSeq: nextSeq,
    streak: 0,
    mode: 'levels',
    level,
    targetScore: gen.targetScore,
    targets: gen.targets,
    targetsTotal: countMask(gen.targets),
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

/** Start a brand-new Levels game at `level`, seeding the tray RNG from `seed`. */
export function newLevelsGame(level: number, seed: number, highScore: number): GameState {
  return beginLevel(newGame(seed, highScore), level);
}

/** Enter a specific level from an existing state (preserving high score + advancing RNG). */
export function startLevel(state: GameState, level: number): MoveResult {
  return { ok: true, state: beginLevel(state, level), events: [] };
}

/** Advance to the next level after a level-complete. */
export function nextLevel(state: GameState): MoveResult {
  return startLevel(state, state.level + 1);
}

/** Retry the current level after a level-failed (same board pattern, fresh tray). */
export function retryLevel(state: GameState): MoveResult {
  return startLevel(state, state.level);
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
  let clearedCells: Coord[] = [];
  if (lineCount > 0) {
    const cleared = clearLines(placed.board, rows, cols);
    board = cleared.board;
    clearedCells = cleared.cells;
    events.push({ type: 'cleared', rows, cols, cells: cleared.cells });
  }

  // 3. Streak (strike): clearing lines on consecutive placements builds a streak
  //    that multiplies the line-clear bonus; a no-clear placement resets it.
  const streak = lineCount > 0 ? state.streak + 1 : 0;

  // 4. Score: placement first, then the streak-multiplied line-clear bonus.
  const placementPts = placementScore(piece.shape.size);
  let score = state.score + placementPts;
  events.push({ type: 'scored', delta: placementPts, total: score, kind: 'placement' });
  if (lineCount > 0) {
    const multiplier = streakMultiplier(streak);
    const clearPts = Math.round(lineClearScore(lineCount) * multiplier);
    score += clearPts;
    events.push({ type: 'scored', delta: clearPts, total: score, kind: 'clear' });
    events.push({ type: 'combo', streak, multiplier, lines: lineCount });
  }

  // 5. Mark the piece placed; refill when the whole tray is exhausted.
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

  // 6. High score.
  const highScore = Math.max(state.highScore, score);

  // 7. Update the target mask: any cleared cell that was a target is now gone.
  const targets = state.targets.slice();
  for (const c of clearedCells) targets[idx(c.row, c.col)] = 0;
  const targetsRemaining = countMask(targets);

  // 8. Resolve end-of-move status per mode (against the post-refill tray).
  const unplaced = tray.filter((p) => !p.placed);
  const deadEnd = unplaced.length > 0 && unplaced.every((p) => !hasAnyPlacement(board, p.shape));

  let status: GameStatus = 'playing';
  if (state.mode === 'levels') {
    // Winning (targets cleared AND score reached) takes precedence over a dead-end.
    if (targetsRemaining === 0 && score >= state.targetScore) {
      status = 'levelcomplete';
      events.push({ type: 'levelcomplete', level: state.level, score });
    } else if (deadEnd) {
      status = 'levelfailed';
      events.push({ type: 'levelfailed', level: state.level });
    }
  } else if (deadEnd) {
    status = 'gameover';
    events.push({ type: 'gameover', finalScore: score, highScore });
  }

  return {
    ok: true,
    state: {
      board,
      tray,
      score,
      highScore,
      status,
      rngState,
      pieceSeq,
      streak,
      mode: state.mode,
      level: state.level,
      targetScore: state.targetScore,
      targets,
      targetsTotal: state.targetsTotal,
    },
    events,
  };
}
