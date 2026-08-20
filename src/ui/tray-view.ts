/**
 * Tray rendering.
 *
 * Renders the three offered pieces as proportional mini-grids of wood blocks.
 * Placed pieces render as empty slots. Exposes the per-piece element and a
 * `buildPieceGrid` helper reused by the drag ghost so the lifted piece matches
 * the board's visual language.
 */

import type { Piece, Shape } from '../core/types';
import { TRAY_SIZE } from '../core/types';

/** Cell size / gap used to render pieces inside the tray (px). */
export const TRAY_CELL = 22;
export const TRAY_GAP = 4;

/** Build a grid of wood blocks laid out to a shape (reused for the drag ghost). */
export function buildPieceGrid(
  shape: Shape,
  material: number,
  cellPx: number,
  gapPx: number,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'piece-grid';
  grid.style.gridTemplateColumns = `repeat(${shape.width}, ${cellPx}px)`;
  grid.style.gridTemplateRows = `repeat(${shape.height}, ${cellPx}px)`;
  grid.style.gap = `${gapPx}px`;

  for (const c of shape.cells) {
    const block = document.createElement('div');
    block.className = 'block';
    block.style.gridColumn = String(c.col + 1);
    block.style.gridRow = String(c.row + 1);
    block.style.setProperty('--block', `var(--wood-${material})`);
    grid.append(block);
  }
  return grid;
}

export class TrayView {
  readonly el: HTMLElement;
  private readonly slots: HTMLElement[] = [];

  constructor(container: HTMLElement) {
    this.el = container;
    this.el.classList.add('tray');
    for (let i = 0; i < TRAY_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'tray-slot';
      this.slots.push(slot);
      this.el.append(slot);
    }
  }

  /** Render the current tray; unplaced pieces become draggable, placed ones vanish. */
  renderTray(tray: readonly Piece[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      slot.textContent = '';
      const piece = tray[i];
      if (!piece || piece.placed) continue;

      const pieceEl = document.createElement('div');
      pieceEl.className = 'tray-piece';
      pieceEl.dataset['pieceId'] = piece.id;
      pieceEl.append(buildPieceGrid(piece.shape, piece.material, TRAY_CELL, TRAY_GAP));
      slot.append(pieceEl);
    }
  }

  pieceElement(id: string): HTMLElement | null {
    return this.el.querySelector<HTMLElement>(`.tray-piece[data-piece-id="${id}"]`);
  }

  /** Dim the source piece while it is being dragged (restored on invalid drop). */
  setDragging(id: string, dragging: boolean): void {
    const el = this.pieceElement(id);
    if (el) el.classList.toggle('dragging', dragging);
  }
}
