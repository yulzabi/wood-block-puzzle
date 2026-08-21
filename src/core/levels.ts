/**
 * Procedural level generation (pure, deterministic per level number).
 *
 * A level starts with a scatter of pre-filled "target" blocks; the player wins
 * by clearing them all (via full rows/columns) AND reaching the target score.
 * Difficulty scales with the level number. Generation is seeded solely by the
 * level number, so a given level always looks the same.
 */

import type { Board } from './types';
import { BOARD_SIZE, MATERIAL_COUNT } from './types';
import { createBoard } from './board';
import { nextInt, seedState } from './rng';

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** Never pre-fill more than this many cells (keep the board comfortably playable). */
const MAX_TARGETS = 28;
/** Keep at least one empty cell in every row/column so no line starts full. */
const MAX_PER_LINE = BOARD_SIZE - 1;

/**
 * Number of pre-placed target blocks for a level. Gentle +1/level opening
 * (4,5,6,7,8 for levels 1–5) with a quadratic term that accelerates the ramp
 * from ~level 6 on (10,12,14,16,19,22,25,28), capped at 28.
 */
export function targetCountForLevel(level: number): number {
  const lvl = Math.max(1, level);
  return Math.min(3 + lvl + Math.floor(Math.max(0, lvl - 3) ** 2 / 8), MAX_TARGETS);
}

/**
 * Score needed to clear a score-goal level. Convex curve — small early jumps,
 * larger later: 100, 160, 240, 340, 460, 600, … (was a flat +60/level line).
 */
export function targetScoreForLevel(level: number): number {
  const lvl = Math.max(1, level);
  return 100 + 50 * (lvl - 1) + 10 * (lvl - 1) ** 2;
}

/**
 * Build the starting board + target mask + target score for `level`.
 * Deterministic: the same `level` always yields the same result.
 *
 * - `board`: pre-filled cells carry a wood-tone material so they render.
 * - `targets`: a length-64 mask; 1 marks a cell that must still be cleared.
 * No complete row or column is ever pre-filled (capped at BOARD_SIZE-1 per line),
 * so nothing clears on load and the first tray always has room.
 */
export function generateLevel(level: number): { board: Board; targets: Uint8Array; targetScore: number } {
  const board = createBoard();
  const targets = createBoard(); // zeroed Uint8Array(64) reused as a 0/1 mask
  const rowCount = new Uint8Array(BOARD_SIZE);
  const colCount = new Uint8Array(BOARD_SIZE);

  const want = targetCountForLevel(level);
  let placed = 0;
  let state = seedState(level * 0x9e3779b1 + 0x1234);
  let attempts = 0;
  const maxAttempts = CELL_COUNT * 40;

  while (placed < want && attempts < maxAttempts) {
    attempts++;
    const pick = nextInt(state, CELL_COUNT);
    state = pick.state;
    const i = pick.value;
    if (board[i] !== 0) continue; // cell already used
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;
    if ((rowCount[row] ?? 0) >= MAX_PER_LINE || (colCount[col] ?? 0) >= MAX_PER_LINE) {
      continue; // keep a gap in every row/column
    }

    const matPick = nextInt(state, MATERIAL_COUNT);
    state = matPick.state;
    board[i] = matPick.value + 1; // 1..MATERIAL_COUNT
    targets[i] = 1;
    rowCount[row] = (rowCount[row] ?? 0) + 1;
    colCount[col] = (colCount[col] ?? 0) + 1;
    placed++;
  }

  return { board, targets, targetScore: targetScoreForLevel(level) };
}
