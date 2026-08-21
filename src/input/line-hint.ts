/**
 * Shared line-completion hint helpers for the placement controllers.
 *
 * Both the pointer (drag) and keyboard controllers show the same "this drop
 * would clear N lines" hint + screen-reader announcement. Keeping the count
 * and the phrasing here means the two paths can't drift (e.g. one pluralizes,
 * the other doesn't).
 */

/** Rows/cols a placement would complete (shape of core `linesCompletedBy`). */
export interface CompletedLines {
  readonly rows: readonly number[];
  readonly cols: readonly number[];
}

/** Total number of full lines a placement would complete. */
export function lineCount(lines: CompletedLines): number {
  return lines.rows.length + lines.cols.length;
}

/**
 * Speech fragment for a clear count — "clears 2 lines", "clears 1 line", or
 * '' when nothing clears. Callers compose it into their own phrasing
 * ("Placing here …" for drag, "Row R, column C — …" for keyboard).
 */
export function clearsFragment(n: number): string {
  if (n <= 0) return '';
  return `clears ${n} line${n === 1 ? '' : 's'}`;
}
