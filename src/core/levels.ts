/**
 * Procedural level generation (pure, deterministic per level number).
 *
 * A level starts with a scatter of pre-filled "target" blocks; the player wins
 * by clearing them all (via full rows/columns) AND reaching the target score.
 * Difficulty scales with the level number. Generation is seeded solely by the
 * level number, so a given level always looks the same.
 */

import type { Board, GoalType } from './types';
import { BOARD_SIZE, MATERIAL_COUNT } from './types';
import { createBoard } from './board';
import { nextInt, seedState } from './rng';

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** Never pre-fill more than this many cells (keep the board comfortably playable). */
const MAX_GEMS = 28;
/** Keep at least one empty cell in every row/column so no line starts full. */
const MAX_PER_LINE = BOARD_SIZE - 1;

/**
 * Number of pre-placed gem blocks for a level. Gentle +1/level opening
 * (4,5,6,7,8 for levels 1–5) with a quadratic term that accelerates the ramp
 * from ~level 6 on (10,12,14,16,19,22,25,28), capped at 28.
 */
export function gemCountForLevel(level: number): number {
  const lvl = Math.max(1, level);
  return Math.min(3 + lvl + Math.floor(Math.max(0, lvl - 3) ** 2 / 8), MAX_GEMS);
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
 * Build the starting board + gem channel + goal for `level`.
 * Deterministic: the same `level` always yields the same result.
 *
 * - `board`: pre-filled cells carry a wood-tone material so they render.
 * - `gems`: a length-64 channel; 0 = none, >0 = the gem color on that cell
 *   (mirrors the pre-filled block's material). A gem is cleared when its cell is.
 * - `quotas`: per-color count of the gems placed (the objective total).
 * No complete row or column is ever pre-filled (capped at BOARD_SIZE-1 per line),
 * so nothing clears on load and the first tray always has room.
 *
 * NOTE (P3 migration): levels currently emit `goalType: 'score'` and still carry
 * pre-filled gem blocks with the combined "clear gems AND reach score" win — this
 * preserves the pre-migration behavior. Real per-color gem-goal generation +
 * supply arrives in a later slice.
 */
export function generateLevel(level: number): {
  board: Board;
  gems: Uint8Array;
  quotas: Record<number, number>;
  gemSupplyRemaining: Record<number, number>;
  goalType: GoalType;
  targetScore: number;
} {
  const board = createBoard();
  const gems = createBoard(); // zeroed Uint8Array(64); >0 = gem color on that cell
  const quotas: Record<number, number> = {};
  const rowCount = new Uint8Array(BOARD_SIZE);
  const colCount = new Uint8Array(BOARD_SIZE);

  const want = gemCountForLevel(level);
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
    const color = matPick.value + 1; // 1..MATERIAL_COUNT
    board[i] = color;
    gems[i] = color; // the gem rides the pre-filled block, carrying its color
    quotas[color] = (quotas[color] ?? 0) + 1;
    rowCount[row] = (rowCount[row] ?? 0) + 1;
    colCount[col] = (colCount[col] ?? 0) + 1;
    placed++;
  }

  // gemSupplyRemaining is a gems-goal concept (undrawn supply); unused for these
  // score-goal levels, so it starts empty.
  return { board, gems, quotas, gemSupplyRemaining: {}, goalType: 'score', targetScore: targetScoreForLevel(level) };
}
