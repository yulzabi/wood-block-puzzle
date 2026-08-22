// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountApp } from './app';
import { saveGame, clearEndlessSave, saveDaily, loadDaily } from './platform/storage';
import { startGame, newGame } from './core/game';
import { DEFAULT_DAILY_STATE, formatDay, startDaily } from './core/daily';

function buttonByText(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === text);
}

const today = (): string => formatDay(new Date());

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

describe('App — Daily home entry (DOM)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });
  afterEach(() => {
    localStorage.clear();
  });

  const playBtn = (): HTMLButtonElement | null =>
    document.body.querySelector<HTMLButtonElement>('.daily-play');

  it('offers a fresh "Play Daily" on a clean record', () => {
    mountApp('app');
    expect(playBtn()).not.toBeNull();
    expect(playBtn()!.textContent).toBe('Play Daily');
  });

  it('starting the daily enters the game and consumes the attempt (quit = used)', () => {
    mountApp('app');
    playBtn()!.click();
    // The daily run started (in the game screen) and the attempt is marked used.
    expect(document.getElementById('screen-game')!.hidden).toBe(false);
    expect(loadDaily().lastPlayedDate).toBe(today()); // used at START, not completion
  });

  it('shows the done state (no Play) once today is used with no resumable run', () => {
    // Attempt consumed today, no in-progress daily save → cannot replay.
    saveDaily(startDaily(DEFAULT_DAILY_STATE, today()));
    mountApp('app');
    expect(playBtn()).toBeNull();
    expect(document.body.querySelector('.daily-done')).not.toBeNull();
  });

  it('offers "Resume Daily" when an in-progress daily run exists (same attempt)', () => {
    // A used attempt today AND a resumable daily run in the daily slot.
    saveDaily(startDaily(DEFAULT_DAILY_STATE, today()));
    saveGame(startGame(newGame(1, 0)).state, /* daily */ true);
    mountApp('app');
    expect(playBtn()).not.toBeNull();
    expect(playBtn()!.textContent).toBe('Resume Daily');
  });
});
