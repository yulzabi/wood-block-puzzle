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
} from './platform/storage';
import { HAPTIC_CLEAR, HAPTIC_PLACE, vibrate } from './platform/haptics';
import { createInstallController, type InstallController } from './platform/install';
import {
  createScreens,
  renderGameOver,
  renderHome,
  renderInstallAffordance,
  renderLevelComplete,
  renderLevelFailed,
  type InstallAffordance,
  type Screens,
} from './ui/screens';
import { BoardView } from './ui/board-view';
import { TrayView } from './ui/tray-view';
import { HUD } from './ui/hud';
import { DragController } from './input/drag-controller';

export class App {
  private readonly screens: Screens;
  private readonly boardView: BoardView;
  private readonly trayView: TrayView;
  private readonly hud: HUD;
  private readonly drag: DragController;
  private readonly install: InstallController;
  private readonly installAffordance: InstallAffordance | null;
  private state: GameState;

  constructor(root: HTMLElement) {
    this.screens = createScreens(root);
    this.install = createInstallController();
    this.install.init();

    // Build the install affordance once; it's re-appended each time we render home.
    this.installAffordance = renderInstallAffordance(this.install, () => {
      void this.install.prompt();
    });
    if (this.installAffordance) {
      window.addEventListener('beforeinstallprompt', () => this.installAffordance?.reveal());
      window.addEventListener('appinstalled', () => this.installAffordance?.markInstalled());
    }

    // Build the in-game layout: HUD (top), board (middle), tray (bottom).
    const layout = document.createElement('div');
    layout.className = 'game-layout';
    const hudEl = document.createElement('div');
    const boardWrap = document.createElement('div');
    boardWrap.className = 'board-wrap';
    const trayEl = document.createElement('div');
    layout.append(hudEl, boardWrap, trayEl);
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

    this.state = newGame(Date.now(), loadHighScore());
    this.renderHomeScreen();
    this.screens.show('home');
  }

  /** Render the home menu and (re)attach the install affordance below it. */
  private renderHomeScreen(): void {
    renderHome(this.screens.home, {
      onLevels: () => this.playLevels(loadLevelProgress()),
      onEndless: () => this.playEndless(),
      currentLevel: loadLevelProgress(),
    });
    if (this.installAffordance) this.screens.home.append(this.installAffordance.el);
  }

  /** Start an Endless game. */
  private playEndless(): void {
    this.state = startGame(newGame(Date.now(), loadHighScore())).state;
    this.enterGame();
  }

  /** Start a Levels game at `level`. */
  private playLevels(level: number): void {
    this.state = newLevelsGame(level, Date.now(), loadHighScore());
    this.enterGame();
  }

  /** Shared entry into the in-game view. */
  private enterGame(): void {
    this.hud.reset();
    this.renderAll();
    this.screens.show('game');
    this.drag.setInteractive(true);
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
    this.drag.setInteractive(false);

    // Reflect the new board/tray truth first, then animate the events.
    this.boardView.renderBoard(
      this.state.board,
      this.state.mode === 'levels' ? this.state.targets : undefined,
    );
    this.trayView.renderTray(this.state.tray);

    let popAt: { x: number; y: number } | null = null;

    for (const ev of res.events) {
      switch (ev.type) {
        case 'placed': {
          vibrate(HAPTIC_PLACE);
          this.boardView.animatePlaced(ev.cells);
          const anchor = ev.cells[0];
          if (anchor) popAt = this.boardView.cellCenterClient(anchor);
          break;
        }
        case 'cleared': {
          vibrate(HAPTIC_CLEAR);
          this.boardView.animateCleared(ev.cells);
          break;
        }
        case 'scored': {
          if (popAt) this.hud.popScore(ev.delta, popAt);
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

    switch (this.state.status) {
      case 'gameover':
        this.endGame();
        return;
      case 'levelcomplete':
        this.onLevelComplete();
        return;
      case 'levelfailed':
        this.onLevelFailed();
        return;
      default:
        this.drag.setInteractive(true);
    }
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
    this.enterGame();
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
