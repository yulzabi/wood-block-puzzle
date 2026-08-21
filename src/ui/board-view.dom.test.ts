// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoardView } from './board-view';
import { createBoard } from '../core/board';
import { BOARD_SIZE } from '../core/types';

describe('BoardView (DOM)', () => {
  let container: HTMLElement;
  let view: BoardView;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    view = new BoardView(container);
  });

  const cells = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>('.cell'));

  it('builds an 8x8 grid of ARIA gridcells', () => {
    expect(cells().length).toBe(BOARD_SIZE * BOARD_SIZE);
    expect(container.querySelector('.board')?.getAttribute('role')).toBe('grid');
    expect(cells()[0]!.getAttribute('role')).toBe('gridcell');
  });

  it('fills a cell with its wood-tone material and updates the aria-label', () => {
    const board = createBoard();
    board[0] = 3;
    view.renderBoard(board);

    const c0 = cells()[0]!;
    expect(c0.classList.contains('filled')).toBe(true);
    expect(c0.style.getPropertyValue('--block')).toBe('var(--wood-3)');
    expect(c0.getAttribute('aria-label')).toContain('filled');

    const c1 = cells()[1]!;
    expect(c1.classList.contains('filled')).toBe(false);
    expect(c1.getAttribute('aria-label')).toContain('empty');
  });

  it('marks target cells and labels them "target block"', () => {
    const board = createBoard();
    const targets = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
    board[5] = 2;
    targets[5] = 1;
    view.renderBoard(board, targets);

    const c5 = cells()[5]!;
    expect(c5.classList.contains('target')).toBe(true);
    expect(c5.getAttribute('aria-label')).toContain('target block');
  });

  it('reconciles: a previously-filled cell clears on the next render', () => {
    const board = createBoard();
    board[0] = 4;
    view.renderBoard(board);
    view.renderBoard(createBoard());

    const c0 = cells()[0]!;
    expect(c0.classList.contains('filled')).toBe(false);
    expect(c0.style.getPropertyValue('--block')).toBe('');
  });

  it('showPreview toggles valid/invalid classes; clearPreview removes them', () => {
    view.showPreview(
      [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
      true,
    );
    expect(cells()[0]!.classList.contains('preview')).toBe(true);
    expect(cells()[0]!.classList.contains('preview--valid')).toBe(true);
    expect(cells()[1]!.classList.contains('preview--valid')).toBe(true);

    view.clearPreview();
    expect(cells()[0]!.classList.contains('preview')).toBe(false);
    expect(cells()[0]!.classList.contains('preview--valid')).toBe(false);

    // idx(1,0) === BOARD_SIZE
    view.showPreview([{ row: 1, col: 0 }], false);
    expect(cells()[BOARD_SIZE]!.classList.contains('preview--invalid')).toBe(true);
  });

  it('caches grid metrics (zero per-move layout reads) and re-measures after invalidateMetrics', () => {
    const rect = {
      left: 0, top: 0, right: 32, bottom: 32, width: 32, height: 32, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    try {
      // Several geometry queries (as a drag would do per move) share one measurement.
      view.clientToCoord(10, 10);
      view.clientToCoord(20, 20);
      view.cellOriginClient({ row: 0, col: 0 });
      const afterCached = spy.mock.calls.length;
      expect(afterCached).toBeLessThanOrEqual(2); // one measure = reads cell 0 + cell 1

      // Explicit invalidation (drag start / resize) forces a fresh measurement.
      view.invalidateMetrics();
      view.clientToCoord(10, 10);
      expect(spy.mock.calls.length).toBeGreaterThan(afterCached);
    } finally {
      spy.mockRestore();
    }
  });
});
