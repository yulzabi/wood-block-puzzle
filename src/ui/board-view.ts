/**
 * Board rendering + geometry.
 *
 * Builds the 8x8 grid once and reconciles cell fills from a `Board`. Also owns
 * the drag preview highlight and exposes geometry helpers the drag controller
 * needs to map client points to board coordinates.
 *
 * The pure point->cell math is factored out as `pointToCell` so it can be
 * unit-tested without a DOM.
 */

import type { Board, Coord } from '../core/types';
import { BOARD_SIZE } from '../core/types';
import { idx, inBounds } from '../core/board';

/** Everything needed to map a client point onto the grid. */
export interface GridMetrics {
  /** Client-space top-left of cell (0,0). */
  readonly left: number;
  readonly top: number;
  /** Cell edge length in px. */
  readonly cell: number;
  /** Gap between adjacent cells in px. */
  readonly gap: number;
  /** Grid dimension (cells per side). */
  readonly size: number;
}

/**
 * Pure: map a client point to a board cell, or null if outside the grid.
 * A point anywhere within a cell's step (cell + trailing gap) maps to that cell;
 * points left/above the grid or past the last cell return null.
 */
export function pointToCell(m: GridMetrics, x: number, y: number): Coord | null {
  const step = m.cell + m.gap;
  if (step <= 0) return null;
  const lx = x - m.left;
  const ly = y - m.top;
  if (lx < 0 || ly < 0) return null;
  const col = Math.floor(lx / step);
  const row = Math.floor(ly / step);
  if (row < 0 || row >= m.size || col < 0 || col >= m.size) return null;
  return { row, col };
}

export class BoardView {
  readonly el: HTMLElement;
  private readonly cells: HTMLElement[] = [];
  private previewed: HTMLElement[] = [];
  /** Cells currently glowing with the line-completion hint. */
  private lineHinted: HTMLElement[] = [];
  /** Cached grid geometry; null = must re-measure. See metrics(). */
  private cachedMetrics: GridMetrics | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    this.el.setAttribute('role', 'grid');
    this.el.setAttribute('aria-label', `Game board, ${BOARD_SIZE} by ${BOARD_SIZE}`);
    this.el.style.setProperty('--board-size', String(BOARD_SIZE));

    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      const row = Math.floor(i / BOARD_SIZE);
      const col = i % BOARD_SIZE;
      cell.setAttribute('aria-label', `row ${row + 1}, column ${col + 1}, empty`);
      this.cells.push(cell);
      this.el.append(cell);
    }
    container.append(this.el);

    // Grid geometry is stable between layout changes, so cache it and only
    // re-measure when the layout could have shifted. This keeps the drag hot
    // path (clientToCoord + cellOriginClient on every pointermove) from doing
    // ~4 getBoundingClientRect / forced layout flushes per move — the iPad jank.
    const invalidate = (): void => {
      this.cachedMetrics = null;
    };
    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
  }

  /**
   * Reconcile every cell to empty or a wood-tone block by material index.
   * In Levels mode a `targets` mask (1 = a block that must still be cleared) marks
   * those cells as "target" so they read as goal blockers; endless passes nothing.
   */
  renderBoard(board: Board, targets?: Uint8Array): void {
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (!cell) continue;
      const material = board[i] ?? 0;
      if (material > 0) {
        cell.classList.add('filled');
        cell.style.setProperty('--block', `var(--wood-${material})`);
      } else if (cell.classList.contains('filled')) {
        cell.classList.remove('filled');
        cell.style.removeProperty('--block');
      }
      const isTarget = !!targets && (targets[i] ?? 0) !== 0;
      cell.classList.toggle('target', isTarget);

      const row = Math.floor(i / BOARD_SIZE);
      const col = i % BOARD_SIZE;
      const desc = isTarget ? 'target block' : material > 0 ? 'filled' : 'empty';
      cell.setAttribute('aria-label', `row ${row + 1}, column ${col + 1}, ${desc}`);
    }
  }

  /** Highlight the (in-bounds) cells a piece would occupy, valid or invalid. */
  showPreview(cells: readonly Coord[], valid: boolean): void {
    this.clearPreview();
    const cls = valid ? 'preview--valid' : 'preview--invalid';
    for (const { row, col } of cells) {
      if (!inBounds(row, col)) continue;
      const cell = this.cells[idx(row, col)];
      if (!cell) continue;
      cell.classList.add('preview', cls);
      this.previewed.push(cell);
    }
  }

  clearPreview(): void {
    for (const cell of this.previewed) {
      cell.classList.remove('preview', 'preview--valid', 'preview--invalid');
    }
    this.previewed = [];
  }

  /** Glow the full rows/cols a valid drop would complete (line-completion hint). */
  showLineHint(rows: readonly number[], cols: readonly number[]): void {
    this.clearLineHint();
    const mark = (i: number): void => {
      const cell = this.cells[i];
      if (!cell) return;
      cell.classList.add('line-hint');
      this.lineHinted.push(cell);
    };
    for (const row of rows) for (let col = 0; col < BOARD_SIZE; col++) mark(idx(row, col));
    for (const col of cols) for (let row = 0; row < BOARD_SIZE; row++) mark(idx(row, col));
  }

  clearLineHint(): void {
    for (const cell of this.lineHinted) cell.classList.remove('line-hint');
    this.lineHinted = [];
  }

  /** Brief pop on freshly placed cells (real polish handled by a later pass). */
  animatePlaced(cells: readonly Coord[]): void {
    this.pulse(cells, 'just-placed', 220);
  }

  /** Brief flash on cells that were cleared (they are already empty in state). */
  animateCleared(cells: readonly Coord[]): void {
    this.pulse(cells, 'just-cleared', 320);
  }

  private pulse(cells: readonly Coord[], cls: string, ms: number): void {
    const touched: HTMLElement[] = [];
    for (const { row, col } of cells) {
      if (!inBounds(row, col)) continue;
      const cell = this.cells[idx(row, col)];
      if (!cell) continue;
      cell.classList.add(cls);
      touched.push(cell);
    }
    if (touched.length === 0) return;
    window.setTimeout(() => {
      for (const cell of touched) cell.classList.remove(cls);
    }, ms);
  }

  /**
   * Current grid metrics, or null if the board is not laid out yet. Cached: the
   * geometry is re-measured only after a layout change (resize/orientation/scroll)
   * or an explicit `invalidateMetrics()`, so a drag reads layout zero times per
   * move. A null result (not laid out) is not cached, so it retries next call.
   */
  metrics(): GridMetrics | null {
    if (this.cachedMetrics) return this.cachedMetrics;
    const c0 = this.cells[0];
    const c1 = this.cells[1];
    if (!c0 || !c1) return null;
    const r0 = c0.getBoundingClientRect();
    if (r0.width === 0) return null;
    const r1 = c1.getBoundingClientRect();
    const gap = Math.max(0, r1.left - r0.right);
    this.cachedMetrics = { left: r0.left, top: r0.top, cell: r0.width, gap, size: BOARD_SIZE };
    return this.cachedMetrics;
  }

  /** Drop cached geometry so the next metrics() re-measures (e.g. at drag start). */
  invalidateMetrics(): void {
    this.cachedMetrics = null;
  }

  clientToCoord(x: number, y: number): Coord | null {
    const m = this.metrics();
    return m ? pointToCell(m, x, y) : null;
  }

  cellSize(): number {
    return this.metrics()?.cell ?? 0;
  }

  gap(): number {
    return this.metrics()?.gap ?? 0;
  }

  /** Client-space top-left of a cell (for snapping the drag ghost to the grid). */
  cellOriginClient(coord: Coord): { x: number; y: number } | null {
    const m = this.metrics();
    if (!m) return null;
    const step = m.cell + m.gap;
    return { x: m.left + coord.col * step, y: m.top + coord.row * step };
  }

  /** Client-space center of a cell (for positioning score pop-ups). */
  cellCenterClient(coord: Coord): { x: number; y: number } | null {
    const origin = this.cellOriginClient(coord);
    const cell = this.cellSize();
    if (!origin) return null;
    return { x: origin.x + cell / 2, y: origin.y + cell / 2 };
  }

  /**
   * Client-space centroid of a set of cells (average of their centers) — used to
   * anchor the clear-bonus pop-up / combo indicator to the cleared line rather
   * than an arbitrary placement cell. Returns null if none resolve.
   */
  cellsCenterClient(cells: readonly Coord[]): { x: number; y: number } | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const c of cells) {
      const p = this.cellCenterClient(c);
      if (!p) continue;
      sx += p.x;
      sy += p.y;
      n++;
    }
    if (n === 0) return null;
    return { x: sx / n, y: sy / n };
  }
}
