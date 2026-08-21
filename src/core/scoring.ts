/**
 * Scoring rules (pure).
 *
 * Placement: +1 point per placed cell.
 * Line clear: triangular bonus — clearing `k` lines at once scores 10·k(k+1)/2
 * (1→10, 2→30, 3→60, 4→100), so multi-line clears are rewarded steeply.
 */

/** Points for placing a piece of `cellCount` cells. */
export function placementScore(cellCount: number): number {
  return cellCount;
}

/** Bonus for clearing `lineCount` lines (rows + columns) with a single placement. */
export function lineClearScore(lineCount: number): number {
  if (lineCount <= 0) return 0;
  return (10 * (lineCount * (lineCount + 1))) / 2;
}

/**
 * Streak (strike) multiplier applied to the line-clear bonus. Clearing lines on
 * consecutive placements builds a streak: ×1 for the first (streak ≤ 1), then
 * +0.5 per consecutive clear, capped at ×4 (streak 2→1.5, 3→2, …, 7+→4).
 */
export function streakMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return Math.min(1 + 0.5 * (streak - 1), 4);
}
