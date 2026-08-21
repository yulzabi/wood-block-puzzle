// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { TrayView, describePiece } from './tray-view';
import { SHAPES } from '../core/shapes';
import type { Piece } from '../core/types';

function piece(id: string, shapeIndex: number, material: number, placed = false): Piece {
  const shape = SHAPES[shapeIndex]!;
  return { id, shape, material, placed };
}

describe('TrayView (DOM)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
  });

  it('renders unplaced pieces as focusable, labeled buttons matching the shape', () => {
    const tray = new TrayView(container);
    const p = piece('p1', 0, 2);
    tray.renderTray([p]);

    const el = container.querySelector<HTMLElement>('.tray-piece');
    expect(el).not.toBeNull();
    expect(el!.tabIndex).toBe(0);
    expect(el!.getAttribute('role')).toBe('button');
    expect(el!.getAttribute('aria-label')).toBe(describePiece(p.shape));
    expect(el!.dataset['pieceId']).toBe('p1');
    // one wood block per shape cell
    expect(el!.querySelectorAll('.block').length).toBe(p.shape.size);
  });

  it('renders placed pieces as empty slots', () => {
    const tray = new TrayView(container);
    tray.renderTray([piece('p1', 0, 1, true)]);

    expect(container.querySelector('.tray-piece')).toBeNull();
    expect(container.querySelectorAll('.tray-slot').length).toBe(3);
  });

  it('pieceElement looks up a rendered piece by id', () => {
    const tray = new TrayView(container);
    tray.renderTray([piece('abc', 1, 3)]);

    expect(tray.pieceElement('abc')).not.toBeNull();
    expect(tray.pieceElement('missing')).toBeNull();
  });

  it('setDragging toggles the dragging class on the source piece', () => {
    const tray = new TrayView(container);
    tray.renderTray([piece('abc', 1, 3)]);

    tray.setDragging('abc', true);
    expect(tray.pieceElement('abc')!.classList.contains('dragging')).toBe(true);
    tray.setDragging('abc', false);
    expect(tray.pieceElement('abc')!.classList.contains('dragging')).toBe(false);
  });

  it('renders a gem diamond on the gem-bearing cell and names it in the aria-label', () => {
    const tray = new TrayView(container);
    const p: Piece = { ...piece('p1', 0, 2), gems: { 0: 2 } }; // cell 0 carries color 2 (blue)
    tray.renderTray([p]);

    const el = tray.pieceElement('p1')!;
    const marker = el.querySelector('.gem');
    expect(marker).not.toBeNull();
    expect(marker!.classList.contains('gem--2')).toBe(true);
    expect(el.getAttribute('aria-label')).toContain('carrying blue gem');
  });

  it('gemless pieces carry no gem marker and no gem suffix', () => {
    const tray = new TrayView(container);
    const p = piece('p1', 0, 2);
    tray.renderTray([p]);

    const el = tray.pieceElement('p1')!;
    expect(el.querySelector('.gem')).toBeNull();
    expect(el.getAttribute('aria-label')).toBe(describePiece(p.shape));
  });
});
