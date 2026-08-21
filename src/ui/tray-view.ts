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
import { buildGemMarker, gemColorName } from './gems';

/** Cell size / gap used to render pieces inside the tray (px). */
export const TRAY_CELL = 22;
export const TRAY_GAP = 4;

/** A human-readable name for a shape, for screen-reader labels. */
export function describePiece(shape: Shape): string {
  const n = shape.size;
  const cells = n === 1 ? 'cell' : 'cells';
  const id = shape.id;
  let name: string;
  if (id === 'single') name = 'single block';
  else if (id.startsWith('line')) name = shape.width > shape.height ? 'horizontal line' : 'vertical line';
  else if (id.startsWith('square')) name = 'square';
  else if (id.startsWith('T-')) name = 'T-shape';
  else if (id.startsWith('S-')) name = 'S-shape';
  else if (id.startsWith('Z-')) name = 'Z-shape';
  else if (id.startsWith('corner') || id.startsWith('bigL') || id === 'J4' || id === 'L4') name = 'L-shape';
  else name = 'block';
  return `${name}, ${n} ${cells}`;
}

/** aria-label suffix naming any gems a piece carries (empty for gemless pieces). */
function gemSuffix(piece: Piece): string {
  if (!piece.gems) return '';
  const names = Object.values(piece.gems).map(gemColorName);
  if (names.length === 0) return '';
  return `, carrying ${names.join(' and ')} gem${names.length > 1 ? 's' : ''}`;
}

/**
 * Build a grid of wood blocks laid out to a shape (reused for the drag ghost).
 * If `gems` is given (shape-cell index -> gem color), a colored diamond is drawn
 * on those cells so the player sees which incoming piece carries which gems.
 */
export function buildPieceGrid(
  shape: Shape,
  material: number,
  cellPx: number,
  gapPx: number,
  gems?: Readonly<Record<number, number>>,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'piece-grid';
  grid.style.gridTemplateColumns = `repeat(${shape.width}, ${cellPx}px)`;
  grid.style.gridTemplateRows = `repeat(${shape.height}, ${cellPx}px)`;
  grid.style.gap = `${gapPx}px`;

  shape.cells.forEach((c, k) => {
    const block = document.createElement('div');
    block.className = 'block';
    block.style.gridColumn = String(c.col + 1);
    block.style.gridRow = String(c.row + 1);
    block.style.setProperty('--block', `var(--wood-${material})`);
    const gemColor = gems?.[k];
    if (gemColor) block.append(buildGemMarker(gemColor));
    grid.append(block);
  });
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
      pieceEl.tabIndex = 0;
      pieceEl.setAttribute('role', 'button');
      pieceEl.setAttribute('aria-label', describePiece(piece.shape) + gemSuffix(piece));
      pieceEl.append(buildPieceGrid(piece.shape, piece.material, TRAY_CELL, TRAY_GAP, piece.gems));
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
