/**
 * Procedural level generation (pure, deterministic per level number).
 *
 * Two kinds of level (either/or, never both):
 * - Level 1 is a `score` goal: an empty board where the player races to a
 *   target score.
 * - Level 2+ are `gems` goals: clear a per-color quota of gems. Some gems start
 *   on the board; the rest ride in on tray pieces (a later slice). The supply
 *   plan guarantees `startingGems[c] + supply[c] >= quota[c] + margin` per color
 *   so the level is always solvable with slack.
 *
 * Difficulty scales with the level number. Generation is seeded solely by the
 * level number, so a given level always looks the same.
 */

import type { Board, GoalType } from './types';
import { BOARD_SIZE } from './types';
import { createBoard } from './board';
import { nextInt, seedState } from './rng';

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** Never pre-fill more than this many cells (keep the board comfortably playable). */
const MAX_GEMS = 28;
/** Keep at least one empty cell in every row/column so no line starts full. */
const MAX_PER_LINE = BOARD_SIZE - 1;
/** Solvability slack: always plan a few more gems than the quota strictly needs. */
export const GEM_MARGIN = 2;
/** Cap on distinct gem colors per level (keeps the per-color HUD readable). */
const MAX_GEM_COLORS = 3;

/** The win condition for a Levels session: score race (level 1) or gem quota (2+). */
export function goalTypeForLevel(level: number): GoalType {
  return level <= 1 ? 'score' : 'gems';
}

/**
 * Number of gems a gem-goal level requires cleared (its total quota). Gentle
 * +1/level opening with a quadratic term that accelerates from ~level 6 on,
 * capped at 28.
 */
export function gemCountForLevel(level: number): number {
  const lvl = Math.max(1, level);
  return Math.min(3 + lvl + Math.floor(Math.max(0, lvl - 3) ** 2 / 8), MAX_GEMS);
}

/**
 * Per-color supply plan: how many gems of each color must still be dealt (via
 * tray pieces) so that `startingGems[c] + supply[c] >= quota[c] + margin`.
 * Floored at 0 (a board already over quota+margin needs no supply). Pure.
 */
export function planGemSupply(
  quotas: Record<number, number>,
  startingGems: Record<number, number>,
  margin: number = GEM_MARGIN,
): Record<number, number> {
  const supply: Record<number, number> = {};
  for (const [color, quota] of Object.entries(quotas)) {
    const c = Number(color);
    supply[c] = Math.max(0, quota + margin - (startingGems[c] ?? 0));
  }
  return supply;
}

/** Per-color counts of a gem channel (0 entries omitted). */
function perColorCount(gems: Uint8Array): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const v of gems) if (v !== 0) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
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
 * - Score goal (level 1): empty board, no gems/quotas/supply, a positive
 *   `targetScore`.
 * - Gem goal (level 2+): per-color `quotas`, a scatter of starting `gems` on the
 *   board (fewer than quota — the board holds only a portion), and a
 *   `gemSupplyRemaining` plan so the objective is solvable with margin. Gems
 *   carry a color (`gems[i] === board[i]`). No full row/column is ever
 *   pre-filled (capped at BOARD_SIZE-1 per line), so nothing clears on load.
 *
 * NOTE: This slice produces the plan only — gems are not yet spawned onto tray
 * pieces, and the win condition still uses the pre-split combined check until
 * the engine slice lands.
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
  const goalType = goalTypeForLevel(level);

  if (goalType === 'score') {
    // A clean board score race — no gems.
    return { board, gems, quotas: {}, gemSupplyRemaining: {}, goalType, targetScore: targetScoreForLevel(level) };
  }

  // --- Gem goal (level 2+) ---
  const totalQuota = gemCountForLevel(level);
  const numColors = Math.min(MAX_GEM_COLORS, Math.max(1, 1 + Math.floor((level - 2) / 3)));

  // Per-color quota: distribute the total as evenly as possible (colors 1..N).
  const quotas: Record<number, number> = {};
  const base = Math.floor(totalQuota / numColors);
  const extra = totalQuota % numColors;
  for (let c = 1; c <= numColors; c++) quotas[c] = base + (c <= extra ? 1 : 0);

  // Start with ~half of each color's quota on the board; the rest is supply.
  const toPlace: Record<number, number> = {};
  let startBudget = 0;
  for (let c = 1; c <= numColors; c++) {
    const share = Math.floor((quotas[c] ?? 0) / 2);
    toPlace[c] = share;
    startBudget += share;
  }

  const rowCount = new Uint8Array(BOARD_SIZE);
  const colCount = new Uint8Array(BOARD_SIZE);
  let state = seedState(level * 0x9e3779b1 + 0x1234);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = CELL_COUNT * 40;
  let color = 1; // fill colors in order; advance when a color's board share is met

  while (placed < startBudget && attempts < maxAttempts) {
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

    while (color <= numColors && (toPlace[color] ?? 0) <= 0) color++;
    if (color > numColors) break; // every color's board share is placed
    toPlace[color] = (toPlace[color] ?? 0) - 1;

    board[i] = color;
    gems[i] = color; // the gem rides the pre-filled block, carrying its color
    rowCount[row] = (rowCount[row] ?? 0) + 1;
    colCount[col] = (colCount[col] ?? 0) + 1;
    placed++;
  }

  // Plan supply against what actually landed (the per-line gap cap may under-fill).
  const startingGems = perColorCount(gems);
  const gemSupplyRemaining = planGemSupply(quotas, startingGems, GEM_MARGIN);

  // Gem levels win by quota, not score; targetScore is unused (0).
  return { board, gems, quotas, gemSupplyRemaining, goalType, targetScore: 0 };
}
