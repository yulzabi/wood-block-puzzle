/**
 * Heads-up display: current score (with a count-up tween) and persisted high
 * score, plus floating "+N" pop-ups on scoring.
 */

import { buildGemMarker, gemColorName } from './gems';

/** A gem-goal HUD entry: how many of a color remain to clear. */
export interface GemChip {
  readonly color: number;
  readonly remaining: number;
}

export class HUD {
  readonly el: HTMLElement;
  // Endless row (SCORE / BEST).
  private readonly endlessRow: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly highEl: HTMLElement;
  // Levels row (LEVEL / BLOCKS / SCORE toward target) — score-goal levels.
  private readonly levelsRow: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly blocksEl: HTMLElement;
  private readonly blocksBox: HTMLElement;
  private readonly lvlScoreEl: HTMLElement;
  // Gems row (LEVEL + per-color remaining chips) — gem-goal levels.
  private readonly gemsRow: HTMLElement;
  private readonly gemLevelEl: HTMLElement;
  private readonly gemChipsEl: HTMLElement;
  private displayed = 0;
  private raf = 0;
  private startTs = 0;
  private startVal = 0;
  private target = 0;

  constructor(container: HTMLElement) {
    this.el = container;
    this.el.classList.add('hud');

    // --- Endless row ---
    this.endlessRow = row();
    this.scoreEl = box(this.endlessRow, 'SCORE', 'hud-score');
    this.highEl = box(this.endlessRow, 'BEST', 'hud-high');

    // --- Levels row (score goal) ---
    this.levelsRow = row('hud--levels');
    this.levelsRow.hidden = true;
    this.levelEl = box(this.levelsRow, 'LEVEL', 'hud-level');
    this.blocksEl = box(this.levelsRow, 'BLOCKS', 'hud-blocks');
    this.blocksBox = this.blocksEl.parentElement as HTMLElement;
    this.lvlScoreEl = box(this.levelsRow, 'SCORE', 'hud-lvlscore');

    // --- Gems row (gem goal) ---
    this.gemsRow = row('hud--gems');
    this.gemsRow.hidden = true;
    this.gemLevelEl = box(this.gemsRow, 'LEVEL', 'hud-level');
    this.gemChipsEl = document.createElement('div');
    this.gemChipsEl.className = 'gem-chips';
    this.gemsRow.append(this.gemChipsEl);

    this.el.append(this.endlessRow, this.levelsRow, this.gemsRow);
  }

  /** Endless HUD: score (tweened) + persisted best. */
  render(score: number, highScore: number): void {
    this.endlessRow.hidden = false;
    this.levelsRow.hidden = true;
    this.gemsRow.hidden = true;
    this.highEl.textContent = String(highScore);
    this.tweenTo(score);
  }

  /**
   * Score-goal Levels HUD: current level + score toward target. Shows a blocks
   * box only when the level has blocks to clear (hidden on pure score levels).
   */
  renderLevels(
    level: number,
    score: number,
    targetScore: number,
    remaining: number,
    total: number,
  ): void {
    this.endlessRow.hidden = true;
    this.gemsRow.hidden = true;
    this.levelsRow.hidden = false;
    this.levelEl.textContent = String(level);
    this.blocksBox.hidden = total <= 0;
    this.blocksEl.textContent = `${remaining}/${total}`;
    this.lvlScoreEl.textContent = `${score}/${targetScore}`;
  }

  /** Gem-goal Levels HUD: current level + a per-color "remaining" chip each. */
  renderGems(level: number, chips: readonly GemChip[], colorblind = false): void {
    this.endlessRow.hidden = true;
    this.levelsRow.hidden = true;
    this.gemsRow.hidden = false;
    this.gemLevelEl.textContent = String(level);
    this.gemChipsEl.textContent = '';
    for (const { color, remaining } of chips) {
      const chip = document.createElement('div');
      chip.className = 'gem-chip';
      chip.setAttribute('aria-label', `${remaining} ${gemColorName(color)} left`);
      chip.append(buildGemMarker(color, colorblind));
      const count = document.createElement('span');
      count.className = 'gem-chip-count';
      count.textContent = String(remaining);
      chip.append(count);
      this.gemChipsEl.append(chip);
    }
  }

  /** Snap the tweened endless score to zero (used when a fresh game starts). */
  reset(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.displayed = 0;
    this.scoreEl.textContent = '0';
  }

  private tweenTo(target: number): void {
    if (target === this.displayed) {
      this.scoreEl.textContent = String(target);
      return;
    }
    this.startVal = this.displayed;
    this.target = target;
    this.startTs = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.step);
  }

  private readonly step = (ts: number): void => {
    if (this.startTs === 0) this.startTs = ts;
    const dur = 320;
    const p = Math.min(1, (ts - this.startTs) / dur);
    this.displayed = Math.round(this.startVal + (this.target - this.startVal) * p);
    this.scoreEl.textContent = String(this.displayed);
    if (p < 1) {
      this.raf = requestAnimationFrame(this.step);
    } else {
      this.displayed = this.target;
      this.scoreEl.textContent = String(this.target);
      this.raf = 0;
    }
  };

  /** Float a "+delta" from a client-space point. No-op for non-positive deltas. */
  popScore(delta: number, at: { x: number; y: number }): void {
    if (delta <= 0) return;
    const pop = document.createElement('div');
    pop.className = 'score-pop';
    pop.textContent = `+${delta}`;
    pop.style.left = `${at.x}px`;
    pop.style.top = `${at.y}px`;
    document.body.append(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
    // Safety net in case animationend never fires.
    window.setTimeout(() => pop.remove(), 1200);
  }

  /**
   * Float a "STREAK ×N" combo indicator from a client-space point. Distinct from
   * the "+N" score pop; only meaningful for streak >= 2.
   */
  popCombo(streak: number, multiplier: number, at: { x: number; y: number }): void {
    if (streak < 2) return;
    const pop = document.createElement('div');
    pop.className = 'combo-pop';
    const mult = document.createElement('span');
    mult.className = 'combo-pop-mult';
    mult.textContent = `×${formatMultiplier(multiplier)}`;
    const label = document.createElement('span');
    label.className = 'combo-pop-label';
    label.textContent = `STREAK ${streak}`;
    pop.append(mult, label);
    pop.style.left = `${at.x}px`;
    pop.style.top = `${at.y}px`;
    document.body.append(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
    window.setTimeout(() => pop.remove(), 1400);
  }
}

/** Format a score multiplier: 2 -> "2", 1.5 -> "1.5". */
export function formatMultiplier(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}

/** Build a HUD row (a flex line of boxes). */
function row(extra = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = extra ? `hud-row ${extra}` : 'hud-row';
  return el;
}

/** Append a labeled value box to `parent`; return the value element. */
function box(parent: HTMLElement, label: string, cls: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `hud-box ${cls}`;
  const lbl = document.createElement('span');
  lbl.className = 'hud-label';
  lbl.textContent = label;
  const val = document.createElement('span');
  val.className = 'hud-value';
  val.textContent = '0';
  wrap.append(lbl, val);
  parent.append(wrap);
  return val;
}
