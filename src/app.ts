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
import { canPlace, firstPlacement, linesCompletedBy } from './core/board';
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
import { HUD, formatMultiplier, type GemChip } from './ui/hud';
import { gemColorName } from './ui/gems';
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
  /** In-game top bar + hint button (the button is added/removed by settings). */
  private readonly topBar: HTMLElement;
  private readonly hintBtn: HTMLButtonElement;
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
    this.topBar = topBar;

    // The "Hint" button is only present in the DOM when hints are enabled
    // (opt-in assist, off by default). syncHintButton() adds/removes it.
    this.hintBtn = document.createElement('button');
    this.hintBtn.className = 'btn btn--ghost game-hint-btn';
    this.hintBtn.type = 'button';
    this.hintBtn.setAttribute('aria-label', 'Show a placement hint');
    this.hintBtn.textContent = '💡 Hint';
    this.hintBtn.addEventListener('click', () => this.showHint());

    const hudEl = document.createElement('div');
    const boardWrap = document.createElement('div');
    boardWrap.className = 'board-wrap';
    const trayEl = document.createElement('div');
    layout.append(topBar, hudEl, boardWrap, trayEl);
    this.screens.game.append(layout);

    this.hud = new HUD(hudEl);
    this.boardView = new BoardView(boardWrap);
    this.trayView = new TrayView(trayEl);
    // Apply the persisted colorblind-gem preference to the gem-rendering views.
    this.boardView.setColorblindGems(this.settings.colorblindGems);
    this.trayView.setColorblindGems(this.settings.colorblindGems);

    this.drag = new DragController({
      trayEl: this.trayView.el,
      boardView: this.boardView,
      getPieces: () => this.state.tray,
      canPlaceAt: (shape, at) => canPlace(this.state.board, shape, at),
      linesCompletedAt: (shape, at) => linesCompletedBy(this.state.board, shape, at),
      announce: (msg) => this.announce(msg),
      colorblindGems: () => this.settings.colorblindGems,
      onPlace: (move) => this.handlePlace(move),
    });
    this.drag.attach();

    this.keyboard = new KeyboardController({
      trayEl: this.trayView.el,
      boardView: this.boardView,
      getPieces: () => this.state.tray,
      canPlaceAt: (shape, at) => canPlace(this.state.board, shape, at),
      linesCompletedAt: (shape, at) => linesCompletedBy(this.state.board, shape, at),
      onPlace: (move) => this.handlePlace(move),
      announce: (msg) => this.announce(msg),
    });
    this.keyboard.attach();
    this.syncHintButton();

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
    this.syncHintButton();
    // Live-apply the colorblind gem cue (re-render markers if a game is up).
    this.boardView.setColorblindGems(next.colorblindGems);
    this.trayView.setColorblindGems(next.colorblindGems);
    if (this.state.status === 'playing') this.renderAll();
  }

  /** Add or remove the in-game Hint button to match the hints setting. */
  private syncHintButton(): void {
    if (this.settings.hints) {
      if (!this.hintBtn.isConnected) this.topBar.append(this.hintBtn);
    } else {
      this.hintBtn.remove();
    }
  }

  /**
   * Highlight a legal placement for the first unplaced tray piece that fits
   * anywhere (falling through pieces that don't fit), reusing the valid-drop
   * preview. Announces the coordinate for screen-reader users, or "No moves"
   * when nothing fits. Clears any stale preview / line-hint first so the board
   * shows exactly one highlight — the hint.
   */
  private showHint(): void {
    if (this.state.status !== 'playing') return;
    this.boardView.clearPreview();
    this.boardView.clearLineHint();

    for (const piece of this.state.tray) {
      if (piece.placed) continue;
      const at = firstPlacement(this.state.board, piece.shape);
      if (!at) continue;
      const cells = piece.shape.cells.map((c) => ({ row: at.row + c.row, col: at.col + c.col }));
      this.boardView.showPreview(cells, true);
      this.announce(`Hint: row ${at.row + 1}, column ${at.col + 1}`);
      return;
    }
    this.announce('No moves available.');
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
    this.syncHintButton();
    this.screens.show('game');
    this.setInteractive(true);
    if (this.state.mode === 'levels') {
      this.announce(this.objectiveMessage());
    } else {
      this.announce('Endless mode. Place pieces to clear lines.');
    }
  }

  /** Spoken objective for the current level (gem quotas or a score target). */
  private objectiveMessage(): string {
    if (this.state.goalType === 'gems') {
      const parts = this.gemChips().map(({ color, remaining }) => `${remaining} ${gemColorName(color)}`);
      return `Level ${this.state.level}. Clear ${parts.join(', ')} gems.`;
    }
    return `Level ${this.state.level}. Reach ${this.state.targetScore} points.`;
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
      this.state.mode === 'levels' ? this.state.gems : undefined,
    );
    this.trayView.renderTray(this.state.tray);
    this.renderHud();
  }

  /** Draw the HUD variant appropriate to the current mode + goal. */
  private renderHud(): void {
    if (this.state.mode !== 'levels') {
      this.hud.render(this.state.score, this.state.highScore);
    } else if (this.state.goalType === 'gems') {
      this.hud.renderGems(this.state.level, this.gemChips(), this.settings.colorblindGems);
    } else {
      this.hud.renderLevels(
        this.state.level,
        this.state.score,
        this.state.targetScore,
        this.gemsLeft(),
        this.gemTotal(),
      );
    }
  }

  /** Per-color gems still to clear (quota − cleared, clamped at 0), by color. */
  private gemChips(): GemChip[] {
    const cleared = this.state.gemsCleared;
    return Object.entries(this.state.quotas)
      .map(([c, quota]) => ({ color: Number(c), remaining: Math.max(0, quota - (cleared[Number(c)] ?? 0)) }))
      .sort((a, b) => a.color - b.color);
  }

  /** Count of gem blocks still on the board (score-goal Levels progress). */
  private gemsLeft(): number {
    const g = this.state.gems;
    let n = 0;
    for (let i = 0; i < g.length; i++) if (g[i] !== 0) n++;
    return n;
  }

  /** Total gems the current level requires (the score-goal HUD denominator). */
  private gemTotal(): number {
    let n = 0;
    for (const c of Object.values(this.state.quotas)) n += c;
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
      this.state.mode === 'levels' ? this.state.gems : undefined,
    );
    this.trayView.renderTray(this.state.tray);

    let placedAt: { x: number; y: number } | null = null;
    let clearedAt: { x: number; y: number } | null = null;
    let linesCleared = 0;
    let combo: { streak: number; multiplier: number } | null = null;
    let gemsClearedThisMove: Record<number, number> | null = null;

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
        case 'gemsCleared': {
          gemsClearedThisMove = ev.cleared;
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
    this.announce(this.moveMessage(linesCleared, combo, gemsClearedThisMove));

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

  /**
   * Build the single aria-live message for a completed move. On gem levels it
   * composes line + gem clears into one coherent write ("Cleared 2 lines and 3
   * red. 11 red left.") rather than two competing announcements; on score/endless
   * it reports lines + streak + score as before.
   */
  private moveMessage(
    linesCleared: number,
    combo: { streak: number; multiplier: number } | null,
    gemsClearedThisMove: Record<number, number> | null,
  ): string {
    const lineText = `Cleared ${linesCleared} ${linesCleared === 1 ? 'line' : 'lines'}`;

    if (this.state.mode === 'levels' && this.state.goalType === 'gems') {
      if (gemsClearedThisMove && Object.keys(gemsClearedThisMove).length > 0) {
        // Gems only clear via a line clear, so a line is always part of this.
        const gemText = this.formatGemCounts(gemsClearedThisMove);
        const left = this.gemChips().filter((c) => c.remaining > 0);
        const leftText = left.length
          ? ` ${left.map((c) => `${c.remaining} ${gemColorName(c.color)}`).join(', ')} left.`
          : ' All gems cleared!';
        return `${lineText} and ${gemText}.${leftText}`;
      }
      return linesCleared > 0 ? `${lineText}.` : 'Placed.';
    }

    if (linesCleared <= 0) return `Placed. Score ${this.state.score}.`;
    let msg = `${lineText}.`;
    if (combo && combo.streak >= 2) {
      msg += ` Streak ${combo.streak}, ×${formatMultiplier(combo.multiplier)}.`;
    }
    msg += ` Score ${this.state.score}.`;
    return msg;
  }

  /** Format a per-color count map as "3 red, 2 blue". */
  private formatGemCounts(counts: Record<number, number>): string {
    return Object.entries(counts)
      .map(([color, n]) => `${n} ${gemColorName(Number(color))}`)
      .join(', ');
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
