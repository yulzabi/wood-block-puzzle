// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createScreens,
  renderConfirm,
  renderGameOver,
  renderSettings,
  renderLevelMap,
  renderLevelCard,
  renderHome,
} from './screens';

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

  it('renderSettings shows a Hints toggle reflecting the current (off) state', () => {
    const s = createScreens(root);
    const onChange = vi.fn();
    renderSettings(s.overlay, {
      settings: { sound: true, haptics: true, hints: false, colorblindGems: false },
      onChange,
      onClose: vi.fn(),
    });

    const hints = buttonByText(s.overlay, 'Hints: Off');
    expect(hints.getAttribute('aria-pressed')).toBe('false');

    // Toggling on reports the new settings with hints flipped, others intact.
    hints.click();
    expect(onChange).toHaveBeenCalledWith({ sound: true, haptics: true, hints: true, colorblindGems: false });
    expect(hints.getAttribute('aria-pressed')).toBe('true');
  });

  it('renderSettings shows a Colorblind gem markers toggle, defaulting off', () => {
    const s = createScreens(root);
    const onChange = vi.fn();
    renderSettings(s.overlay, {
      settings: { sound: true, haptics: true, hints: false, colorblindGems: false },
      onChange,
      onClose: vi.fn(),
    });

    const cb = buttonByText(s.overlay, 'Colorblind gem markers: Off');
    expect(cb.getAttribute('aria-pressed')).toBe('false');

    cb.click();
    expect(onChange).toHaveBeenCalledWith({ sound: true, haptics: true, hints: false, colorblindGems: true });
    expect(cb.getAttribute('aria-pressed')).toBe('true');
  });

  it('renderLevelMap renders locked / completed / current node states as buttons', () => {
    const s = createScreens(root);
    const onPlay = vi.fn();
    const onBack = vi.fn();
    renderLevelMap(s.levelmap, {
      nodes: [
        { level: 1, state: 'completed', current: false, bestScore: 100 },
        { level: 2, state: 'unlocked', current: true, bestScore: 0 },
        { level: 3, state: 'locked', current: false, bestScore: 0 },
      ],
      onPlay,
      onBack,
    });

    const nodes = Array.from(s.levelmap.querySelectorAll<HTMLButtonElement>('.level-node'));
    expect(nodes.length).toBe(3);

    // Completed: enabled, labeled by state, shows the best score.
    expect(nodes[0]!.disabled).toBe(false);
    expect(nodes[0]!.getAttribute('aria-label')).toBe('Level 1, completed, best 100');
    expect(nodes[0]!.querySelector('.level-node-score')?.textContent).toBe('100');

    // Current focal node: highlighted, labeled "current", clickable -> onPlay.
    expect(nodes[1]!.classList.contains('level-node--current')).toBe(true);
    expect(nodes[1]!.getAttribute('aria-label')).toBe('Level 2, current');
    // Nodes are absolutely placed on the curve (hit area sits where it's drawn).
    expect(nodes[1]!.style.left).not.toBe('');
    expect(nodes[1]!.style.top).not.toBe('');
    nodes[1]!.click();
    expect(onPlay).toHaveBeenCalledWith(2);

    // Locked: disabled — not clickable, not keyboard-focusable into a play action.
    expect(nodes[2]!.disabled).toBe(true);
    expect(nodes[2]!.getAttribute('aria-label')).toBe('Level 3, locked');

    buttonByText(s.levelmap, '← Menu').click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renderHome shows a Continue button only when a game is resumable', () => {
    const s = createScreens(root);
    const base = {
      onLevels: vi.fn(),
      onEndless: vi.fn(),
      currentLevel: 1,
      onSettings: vi.fn(),
      onStats: vi.fn(),
      onHowTo: vi.fn(),
    };

    // No resumable game -> no Continue button (don't show a dead button).
    renderHome(s.home, { ...base, canContinue: false, onContinue: vi.fn() });
    expect(Array.from(s.home.querySelectorAll('button')).some((b) => b.textContent === 'Continue')).toBe(false);

    // Resumable game -> Continue appears and is wired.
    const onContinue = vi.fn();
    renderHome(s.home, { ...base, canContinue: true, onContinue });
    const cont = Array.from(s.home.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === 'Continue',
    );
    expect(cont).toBeDefined();
    cont!.click();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('renderLevelCard shows the objective + best score and wires Replay for a completed level', () => {
    const s = createScreens(root);
    const onPlay = vi.fn();
    const onClose = vi.fn();
    renderLevelCard(s.overlay, {
      level: 5,
      completed: true,
      bestScore: 240,
      objective: 'Clear 5 blue gems',
      onPlay,
      onClose,
    });

    expect(s.overlay.querySelector('.level-card-objective')?.textContent).toBe('Clear 5 blue gems');
    expect(s.overlay.querySelector('.gameover-best')?.textContent).toContain('Best 240');
    buttonByText(s.overlay, 'Replay').click();
    expect(onPlay).toHaveBeenCalledOnce();
  });
});
