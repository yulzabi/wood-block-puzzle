// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createScreens, renderConfirm, renderGameOver } from './screens';

function buttonByText(root: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!btn) throw new Error(`no button "${text}"`);
  return btn;
}

describe('screens (DOM)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.append(root);
  });

  it('show() reveals exactly one screen at a time', () => {
    const s = createScreens(root);
    s.show('game');
    expect(s.game.hidden).toBe(false);
    expect(s.home.hidden).toBe(true);
    expect(s.gameover.hidden).toBe(true);
    expect(s.overlay.hidden).toBe(true);

    s.show('home');
    expect(s.home.hidden).toBe(false);
    expect(s.game.hidden).toBe(true);
  });

  it('renderGameOver shows the score/title/best and wires Play again', () => {
    const s = createScreens(root);
    const onRestart = vi.fn();
    const onHome = vi.fn();
    renderGameOver(s.gameover, {
      finalScore: 120,
      highScore: 120,
      isNewHigh: true,
      onRestart,
      onHome,
    });

    expect(s.gameover.querySelector('.gameover-score')?.textContent).toBe('120');
    expect(s.gameover.querySelector('.gameover-title')?.textContent).toBe('Game Over');
    expect(s.gameover.querySelector('.gameover-best')?.textContent).toContain('New best');

    buttonByText(s.gameover, 'Play again').click();
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onHome).not.toHaveBeenCalled();
  });

  it('renderConfirm focuses the safe default and Escape cancels', () => {
    const s = createScreens(root);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderConfirm(s.overlay, {
      title: 'Quit to menu?',
      message: 'Your current game will end.',
      confirmLabel: 'Quit',
      cancelLabel: 'Keep playing',
      onConfirm,
      onCancel,
    });

    expect(s.overlay.classList.contains('overlay')).toBe(true);
    expect(document.activeElement).toBe(buttonByText(s.overlay, 'Keep playing'));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renderConfirm confirm button triggers the destructive action', () => {
    const s = createScreens(root);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderConfirm(s.overlay, {
      title: 'Quit to menu?',
      message: 'x',
      confirmLabel: 'Quit',
      cancelLabel: 'Keep playing',
      onConfirm,
      onCancel,
    });

    buttonByText(s.overlay, 'Quit').click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
