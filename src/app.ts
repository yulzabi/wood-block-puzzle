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
import { generateLevel } from './core/levels';
import { streakMultiplier } from './core/scoring';
import {
  canPlayDaily,
  dailySeedFor,
  formatDay,
  recordDailyResult,
  startDaily,
} from './core/daily';
import {
  loadHighScore,
  saveHighScore,
  loadLevelProgress,
  saveLevelProgress,
  saveLevelResult,
  loadLevelResults,
  levelResult,
  nextLevelToPlay,
  scheduleSaveGame,
  flushSaveGame,
  loadEndlessSave,
  loadLevelsSave,
  hasEndlessSave,
  clearEndlessSave,
  clearLevelsSave,
  loadDaily,
  saveDaily,
  loadDailySave,
  hasDailySave,
  clearDailySave,
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
  renderLevelMap,
  renderLevelCard,
  renderDailyOver,
  renderSettings,
  renderStats,
  type InstallAffordance,
  type LevelMapNode,
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
  /** True while the current game is today's Daily run (routes its save to the daily slot). */
  private isDaily = false;

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

    // The per-move save is deferred to idle (off the placement frame); flush it
    // synchronously when the app is backgrounded / hidden / closed so an iOS
    // app-switch, a reload, or a service-worker "Refresh" never loses it.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSaveGame();
    });
    window.addEventListener('pagehide', () => flushSaveGame());

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

  /** Today's local calendar day (`YYYY-MM-DD`) — the app's single daily clock read. */
  private today(): string {
    return formatDay(new Date());
  }

  /** Schedule the coalesced idle save for the current game, routed to the right slot. */
  private scheduleSave(): void {
    scheduleSaveGame(this.state, this.isDaily);
  }

  /** Render the home menu and (re)attach the install affordance below it. */
  private renderHomeScreen(): void {
    const today = this.today();
    const daily = loadDaily();
    const resumable = hasDailySave(); // an in-progress daily run (same attempt) can resume
    renderHome(this.screens.home, {
      onLevels: () => this.showLevelMap(),
      onEndless: () => this.enterEndless(),
      currentLevel: loadLevelProgress(),
      daily: {
        // Playable if there's a run to resume, or today's single attempt is unused.
        playable: resumable || canPlayDaily(daily, today),
        resumable,
        currentStreak: daily.currentStreak,
        longestStreak: daily.longestStreak,
        // Show today's score only once today's attempt is done (completed today).
        todayScore: daily.lastCompletedDate === today && daily.lastResult ? daily.lastResult.score : null,
        onPlay: () => this.enterDaily(),
      },
      onSettings: () => this.showSettings(),
      onStats: () => this.showStats(),
      onHowTo: () => this.showIntro(),
    });
    if (this.installAffordance) this.screens.home.append(this.installAffordance.el);
  }

  /** Resume a saved in-progress game, re-entering its mode/screen from the snapshot. */
  private continueGame(saved: GameState): void {
    this.state = saved;
    this.enterGame(); // renders board/tray/HUD (incl. gem HUD) from the snapshot
  }

  /**
   * Home → Endless: if a resumable Endless game exists, ask Continue or New;
   * otherwise start fresh directly.
   */
  private enterEndless(): void {
    if (!hasEndlessSave()) {
      this.playEndless();
      return;
    }
    renderConfirm(this.screens.overlay, {
      title: 'Continue your game?',
      message: 'You have an Endless game in progress.',
      // Cancel is the safe default (focused + Escape) — Continue keeps the game;
      // the destructive "New game" is the explicit confirm.
      confirmLabel: 'New game',
      cancelLabel: 'Continue',
      onConfirm: () => {
        clearEndlessSave();
        this.playEndless();
      },
      onCancel: () => {
        const saved = loadEndlessSave();
        if (saved) {
          this.isDaily = false; // a normal Endless resume, not the daily
          this.continueGame(saved);
        } else this.playEndless();
      },
    });
    this.screens.show('overlay');
  }

  /**
   * Home → Daily. If an in-progress daily run exists, resume the SAME attempt
   * (no re-seed, no second startDaily). Otherwise consume today's single attempt
   * — startDaily marks it used at START, so quitting mid-run can't dodge it —
   * then begin an Endless run seeded deterministically from today's date.
   */
  private enterDaily(): void {
    const today = this.today();
    const saved = loadDailySave();
    if (saved) {
      this.isDaily = true;
      this.continueGame(saved); // restore verbatim — same seed/state, same attempt
      return;
    }
    const daily = loadDaily();
    // Defensive: the home entry is only playable when this is true or a save exists.
    if (!canPlayDaily(daily, today)) return;
    saveDaily(startDaily(daily, today)); // quit = used: mark used BEFORE the run starts
    this.isDaily = true;
    this.state = startGame(newGame(dailySeedFor(today), loadHighScore())).state;
    this.bumpGames();
    this.enterGame();
  }

  // ---- Level Map ----
  /** Build the map's node list — the single place that uses nextLevelToPlay. */
  private levelMapNodes(): LevelMapNode[] {
    const highestReached = loadLevelProgress();
    const results = loadLevelResults();
    const current = nextLevelToPlay(results, highestReached);
    // Show reached levels plus a short horizon of locked ones ahead (capped).
    const total = Math.min(Math.max(highestReached + 3, 10), 60);
    const nodes: LevelMapNode[] = [];
    for (let level = 1; level <= total; level++) {
      const res = levelResult(results, level);
      // Unlocked iff reached; the focal node is always playable even at the frontier.
      const unlocked = level <= highestReached || level === current;
      const state = res.completed ? 'completed' : unlocked ? 'unlocked' : 'locked';
      nodes.push({ level, state, current: level === current, bestScore: res.bestScore });
    }
    return nodes;
  }

  /** Show the Level Map (Home → Levels lands here, not straight into play). */
  private showLevelMap(): void {
    renderLevelMap(this.screens.levelmap, {
      nodes: this.levelMapNodes(),
      onPlay: (level) => this.showLevelCard(level),
      onBack: () => this.goHome(),
    });
    this.screens.show('levelmap');
  }

  /** A concise spoken/visible objective for `level` (from its regenerated plan). */
  private levelObjective(level: number): string {
    const gen = generateLevel(level);
    if (gen.goalType === 'gems') {
      const parts = Object.entries(gen.quotas)
        .map(([color, n]) => ({ color: Number(color), n }))
        .sort((a, b) => a.color - b.color)
        .map(({ color, n }) => `${n} ${gemColorName(color)}`);
      return `Clear ${parts.join(', ')} gems`;
    }
    return `Reach ${gen.targetScore} points`;
  }

  /** Tapping an unlocked node opens a card to play (or replay) that level. */
  private showLevelCard(level: number): void {
    const res = levelResult(loadLevelResults(), level);
    // A resumable save exists for THIS level? Then the card offers Continue.
    const saved = loadLevelsSave();
    const resumable = saved !== null && saved.level === level;
    // Fresh start: drop any stale levels save, then start the level anew.
    const startFresh = (): void => {
      clearLevelsSave();
      this.playLevels(level);
    };
    renderLevelCard(this.screens.overlay, {
      level,
      completed: res.completed,
      bestScore: res.bestScore,
      objective: this.levelObjective(level),
      resumable,
      onPlay: () => {
        this.isDaily = false; // Levels resume, never the daily
        if (resumable && saved) this.continueGame(saved);
        else startFresh();
      },
      onStartOver: startFresh,
      onClose: () => this.showLevelMap(),
    });
    this.screens.show('overlay');
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
    this.isDaily = false;
    this.state = startGame(newGame(Date.now(), loadHighScore())).state;
    this.bumpGames();
    this.enterGame();
  }

  /** Start a Levels game at `level`. */
  private playLevels(level: number): void {
    this.isDaily = false;
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
    // This in-progress game becomes the resumable save (overwriting any stale one),
    // so starting/continuing a game is always what Continue would resume. Deferred
    // to idle; a flush on hide covers "started then immediately backgrounded".
    // Routed to the daily slot when this is the daily run (this.isDaily).
    this.scheduleSave();
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
    // Standing streak badge (both modes): multiplier for the current streak +
    // grace-shield state. Reflects the live state, so it also restores on Continue.
    this.hud.renderStreak(
      this.state.streak,
      streakMultiplier(this.state.streak),
      !this.state.streakGraceUsed,
    );
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
    // Streak state BEFORE the move, to detect the transition for the announcement.
    const prevStreak = this.state.streak;
    const prevGrace = this.state.streakGraceUsed;
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
    // One aria-live write: the move message + any streak transition, composed so
    // the streak phrase never clobbers the move announcement.
    const moveMsg = this.moveMessage(linesCleared, gemsClearedThisMove);
    const streakMsg = this.streakAnnounce(prevStreak, prevGrace);
    this.announce(streakMsg ? `${moveMsg} ${streakMsg}` : moveMsg);

    // Persist accumulated stats (best score / lines / streak updated above).
    if (this.state.score > this.stats.bestScore) {
      this.stats = { ...this.stats, bestScore: this.state.score };
    }
    saveStats(this.stats);

    switch (this.state.status) {
      case 'gameover':
        this.announce(`Game over. Final score ${this.state.score}.`);
        if (this.isDaily) this.endDaily();
        else this.endGame();
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
        // Still playing — snapshot (deferred to idle, coalesced) so a reload or
        // backgrounding resumes this move without a write inside the drop frame.
        this.scheduleSave();
        this.setInteractive(true);
    }
  }

  /**
   * Build the move-outcome aria-live message. On gem levels it composes line +
   * gem clears into one coherent write; on score/endless it reports lines +
   * score. The streak transition is appended separately by the caller (see
   * streakAnnounce) so both compose into a single write.
   */
  private moveMessage(linesCleared: number, gemsClearedThisMove: Record<number, number> | null): string {
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
    return `${lineText}. Score ${this.state.score}.`;
  }

  /**
   * A streak-transition phrase to compose into the move announcement — one write,
   * so it never clobbers. Speaks only on a real transition (built to a higher
   * multiplier, grace protected a miss, or the streak reset), which naturally
   * debounces repeats.
   */
  private streakAnnounce(prevStreak: number, prevGrace: boolean): string {
    const s = this.state.streak;
    const graceUsed = this.state.streakGraceUsed;
    if (s >= 2 && s > prevStreak) return `Streak ×${formatMultiplier(streakMultiplier(s))}.`;
    if (s >= 2 && s === prevStreak && graceUsed && !prevGrace) return 'Streak protected.';
    if (prevStreak >= 2 && s === 0) return 'Streak reset.';
    return '';
  }

  /** Format a per-color count map as "3 red, 2 blue". */
  private formatGemCounts(counts: Record<number, number>): string {
    return Object.entries(counts)
      .map(([color, n]) => `${n} ${gemColorName(Number(color))}`)
      .join(', ');
  }

  // ---- Endless game over ----
  private endGame(): void {
    clearEndlessSave(); // a finished Endless game must not be resumable
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
    this.isDaily = false;
    this.state = restart(this.state).state;
    this.bumpGames();
    this.enterGame();
  }

  // ---- Daily challenge game over ----
  /**
   * Daily run finished (game-over): clear its run save (a finished daily can't
   * resume), record the completed result — streak credit lands on completion —
   * and show the distinct daily result (no "Play again": the single attempt is
   * spent). The score still counts toward the global high score.
   */
  private endDaily(): void {
    const today = this.today();
    clearDailySave();
    const daily = recordDailyResult(loadDaily(), today, this.state.score);
    saveDaily(daily);
    const isNewHigh = this.state.score > loadHighScore();
    saveHighScore(this.state.highScore);
    this.isDaily = false;
    renderDailyOver(this.screens.gameover, {
      finalScore: this.state.score,
      currentStreak: daily.currentStreak,
      longestStreak: daily.longestStreak,
      isNewHigh,
      highScore: this.state.highScore,
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  // ---- Levels ----
  private onLevelComplete(): void {
    clearLevelsSave(); // level cleared — not resumable
    // Unlock the next level and record this level's result (for the Level Map).
    saveLevelProgress(this.state.level + 1);
    saveLevelResult(this.state.level, { score: this.state.score, completed: true });
    renderLevelComplete(this.screens.gameover, {
      level: this.state.level,
      score: this.state.score,
      onNext: () => this.goNextLevel(),
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  private goNextLevel(): void {
    this.isDaily = false;
    this.state = nextLevel(this.state).state;
    this.enterGame();
  }

  private onLevelFailed(): void {
    clearLevelsSave(); // level failed — not resumable
    renderLevelFailed(this.screens.gameover, {
      level: this.state.level,
      onRetry: () => this.retryCurrentLevel(),
      onHome: () => this.goHome(),
    });
    this.screens.show('gameover');
  }

  private retryCurrentLevel(): void {
    this.isDaily = false;
    this.state = retryLevel(this.state).state;
    this.bumpGames();
    this.enterGame();
  }

  /**
   * In-game "← Menu": leave to the menu WITHOUT ending the game. The snapshot is
   * kept (saved on every move), so the game stays resumable via Continue — this
   * is a pause, not an abandon. Only true end-states (game-over / level-complete
   * / level-failed) clear the save.
   */
  private confirmQuit(): void {
    if (this.state.status !== 'playing') return;
    this.setInteractive(false); // also stops the keyboard controller's Escape handling
    renderConfirm(this.screens.overlay, {
      title: 'Leave to menu?',
      message: 'Your game is saved — pick it back up with Continue.',
      confirmLabel: 'Leave',
      cancelLabel: 'Keep playing',
      onConfirm: () => {
        // Flush the pending deferred save so the latest state is persisted, then go
        // home (do NOT clear — the game remains resumable).
        flushSaveGame();
        this.goHome();
      },
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
    // Leaving to the menu ends the daily *context* (a paused daily stays in its
    // save slot and is resumed via the Daily entry, not this fresh home state).
    this.isDaily = false;
    this.state = newGame(Date.now(), loadHighScore());
    this.renderHomeScreen(); // refresh the resume hint + daily entry
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
