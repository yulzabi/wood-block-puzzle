/**
 * Pointer-Events drag controller.
 *
 * Unifies touch + mouse. On pickup it lifts a board-scaled ghost of the tray
 * piece, tracks the pointer, shows a live valid/invalid preview on the board,
 * and on release either emits a `place` Move or springs the piece back.
 *
 * The origin math (pointer cell + grab anchor -> piece origin) is factored out
 * as the pure `resolveOrigin` so it can be unit-tested without a DOM.
 */

import type { Coord, Move, Piece, Shape } from '../core/types';
import type { BoardView } from '../ui/board-view';
import { buildPieceGrid } from '../ui/tray-view';

/** Pure: the piece origin is the pointer's cell minus the grabbed cell offset. */
export function resolveOrigin(pointerCell: Coord, anchor: Coord): Coord {
  return { row: pointerCell.row - anchor.row, col: pointerCell.col - anchor.col };
}

/** Absolute board cells a shape covers when placed at `origin`. */
function absCells(shape: Shape, origin: Coord): Coord[] {
  return shape.cells.map((c) => ({ row: origin.row + c.row, col: origin.col + c.col }));
}

export interface DragConfig {
  /** The element that hosts the tray pieces (pointerdown target). */
  readonly trayEl: HTMLElement;
  readonly boardView: BoardView;
  /** Current tray pieces (to resolve a dragged id to its shape/material). */
  getPieces(): readonly Piece[];
  /** Whether a shape may be placed at an origin on the current board. */
  canPlaceAt(shape: Shape, at: Coord): boolean;
  /** Called with a valid placement Move on drop. */
  onPlace(move: Move): void;
}

interface DragSession {
  readonly piece: Piece;
  readonly pointerId: number;
  readonly ghost: HTMLElement;
  /** Grabbed shape cell (relative offset). */
  readonly anchor: Coord;
  /** Ghost top-left offset (px) from pointer so the anchor cell sits under it. */
  readonly localAnchorX: number;
  readonly localAnchorY: number;
  readonly lift: number;
  origin: Coord | null;
  valid: boolean;
}

export class DragController {
  private readonly cfg: DragConfig;
  private interactive = true;
  private session: DragSession | null = null;

  constructor(cfg: DragConfig) {
    this.cfg = cfg;
  }

  attach(): void {
    this.cfg.trayEl.addEventListener('pointerdown', this.onPointerDown);
  }

  detach(): void {
    this.cfg.trayEl.removeEventListener('pointerdown', this.onPointerDown);
  }

  setInteractive(enabled: boolean): void {
    this.interactive = enabled;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.interactive || this.session) return;
    const target = e.target as HTMLElement | null;
    const pieceEl = target?.closest<HTMLElement>('.tray-piece') ?? null;
    if (!pieceEl) return;
    const id = pieceEl.dataset['pieceId'];
    if (!id) return;
    const piece = this.cfg.getPieces().find((p) => p.id === id && !p.placed);
    if (!piece) return;

    const cell = this.cfg.boardView.cellSize();
    const gap = this.cfg.boardView.gap();
    if (cell <= 0) return;

    const anchor = this.pickAnchor(pieceEl, piece.shape, e.clientX, e.clientY);
    const step = cell + gap;
    const localAnchorX = anchor.col * step + cell / 2;
    const localAnchorY = anchor.row * step + cell / 2;
    const lift = e.pointerType === 'touch' ? cell * 1.3 : 0;

    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.append(buildPieceGrid(piece.shape, piece.material, cell, gap));
    document.body.append(ghost);

    pieceEl.classList.add('dragging');
    try {
      pieceEl.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort; dragging still works via document-level moves.
    }

    this.session = {
      piece,
      pointerId: e.pointerId,
      ghost,
      anchor,
      localAnchorX,
      localAnchorY,
      lift,
      origin: null,
      valid: false,
    };

    pieceEl.addEventListener('pointermove', this.onPointerMove);
    pieceEl.addEventListener('pointerup', this.onPointerUp);
    pieceEl.addEventListener('pointercancel', this.onPointerCancel);
    pieceEl.addEventListener('lostpointercapture', this.onPointerCancel);

    this.update(e.clientX, e.clientY);
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.session || e.pointerId !== this.session.pointerId) return;
    this.update(e.clientX, e.clientY);
    e.preventDefault();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    const commit = s.origin !== null && s.valid;
    if (commit && s.origin) {
      this.cfg.onPlace({ type: 'place', pieceId: s.piece.id, at: s.origin });
      this.endSession(e, false);
    } else {
      this.endSession(e, true);
    }
    e.preventDefault();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (!this.session || e.pointerId !== this.session.pointerId) return;
    this.endSession(e, true);
  };

  /** Recompute origin + preview and move the ghost. */
  private update(x: number, y: number): void {
    const s = this.session;
    if (!s) return;
    const effY = y - s.lift;
    const pointerCell = this.cfg.boardView.clientToCoord(x, effY);

    if (pointerCell) {
      const origin = resolveOrigin(pointerCell, s.anchor);
      const cells = absCells(s.piece.shape, origin);
      const valid = this.cfg.canPlaceAt(s.piece.shape, origin);
      s.origin = origin;
      s.valid = valid;
      this.cfg.boardView.showPreview(cells, valid);
      // Snap the ghost to the grid cell it would occupy.
      const snap = this.cfg.boardView.cellOriginClient(origin);
      if (snap) this.moveGhost(snap.x, snap.y);
      else this.moveGhost(x - s.localAnchorX, effY - s.localAnchorY);
    } else {
      s.origin = null;
      s.valid = false;
      this.cfg.boardView.clearPreview();
      this.moveGhost(x - s.localAnchorX, effY - s.localAnchorY);
    }
  }

  private moveGhost(x: number, y: number): void {
    if (!this.session) return;
    this.session.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  /** Pick the shape cell nearest the pointer at pickup, using the tray grid geometry. */
  private pickAnchor(pieceEl: HTMLElement, shape: Shape, x: number, y: number): Coord {
    const grid = pieceEl.querySelector<HTMLElement>('.piece-grid');
    const first = shape.cells[0] ?? { row: 0, col: 0 };
    if (!grid) return first;
    const rect = grid.getBoundingClientRect();
    const cols = Math.max(1, shape.width);
    const rows = Math.max(1, shape.height);
    const stepX = rect.width / cols;
    const stepY = rect.height / rows;

    let best = first;
    let bestDist = Infinity;
    for (const c of shape.cells) {
      const cx = rect.left + (c.col + 0.5) * stepX;
      const cy = rect.top + (c.row + 0.5) * stepY;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private endSession(e: PointerEvent, animateBack: boolean): void {
    const s = this.session;
    if (!s) return;
    this.session = null;

    const el = e.currentTarget as HTMLElement | null;
    if (el) {
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerCancel);
      el.removeEventListener('lostpointercapture', this.onPointerCancel);
      try {
        el.releasePointerCapture(s.pointerId);
      } catch {
        // ignore
      }
    }

    this.cfg.boardView.clearPreview();

    const source = this.cfg.trayEl.querySelector<HTMLElement>(
      `.tray-piece[data-piece-id="${s.piece.id}"]`,
    );

    if (animateBack && source) {
      // Spring the ghost back to the tray slot, then remove.
      const from = s.ghost.getBoundingClientRect();
      const to = source.getBoundingClientRect();
      s.ghost.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
      s.ghost.style.transform = `translate3d(${to.left}px, ${to.top}px, 0)`;
      s.ghost.style.opacity = '0';
      void from;
      const cleanup = (): void => {
        s.ghost.remove();
        source.classList.remove('dragging');
      };
      s.ghost.addEventListener('transitionend', cleanup, { once: true });
      window.setTimeout(cleanup, 260);
    } else {
      s.ghost.remove();
      source?.classList.remove('dragging');
    }
  }
}
