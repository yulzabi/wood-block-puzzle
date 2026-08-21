/**
 * App shell / orchestrator.
 *
 * Holds the single source of truth (`GameState`), wires the drag controller to
 * the pure engine, and applies each move's resulting state + events to the
 * views (render, animate, haptics, score pop-ups). Owns screen navigation and
 * both modes: Endless (home -> playing -> game-over) and Levels
 * (home -> playing -> level-complete / level-failed).
 */

import './styles/game.css';

import type { GameState, Move } from './core/types';
import {
  applyMove,
  newGame,
  newLevelsGame,
  nextLevel,
  restart,
  retryLevel,
  startGame,
} from './core/game';
import { canPlace } from './core/board';
import {
  loadHighScore,
  saveHighScore,
  loadLevelProgress,
  saveLevelProgress,
  loadSettings,
  saveSettings,
  loadStats,
  saveStats,
  loadSeenIntro,
  saveSeenIntro,
  type Settings,
  type Stats,
} from './platform/storage';
import { HAPTIC_CLEAR, HAPTIC_PLACE, setHapticsEnabled, vibrate } from './platform/haptics';
import { playClear, playPlace, setSoundEnabled } from './platform/audio';
import { createInstallController, type InstallController } from './platform/install';
import {
  createScreens,
  renderGameOver,
  renderHome,
  renderInstallAffordance,
  renderConfirm,
  renderIntro,
  renderLevelComplete,
  renderLevelFailed,
  renderSettings,
  renderStats,
  type InstallAffordance,
  type Screens,
} from './ui/screens';
import { BoardView } from './ui/board-view';
import { TrayView } from './ui/tray-view';
import { HUD, formatMultiplier } from './ui/hud';
import { DragController } from './input/drag-controller';
import { KeyboardController } from './input/keyboard-controller';
import { createParticles, type Particles } from './ui/particles';

export class App {
  private readonly screens: Screens;
  private readonly boardView: BoardView;
  private readonly trayView: TrayView;
  private readonly hud: HUD;
  private readonly drag: DragController;
  private readonly keyboard: KeyboardController;
  private readonly install: InstallController;
  private readonly installAffordance: InstallAffordance | null;
  private readonly live: HTMLElement;
  private readonly particles: Particles;
  private settings: Settings;
  private stats: Stats;
  private state: GameState;

  constructor(root: HTMLElement) {
    this.screens = createScreens(root);
    this.install = createInstallController();
    this.install.init();

    // Apply persisted settings + load stats before anything can play sound/haptics.
    this.settings = loadSettings();
    setSoundEnabled(this.settings.sound);
    setHapticsEnabled(this.settings.haptics);
    this.stats = loadStats();

    // Decorative line-clear particle overlay (no-op under reduced-motion).
    this.particles = createParticles(root);

    // Visually-hidden live region for screen-reader announcements.
    this.live = document.createElement('div');
    this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('aria-atomic', 'true');
    root.append(this.live);

    // Build the install affordance once; it's re-appended each time we render home.
    this.installAffordance = renderInstallAffordance(this.install, () => {
      void this.install.prompt();
    });
    if (this.installAffordance) {
      window.addEventListener('beforeinstallprompt', () => this.installAffordance?.reveal());
      window.addEventListener('appinstalled', () => this.installAffordance?.markInstalled());
    }

    // Build the in-game layout: top bar (menu) / HUD / board / tray.
    const layout = document.createElement('div');
    layout.className = 'game-layout';
    const topBar = document.createElement('div');
    topBar.className = 'game-topbar';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn btn--ghost game-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Back to menu');
    menuBtn.textContent = '← Menu';
    menuBtn.addEventListener('click', () => this.confirmQuit());
    topBar.append(menuBtn);
    const hudEl = document.createElement('div');
    const boardWrap = document.createElement('div');
    boardWrap.className = 'board-wrap';
    const trayEl = document.createElement('div');
    layout.append(topBar, hudEl, boardWrap, trayEl);
    this.screens.game.append(layout);

    this.hud = new HUD(hudEl);
    this.boardView = new BoardView(boardWrap);
    this.trayView = new TrayView(trayEl);

    this.drag = new DragController({
      trayEl: this.trayView.el,
      boardView: this.boardView,
      getPieces: () => this.state.tray,
      canPlaceAt: (shape, at) => canPlace(this.state.board, shape, at),
      onPlace: (move) => this.handlePlace(move),
    });
    this.drag.attach();

    this.keyboard = new KeyboardController({
      trayEl: this.trayView.el,
      boardView: this.boardView,
      getPieces: () => this.state.tray,
      canPlaceAt: (shape, at) => canPlace(this.state.board, shape, at),
      onPlace: (move) => this.handlePlace(move),
      announce: (msg) => this.announce(msg),
    });
    this.keyboard.attach();

    this.state = newGame(Date.now(), loadHighScore());
    this.renderHomeScreen();
    this.screens.show('home');

    // First run: show the "How to play" intro once — but on a later frame, so the
    // (opaque) home screen paints first. Showing the opacity-0 overlay entrance
    // synchronously here would gate First Contentful Paint on the initial load.
    if (!loadSeenIntro()) {
      // Wait until the home screen has painted before overlaying the intro.
      // (Showing the opacity-0 overlay as the first paint suppresses FCP.)
      requestAnimationFrame(() =>
        window.setTimeout(() => {
          // Don't pop the intro over a game the user started during the delay.
          if (this.state.status !== 'playing') this.showIntro();
        }, 450),
      );
    }
  }

  /** Render the home menu and (re)attach the install affordance below it. */
  private renderHomeScreen(): void {
    renderHome(this.screens.home, {
      onLevels: () => this.playLevels(loadLevelProgress()),
      onEndless: () => this.playEndless(),
      currentLevel: loadLevelProgress(),
      onSettings: () => this.showSettings(),
      onStats: () => this.showStats(),
      onHowTo: () => this.showIntro(),
    });
    if (this.installAffordance) this.screens.home.append(this.installAffordance.el);
  }

  // ---- Overlays: settings / stats / intro ----
  private showSettings(): void {
    renderSettings(this.screens.overlay, {
      settings: this.settings,
      onChange: (next) => this.applySettings(next),
      onClose: () => this.closeOverlay(),
    });
    this.screens.show('overlay');
  }

  private applySettings(next: Settings): void {
    this.settings = next;
    saveSettings(next);
    setSoundEnabled(next.sound);
    setHapticsEnabled(next.haptics);
  }

  private showStats(): void {
    this.stats = loadStats();
    renderStats(this.screens.overlay, {
      stats: this.stats,
      onClose: () => this.closeOverlay(),
    });
    this.screens.show('overlay');
  }

  private showIntro(): void {
    renderIntro(this.screens.overlay, {
      onDismiss: () => {
        saveSeenIntro();
        this.closeOverlay();
      },
    });
    this.screens.show('overlay');
  }

  private closeOverlay(): void {
    this.renderHomeScreen();
    this.screens.show('home');
  }

  /** Count a new game attempt. */
  private bumpGames(): void {
    this.stats = { ...this.stats, gamesPlayed: this.stats.gamesPlayed + 1 };
    saveStats(this.stats);
  }

  /** Start an Endless game. */
  private playEndless(): void {
    this.state = startGame(newGame(Date.now(), loadHighScore())).state;
    this.bumpGames();
    this.enterGame();
  }

  /** Start a Levels game at `level`. */
  private playLevels(level: number): void {
    this.state = newLevelsGame(level, Date.now(), loadHighScore());
    this.bumpGames();
    this.enterGame();
  }

  /** Shared entry into the in-game view. */
  private enterGame(): void {
    this.hud.reset();
    this.renderAll();
    this.screens.show('game');
    this.setInteractive(true);
    if (this.state.mode === 'levels') {
      this.announce(
        `Level ${this.state.level}. Clear ${this.state.targetsTotal} blocks and reach ${this.state.targetScore} points.`,
      );
    } else {
      this.announce('Endless mode. Place pieces to clear lines.');
    }
  }

  /** Enable/disable both pointer and keyboard placement together. */
  private setInteractive(enabled: boolean): void {
    this.drag.setInteractive(enabled);
    this.keyboard.setInteractive(enabled);
  }

  /** Push a message to the screen-reader live region. */
  private announce(message: string): void {
    this.live.textContent = message;
  }

  private renderAll(): void {
    this.boardView.renderBoard(
      this.state.board,
      this.state.mode === 'levels' ? this.state.targets : undefined,
    );
    this.trayView.renderTray(this.state.tray);
    this.renderHud();
  }

  /** Draw the HUD variant appropriate to the current mode. */
  private renderHud(): void {
    if (this.state.mode === 'levels') {
      this.hud.renderLevels(
        this.state.level,
        this.state.score,
        this.state.targetScore,
        this.targetsLeft(),
        this.state.targetsTotal,
      );
    } else {
      this.hud.render(this.state.score, this.state.highScore);
    }
  }

  /** Count of target blocks still on the board (Levels mode). */
  private targetsLeft(): number {
    const t = this.state.targets;
    let n = 0;
    for (let i = 0; i < t.length; i++) if (t[i] !== 0) n++;
    return n;
  }

  /** Apply a placement Move and reflect the resulting state + events in the UI. */
  private handlePlace(move: Move): void {
    if (this.state.status !== 'playing') return;
    const res = applyMove(this.state, move);
    if (!res.ok) return;

    this.state = res.state;
    this.setInteractive(false);

    // Reflect the new board/tray truth first, then animate the events.
    this.boardView.renderBoard(
      this.state.board,
      this.state.mode === 'levels' ? this.state.targets : undefined,
    );
    this.trayView.renderTray(this.state.tray);

    let placedAt: { x: number; y: number } | null = null;
    let clearedAt: { x: number; y: number } | null = null;
    let linesCleared = 0;
    let combo: { streak: number; multiplier: number } | null = null;

    for (const ev of res.events) {
      switch (ev.type) {
        case 'placed': {
          vibrate(HAPTIC_PLACE);
          playPlace();
          this.boardView.animatePlaced(ev.cells);
          const anchor = ev.cells[0];
          if (anchor) placedAt = this.boardView.cellCenterClient(anchor);
          break;
        }
        case 'cleared': {
          vibrate(HAPTIC_CLEAR);
          playClear(this.state.streak);
          this.boardView.animateCleared(ev.cells);
          linesCleared = ev.rows.length + ev.cols.length;
          this.stats = { ...this.stats, totalLines: this.stats.totalLines + linesCleared };
          // Anchor the clear bonus / combo to the cleared line's centroid.
          clearedAt = this.boardView.cellsCenterClient(ev.cells);
          // Decorative wood-chip burst at the cleared cells.
          const pts = ev.cells
            .map((c) => this.boardView.cellCenterClient(c))
            .filter((p): p is { x: number; y: number } => p !== null);
          this.particles.burst(pts);
          break;
        }
        case 'scored': {
          // Placement points float from the placed piece; the clear bonus from
          // the cleared line.
          const at = ev.kind === 'clear' ? clearedAt ?? placedAt : placedAt;
          if (at) this.hud.popScore(ev.delta, at);
          break;
        }
        case 'combo': {
          combo = { streak: ev.streak, multiplier: ev.multiplier };
          if (ev.streak > this.stats.bestStreak) {
            this.stats = { ...this.stats, bestStreak: ev.streak };
          }
          const at = clearedAt ?? placedAt;
          if (at) this.hud.popCombo(ev.streak, ev.multiplier, at);
          break;
        }
        case 'refill': {
          this.trayView.renderTray(this.state.tray);
          break;
        }
        // 'gameover' / 'levelcomplete' / 'levelfailed' handled after the loop
        // so the final board renders first.
        default:
          break;
      }
    }

    this.renderHud();
    this.announce(this.moveMessage(linesCleared, combo));

    // Persist accumulated stats (best score / lines / streak updated above).
    if (this.state.score > this.stats.bestScore) {
      this.stats = { ...this.stats, bestScore: this.state.score };
    }
    saveStats(this.stats);

    switch (this.state.status) {
      case 'gameover':
        this.announce(`Game over. Final score ${this.state.score}.`);
        this.endGame();
        return;
      case 'levelcomplete':
        this.announce(`Level ${this.state.level} complete! Score ${this.state.score}.`);
        this.onLevelComplete();
        return;
      case 'levelfailed':
        this.announce(`Level ${this.state.level} failed.`);
        this.onLevelFailed();
        return;
      default:
        this.setInteractive(true);
    }
  }

  /** Build the aria-live message for a completed move (incl. streak/combo). */
  private moveMessage(
    linesCleared: number,
    combo: { streak: number; multiplier: number } | null,
  ): string {
    if (linesCleared <= 0) return `Placed. Score ${this.state.score}.`;
    let msg = `Cleared ${linesCleared} ${linesCleared === 1 ? 'line' : 'lines'}.`;
    if (combo && combo.streak >= 2) {
      msg += ` Streak ${combo.streak}, ×${formatMultiplier(combo.multiplier)}.`;
    }
    msg += ` Score ${this.state.score}.`;
    return msg;
  }

  // ---- Endless game over ----
  private endGame(): void {
    const prevHigh = loadHighScore();
    const isNewHigh = this.state.score > prevHigh;
    saveHighScore(this.state.highScore);

    renderGameOver(this.screens.gameover, {
      finalScore: this.state.score,
      highScore: this.state.highScore,
      isNewHigh,
      onRestart: () => this.restartGame(),
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  private restartGame(): void {
    this.state = restart(this.state).state;
    this.bumpGames();
    this.enterGame();
  }

  // ---- Levels ----
  private onLevelComplete(): void {
    // Unlock the next level.
    saveLevelProgress(this.state.level + 1);
    renderLevelComplete(this.screens.gameover, {
      level: this.state.level,
      score: this.state.score,
      onNext: () => this.goNextLevel(),
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  private goNextLevel(): void {
    this.state = nextLevel(this.state).state;
    this.enterGame();
  }

  private onLevelFailed(): void {
    renderLevelFailed(this.screens.gameover, {
      level: this.state.level,
      onRetry: () => this.retryCurrentLevel(),
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  private retryCurrentLevel(): void {
    this.state = retryLevel(this.state).state;
    this.bumpGames();
    this.enterGame();
  }

  /** In-game "← Menu": confirm before abandoning the current run. */
  private confirmQuit(): void {
    if (this.state.status !== 'playing') return;
    this.setInteractive(false); // also stops the keyboard controller's Escape handling
    renderConfirm(this.screens.overlay, {
      title: 'Quit to menu?',
      message: 'Your current game will end.',
      confirmLabel: 'Quit',
      cancelLabel: 'Keep playing',
      onConfirm: () => this.goHome(),
      onCancel: () => this.resumeGame(),
    });
    this.screens.show('overlay');
  }

  /** Cancel the quit confirm and return to the in-progress game. */
  private resumeGame(): void {
    this.screens.show('game');
    this.setInteractive(true);
  }

  private goHome(): void {
    this.state = newGame(Date.now(), loadHighScore());
    this.renderHomeScreen(); // refresh the "resume at level N" hint
    this.screens.show('home');
  }
}

/** Bootstrap the app into the given root element id. */
export function mountApp(rootId = 'app'): App {
  const root = document.getElementById(rootId);
  if (!root) {
    throw new Error(`Root element #${rootId} not found`);
  }
  return new App(root);
}
