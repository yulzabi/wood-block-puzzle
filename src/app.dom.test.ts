// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountApp } from './app';
import { saveGame, clearEndlessSave } from './platform/storage';
import { startGame, newGame } from './core/game';

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === text);
}

describe('App — Endless resume prompt (DOM)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('Endless prompts Continue/New only when a resumable endless save exists', () => {
    // Seed a resumable endless save.
    saveGame(startGame(newGame(1, 0)).state);
    const app = mountApp('app');
    void app;
    // Tap the Home "Endless" button.
    buttonByText(document.body, 'Endless')!.click();
    // The Continue-or-New prompt should now be visible.
    expect(buttonByText(document.body, 'Continue')).toBeDefined();
    expect(buttonByText(document.body, 'New game')).toBeDefined();
  });

  it('Endless starts fresh (no prompt) when there is no endless save', () => {
    clearEndlessSave();
    mountApp('app');
    buttonByText(document.body, 'Endless')!.click();
    expect(buttonByText(document.body, 'Continue')).toBeUndefined();
    expect(buttonByText(document.body, 'New game')).toBeUndefined();
  });
});
