/**
 * Screen management for the app-frame.
 *
 * Builds the single portrait app-frame and the stacked screen containers
 * (home / game / game-over) and toggles visibility between them without page
 * reloads. Screen *content* is populated by the app shell and later steps;
 * this module owns only the frame and the show/hide transitions.
 */

import type { Settings, Stats } from '../platform/storage';

export type ScreenName = 'home' | 'game' | 'gameover' | 'overlay';

export interface Screens {
  readonly frame: HTMLElement;
  readonly home: HTMLElement;
  readonly game: HTMLElement;
  readonly gameover: HTMLElement;
  /** Generic modal overlay surface (settings / stats / first-run intro). */
  readonly overlay: HTMLElement;
  show(name: ScreenName): void;
}

/** Build the app-frame and its screen containers inside `root`. */
export function createScreens(root: HTMLElement): Screens {
  root.textContent = '';

  const frame = el('div', 'app-frame');

  const home = el('section', 'screen');
  home.id = 'screen-home';

  const game = el('section', 'screen play-surface');
  game.id = 'screen-game';
  game.hidden = true;

  const gameover = el('section', 'screen');
  gameover.id = 'screen-gameover';
  gameover.hidden = true;

  const overlay = el('section', 'screen');
  overlay.id = 'screen-overlay';
  overlay.hidden = true;

  frame.append(home, game, gameover, overlay);
  root.append(frame);

  const map: Record<ScreenName, HTMLElement> = { home, game, gameover, overlay };

  return {
    frame,
    home,
    game,
    gameover,
    overlay,
    show(name: ScreenName): void {
      (Object.keys(map) as ScreenName[]).forEach((key) => {
        map[key].hidden = key !== name;
      });
      // Retrigger the app-like enter transition each time a screen is shown.
      const shown = map[name];
      shown.classList.remove('screen-enter');
      void shown.offsetWidth;
      shown.classList.add('screen-enter');
    },
  };
}

/** Minimal slice of the install controller this module needs. */
export interface InstallLike {
  isStandalone(): boolean;
  isIOS(): boolean;
  canPrompt(): boolean;
}

export interface InstallAffordance {
  readonly el: HTMLElement;
  /** Reveal the install button (call when `beforeinstallprompt` fires). */
  reveal(): void;
  /** Hide the affordance (call on `appinstalled`). */
  markInstalled(): void;
}

/**
 * Build the home-screen install affordance:
 * - already installed (standalone) -> nothing (returns null)
 * - iOS -> "Add to Home Screen" guidance (no programmatic prompt exists)
 * - Android/desktop -> an "Install app" button, hidden until the browser offers it
 */
export function renderInstallAffordance(
  install: InstallLike,
  onInstall: () => void,
): InstallAffordance | null {
  if (install.isStandalone()) return null;

  const wrap = el('div', 'install-affordance');

  if (install.isIOS()) {
    const guide = el('p', 'install-ios');
    guide.append(
      document.createTextNode('Install: tap '),
      strong('Share'),
      document.createTextNode(', then '),
      strong('Add to Home Screen'),
    );
    wrap.append(guide);
    return {
      el: wrap,
      reveal(): void {},
      markInstalled(): void {
        wrap.hidden = true;
      },
    };
  }

  const btn = document.createElement('button');
  btn.className = 'btn btn--ghost install-btn';
  btn.type = 'button';
  btn.textContent = 'Install app';
  btn.hidden = !install.canPrompt();
  btn.addEventListener('click', onInstall);
  wrap.append(btn);
  return {
    el: wrap,
    reveal(): void {
      btn.hidden = false;
    },
    markInstalled(): void {
      wrap.hidden = true;
    },
  };
}

function strong(text: string): HTMLElement {
  const node = document.createElement('strong');
  node.textContent = text;
  return node;
}

/** Options for rendering the game-over overlay. */
export interface GameOverOpts {
  readonly finalScore: number;
  readonly highScore: number;
  readonly isNewHigh: boolean;
  onRestart(): void;
  onHome(): void;
}

/** Populate the game-over overlay (final score, best, Restart, Home). */
export function renderGameOver(gameover: HTMLElement, opts: GameOverOpts): void {
  gameover.textContent = '';
  gameover.classList.add('overlay');

  const panel = el('div', 'gameover-panel');

  const title = el('h2', 'title gameover-title');
  title.textContent = 'Game Over';

  const scoreLine = el('p', 'gameover-score');
  scoreLine.textContent = String(opts.finalScore);

  const scoreLabel = el('p', 'gameover-score-label');
  scoreLabel.textContent = 'SCORE';

  const best = el('p', 'gameover-best');
  best.textContent = opts.isNewHigh ? '🏆 New best!' : `Best ${opts.highScore}`;
  if (opts.isNewHigh) best.classList.add('is-new');

  const restart = document.createElement('button');
  restart.className = 'btn btn--primary';
  restart.type = 'button';
  restart.textContent = 'Play again';
  restart.addEventListener('click', opts.onRestart);

  const home = document.createElement('button');
  home.className = 'btn btn--ghost';
  home.type = 'button';
  home.textContent = 'Home';
  home.addEventListener('click', opts.onHome);

  panel.append(scoreLabel, scoreLine, title, best, restart, home);
  gameover.append(panel);

  // Retrigger the enter animation each time the overlay is shown.
  panel.classList.remove('enter');
  void panel.offsetWidth;
  panel.classList.add('enter');
}

/** Options for a generic confirm dialog (e.g. quit-to-menu). */
export interface ConfirmOpts {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Populate a compact confirm overlay. Focus defaults to the (safe) cancel
 * button, and Escape cancels, so a stray Enter/Esc can't trigger the
 * destructive action. Reuses the shared overlay panel styling.
 */
export function renderConfirm(overlay: HTMLElement, opts: ConfirmOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');

  const panel = el('div', 'gameover-panel confirm-panel');

  const title = el('h2', 'title gameover-title');
  title.textContent = opts.title;

  const message = el('p', 'gameover-best');
  message.textContent = opts.message;

  // Cancel is primary + first (focused) so the safe choice is the default.
  const cancel = document.createElement('button');
  cancel.className = 'btn btn--primary';
  cancel.type = 'button';
  cancel.textContent = opts.cancelLabel;
  cancel.addEventListener('click', () => close());

  const confirm = document.createElement('button');
  confirm.className = 'btn btn--ghost';
  confirm.type = 'button';
  confirm.textContent = opts.confirmLabel;
  confirm.addEventListener('click', () => {
    (panel as HTMLElement & { _cleanup?: () => void })._cleanup?.();
    opts.onConfirm();
  });

  function close(): void {
    (panel as HTMLElement & { _cleanup?: () => void })._cleanup?.();
    opts.onCancel();
  }

  panel.append(title, message, cancel, confirm);
  overlay.append(panel);
  replayEnter(panel);
  wireOverlay(panel, close);
  cancel.focus(); // default to the safe action
}

/** Options for the home-screen mode menu. */
export interface HomeOpts {
  onLevels(): void;
  onEndless(): void;
  /** The level the player will resume at (shown as a hint). */
  currentLevel: number;
  onSettings(): void;
  onStats(): void;
  onHowTo(): void;
}

/** Populate the home screen (title + a mode menu: Levels / Endless). */
export function renderHome(home: HTMLElement, opts: HomeOpts): void {
  home.textContent = '';

  const title = el('h1', 'title');
  title.textContent = 'Wood Block Puzzle';

  const subtitle = el('p', 'subtitle');
  subtitle.textContent = 'Fit the blocks. Clear the lines.';

  const menu = el('div', 'home-menu');

  const levels = document.createElement('button');
  levels.className = 'btn btn--primary';
  levels.type = 'button';
  levels.textContent = 'Levels';
  levels.addEventListener('click', opts.onLevels);

  const endless = document.createElement('button');
  endless.className = 'btn btn--primary';
  endless.type = 'button';
  endless.textContent = 'Endless';
  endless.addEventListener('click', opts.onEndless);

  menu.append(levels, endless);

  const hint = el('p', 'home-hint');
  hint.textContent = `Levels resume at level ${opts.currentLevel}`;

  const actions = el('div', 'home-actions');
  actions.append(
    ghostButton('⚙ Settings', opts.onSettings),
    ghostButton('Stats', opts.onStats),
    ghostButton('How to play', opts.onHowTo),
  );

  home.append(title, subtitle, menu, hint, actions);
}

/** A small ghost button used in the home action row / overlays. */
function ghostButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn btn--ghost';
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Wire modal-overlay dismissal: Escape closes, and the returned cleanup detaches
 * the key listener. Focuses the first focusable control for keyboard users.
 */
function wireOverlay(panel: HTMLElement, onClose: () => void): void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.removeEventListener('keydown', onKey);
      onClose();
    }
  };
  window.addEventListener('keydown', onKey);
  // Wrap any close callers so the listener is always removed.
  panel.dataset['overlay'] = '1';
  const first = panel.querySelector<HTMLElement>('button, [tabindex]');
  if (first) first.focus();
  // Expose a cleanup on the panel so button handlers can detach the listener.
  (panel as HTMLElement & { _cleanup?: () => void })._cleanup = () =>
    window.removeEventListener('keydown', onKey);
}

/** Options for the settings panel. */
export interface SettingsOpts {
  settings: Settings;
  onChange(next: Settings): void;
  onClose(): void;
}

/** Populate the settings overlay: Sound + Haptics toggles, persisted immediately. */
export function renderSettings(overlay: HTMLElement, opts: SettingsOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');
  const current: Settings = { ...opts.settings };

  const panel = el('div', 'gameover-panel settings-panel');
  const title = el('h2', 'title gameover-title');
  title.textContent = 'Settings';

  const toggles = el('div', 'settings-toggles');
  const soundBtn = toggleButton('Sound', current.sound, (on) => {
    current.sound = on;
    opts.onChange({ ...current });
  });
  const hapticsBtn = toggleButton('Haptics', current.haptics, (on) => {
    current.haptics = on;
    opts.onChange({ ...current });
  });
  toggles.append(soundBtn, hapticsBtn);

  const done = document.createElement('button');
  done.className = 'btn btn--primary';
  done.type = 'button';
  done.textContent = 'Done';
  done.addEventListener('click', () => close());

  function close(): void {
    (panel as HTMLElement & { _cleanup?: () => void })._cleanup?.();
    opts.onClose();
  }

  panel.append(title, toggles, done);
  overlay.append(panel);
  replayEnter(panel);
  wireOverlay(panel, close);
}

/** A labeled on/off toggle rendered as an aria-pressed button. */
function toggleButton(
  label: string,
  initial: boolean,
  onToggle: (on: boolean) => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn btn--ghost toggle';
  b.type = 'button';
  let on = initial;
  const paint = (): void => {
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('toggle--on', on);
    b.textContent = `${label}: ${on ? 'On' : 'Off'}`;
  };
  paint();
  b.addEventListener('click', () => {
    on = !on;
    paint();
    onToggle(on);
  });
  return b;
}

/** Options for the stats overlay. */
export interface StatsOpts {
  stats: Stats;
  onClose(): void;
}

/** Populate the stats overlay (games played, lines, best streak, best score). */
export function renderStats(overlay: HTMLElement, opts: StatsOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');

  const panel = el('div', 'gameover-panel');
  const title = el('h2', 'title gameover-title');
  title.textContent = 'Stats';

  const grid = el('div', 'stats-grid');
  grid.append(
    statBox('Games', opts.stats.gamesPlayed),
    statBox('Lines', opts.stats.totalLines),
    statBox('Best streak', opts.stats.bestStreak),
    statBox('Best score', opts.stats.bestScore),
  );

  const done = document.createElement('button');
  done.className = 'btn btn--primary';
  done.type = 'button';
  done.textContent = 'Close';
  done.addEventListener('click', () => close());

  function close(): void {
    (panel as HTMLElement & { _cleanup?: () => void })._cleanup?.();
    opts.onClose();
  }

  panel.append(title, grid, done);
  overlay.append(panel);
  replayEnter(panel);
  wireOverlay(panel, close);
}

function statBox(label: string, value: number): HTMLElement {
  const box = el('div', 'stat-box');
  const v = el('p', 'stat-value');
  v.textContent = String(value);
  const l = el('p', 'stat-label');
  l.textContent = label;
  box.append(v, l);
  return box;
}

/** Options for the first-run intro overlay. */
export interface IntroOpts {
  onDismiss(): void;
}

/** Populate the "How to play" overlay with 3 short steps. */
export function renderIntro(overlay: HTMLElement, opts: IntroOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');

  const panel = el('div', 'gameover-panel intro-panel');
  const title = el('h2', 'title gameover-title');
  title.textContent = 'How to play';

  const steps = document.createElement('ol');
  steps.className = 'intro-steps';
  for (const text of [
    'Drag a piece from the tray onto the board.',
    'Fill a full row or column to clear it and score.',
    'No room for any piece? The game ends — plan ahead!',
  ]) {
    const li = document.createElement('li');
    li.textContent = text;
    steps.append(li);
  }

  const done = document.createElement('button');
  done.className = 'btn btn--primary';
  done.type = 'button';
  done.textContent = 'Got it';
  done.addEventListener('click', () => close());

  function close(): void {
    (panel as HTMLElement & { _cleanup?: () => void })._cleanup?.();
    opts.onDismiss();
  }

  panel.append(title, steps, done);
  overlay.append(panel);
  replayEnter(panel);
  wireOverlay(panel, close);
}

/** Options for the level-complete overlay. */
export interface LevelCompleteOpts {
  readonly level: number;
  readonly score: number;
  onNext(): void;
  onHome(): void;
}

/** Populate the overlay for a cleared level (Level N Complete!, score, Next, Home). */
export function renderLevelComplete(overlay: HTMLElement, opts: LevelCompleteOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');

  const panel = el('div', 'gameover-panel');

  const label = el('p', 'gameover-score-label');
  label.textContent = `LEVEL ${opts.level}`;

  const score = el('p', 'gameover-score');
  score.textContent = String(opts.score);

  const title = el('h2', 'title gameover-title');
  title.textContent = 'Complete!';

  const next = document.createElement('button');
  next.className = 'btn btn--primary';
  next.type = 'button';
  next.textContent = 'Next level';
  next.addEventListener('click', opts.onNext);

  const home = document.createElement('button');
  home.className = 'btn btn--ghost';
  home.type = 'button';
  home.textContent = 'Home';
  home.addEventListener('click', opts.onHome);

  panel.append(label, score, title, next, home);
  overlay.append(panel);
  replayEnter(panel);
}

/** Options for the level-failed overlay. */
export interface LevelFailedOpts {
  readonly level: number;
  onRetry(): void;
  onHome(): void;
}

/** Populate the overlay for a failed level (Level Failed, Retry, Home). */
export function renderLevelFailed(overlay: HTMLElement, opts: LevelFailedOpts): void {
  overlay.textContent = '';
  overlay.classList.add('overlay');

  const panel = el('div', 'gameover-panel');

  const label = el('p', 'gameover-score-label');
  label.textContent = `LEVEL ${opts.level}`;

  const title = el('h2', 'title gameover-title');
  title.textContent = 'Level Failed';

  const hint = el('p', 'gameover-best');
  hint.textContent = 'No moves left — try again';

  const retry = document.createElement('button');
  retry.className = 'btn btn--primary';
  retry.type = 'button';
  retry.textContent = 'Retry';
  retry.addEventListener('click', opts.onRetry);

  const home = document.createElement('button');
  home.className = 'btn btn--ghost';
  home.type = 'button';
  home.textContent = 'Home';
  home.addEventListener('click', opts.onHome);

  panel.append(label, title, hint, retry, home);
  overlay.append(panel);
  replayEnter(panel);
}

/** Retrigger the panel enter animation. */
function replayEnter(panel: HTMLElement): void {
  panel.classList.remove('enter');
  void panel.offsetWidth;
  panel.classList.add('enter');
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
