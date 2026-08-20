/**
 * Screen management for the app-frame.
 *
 * Builds the single portrait app-frame and the stacked screen containers
 * (home / game / game-over) and toggles visibility between them without page
 * reloads. Screen *content* is populated by the app shell and later steps;
 * this module owns only the frame and the show/hide transitions.
 */

export type ScreenName = 'home' | 'game' | 'gameover';

export interface Screens {
  readonly frame: HTMLElement;
  readonly home: HTMLElement;
  readonly game: HTMLElement;
  readonly gameover: HTMLElement;
  show(name: ScreenName): void;
}

/** Build the app-frame and its screen containers inside `root`. */
export function createScreens(root: HTMLElement): Screens {
  root.textContent = '';

  const frame = el('div', 'app-frame');

  const home = el('section', 'screen play-surface');
  home.id = 'screen-home';

  const game = el('section', 'screen play-surface');
  game.id = 'screen-game';
  game.hidden = true;

  const gameover = el('section', 'screen');
  gameover.id = 'screen-gameover';
  gameover.hidden = true;

  frame.append(home, game, gameover);
  root.append(frame);

  const map: Record<ScreenName, HTMLElement> = { home, game, gameover };

  return {
    frame,
    home,
    game,
    gameover,
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

/** Populate the home screen (title + Play button). */
export function renderHome(home: HTMLElement, onPlay: () => void): void {
  home.textContent = '';

  const title = el('h1', 'title');
  title.textContent = 'Wood Block Puzzle';

  const subtitle = el('p', 'subtitle');
  subtitle.textContent = 'Fit the blocks. Clear the lines.';

  const play = document.createElement('button');
  play.className = 'btn btn--primary';
  play.type = 'button';
  play.textContent = 'Play';
  play.addEventListener('click', onPlay);

  home.append(title, subtitle, play);
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
