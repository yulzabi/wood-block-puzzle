/**
 * Keyboard placement controller — full play without a pointer (a11y + desktop).
 *
 * Focus a tray piece and press Enter/Space to pick it up; Arrow keys move the
 * piece's origin cell on the board (clamped in-bounds) with the same live
 * valid/invalid preview the drag uses; Enter/Space drops it; Escape cancels.
 * Drives the same `onPlace` callback as the drag controller.
 */

import type { Coord, Move, Piece, Shape } from '../core/types';
import { BOARD_SIZE } from '../core/types';
import type { BoardView } from '../ui/board-view';

export interface KeyboardConfig {
  readonly trayEl: HTMLElement;
  readonly boardView: BoardView;
  getPieces(): readonly Piece[];
  canPlaceAt(shape: Shape, at: Coord): boolean;
  onPlace(move: Move): void;
  announce(message: string): void;
}

function absCells(shape: Shape, origin: Coord): Coord[] {
  return shape.cells.map((c) => ({ row: origin.row + c.row, col: origin.col + c.col }));
}

/** Keep the whole shape in bounds. */
function clampOrigin(shape: Shape, o: Coord): Coord {
  const maxRow = Math.max(0, BOARD_SIZE - shape.height);
  const maxCol = Math.max(0, BOARD_SIZE - shape.width);
  return {
    row: Math.min(Math.max(0, o.row), maxRow),
    col: Math.min(Math.max(0, o.col), maxCol),
  };
}

export class KeyboardController {
  private readonly cfg: KeyboardConfig;
  private interactive = true;
  private held: { piece: Piece; origin: Coord } | null = null;
  private heldEl: HTMLElement | null = null;

  constructor(cfg: KeyboardConfig) {
    this.cfg = cfg;
  }

  attach(): void {
    this.cfg.trayEl.addEventListener('keydown', this.onTrayKey);
    document.addEventListener('keydown', this.onDocKey);
  }

  detach(): void {
    this.cfg.trayEl.removeEventListener('keydown', this.onTrayKey);
    document.removeEventListener('keydown', this.onDocKey);
  }

  setInteractive(enabled: boolean): void {
    this.interactive = enabled;
    if (!enabled) this.clear();
  }

  /** Pick up a focused tray piece with Enter/Space. */
  private readonly onTrayKey = (e: KeyboardEvent): void => {
    if (!this.interactive || this.held) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as HTMLElement | null;
    const pieceEl = target?.closest<HTMLElement>('.tray-piece') ?? null;
    if (!pieceEl) return;
    const id = pieceEl.dataset['pieceId'];
    if (!id) return;
    const piece = this.cfg.getPieces().find((p) => p.id === id && !p.placed);
    if (!piece) return;

    this.held = { piece, origin: clampOrigin(piece.shape, { row: 0, col: 0 }) };
    this.heldEl = pieceEl;
    pieceEl.classList.add('kb-held');
    this.refresh(false);
    this.cfg.announce('Piece picked up. Arrow keys to move, Enter to place, Escape to cancel.');
    e.preventDefault();
  };

  /** While holding: move / drop / cancel. */
  private readonly onDocKey = (e: KeyboardEvent): void => {
    if (!this.held || !this.interactive) return;
    let handled = true;
    switch (e.key) {
      case 'ArrowUp': this.move(-1, 0); break;
      case 'ArrowDown': this.move(1, 0); break;
      case 'ArrowLeft': this.move(0, -1); break;
      case 'ArrowRight': this.move(0, 1); break;
      case 'Enter':
      case ' ': this.drop(); break;
      case 'Escape': this.cancel(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  };

  private move(dr: number, dc: number): void {
    if (!this.held) return;
    this.held.origin = clampOrigin(this.held.piece.shape, {
      row: this.held.origin.row + dr,
      col: this.held.origin.col + dc,
    });
    this.refresh(true);
  }

  private refresh(announce: boolean): void {
    if (!this.held) return;
    const { piece, origin } = this.held;
    const valid = this.cfg.canPlaceAt(piece.shape, origin);
    this.cfg.boardView.showPreview(absCells(piece.shape, origin), valid);
    if (announce) {
      this.cfg.announce(`Row ${origin.row + 1}, column ${origin.col + 1}${valid ? '' : ', blocked'}`);
    }
  }

  private drop(): void {
    if (!this.held) return;
    const { piece, origin } = this.held;
    if (!this.cfg.canPlaceAt(piece.shape, origin)) {
      this.cfg.announce("Can't place there.");
      return;
    }
    const move: Move = { type: 'place', pieceId: piece.id, at: origin };
    this.clear();
    this.cfg.onPlace(move);
  }

  private cancel(): void {
    const el = this.heldEl;
    this.clear();
    this.cfg.announce('Cancelled.');
    el?.focus();
  }

  private clear(): void {
    this.heldEl?.classList.remove('kb-held');
    this.held = null;
    this.heldEl = null;
    this.cfg.boardView.clearPreview();
  }
}
