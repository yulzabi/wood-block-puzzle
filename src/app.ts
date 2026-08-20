/**
 * App shell / orchestrator.
 *
 * Holds the single source of truth (`GameState`), wires the drag controller to
 * the pure engine, and applies each move's resulting state + events to the
 * views (render, animate, haptics, score pop-ups). Owns screen navigation:
 * home -> playing -> game-over -> restart.
 */

import './styles/game.css';

import type { GameState, Move } from './core/types';
import { applyMove, newGame, restart, startGame } from './core/game';
import { canPlace } from './core/board';
import { loadHighScore, saveHighScore } from './platform/storage';
import { HAPTIC_CLEAR, HAPTIC_PLACE, vibrate } from './platform/haptics';
import { createInstallController, type InstallController } from './platform/install';
import {
  createScreens,
  renderGameOver,
  renderHome,
  renderInstallAffordance,
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
  private state: GameState;

  constructor(root: HTMLElement) {
    this.screens = createScreens(root);
    this.install = createInstallController();
    this.install.init();
    renderHome(this.screens.home, () => this.play());
    this.setupInstall();

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
    this.screens.show('home');
  }

  /** Wire the home-screen install affordance to the platform controller. */
  private setupInstall(): void {
    const affordance = renderInstallAffordance(this.install, () => {
      void this.install.prompt();
    });
    if (!affordance) return;
    this.screens.home.append(affordance.el);
    // The browser fires `beforeinstallprompt` after load; reveal the button then.
    window.addEventListener('beforeinstallprompt', () => affordance.reveal());
    window.addEventListener('appinstalled', () => affordance.markInstalled());
  }

  /** Start a brand-new game from the home screen. */
  private play(): void {
    this.state = startGame(newGame(Date.now(), loadHighScore())).state;
    this.hud.reset();
    this.renderAll();
    this.screens.show('game');
    this.drag.setInteractive(true);
  }

  private renderAll(): void {
    this.boardView.renderBoard(this.state.board);
    this.trayView.renderTray(this.state.tray);
    this.hud.render(this.state.score, this.state.highScore);
  }

  /** Apply a placement Move and reflect the resulting state + events in the UI. */
  private handlePlace(move: Move): void {
    if (this.state.status !== 'playing') return;
    const res = applyMove(this.state, move);
    if (!res.ok) return;

    this.state = res.state;
    this.drag.setInteractive(false);

    // Reflect the new board/tray truth first, then animate the events.
    this.boardView.renderBoard(this.state.board);
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
        case 'gameover':
          // handled after the loop so the final board renders first
          break;
      }
    }

    this.hud.render(this.state.score, this.state.highScore);

    if (this.state.status === 'gameover') {
      this.endGame();
      return;
    }
    this.drag.setInteractive(true);
  }

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
    this.hud.reset();
    this.renderAll();
    this.screens.show('game');
    this.drag.setInteractive(true);
  }

  private goHome(): void {
    this.state = newGame(Date.now(), loadHighScore());
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
