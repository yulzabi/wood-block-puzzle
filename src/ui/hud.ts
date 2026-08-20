/**
 * Heads-up display: current score (with a count-up tween) and persisted high
 * score, plus floating "+N" pop-ups on scoring.
 */

export class HUD {
  readonly el: HTMLElement;
  // Endless row (SCORE / BEST).
  private readonly endlessRow: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly highEl: HTMLElement;
  // Levels row (LEVEL / BLOCKS / SCORE toward target).
  private readonly levelsRow: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly blocksEl: HTMLElement;
  private readonly lvlScoreEl: HTMLElement;
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

    // --- Levels row ---
    this.levelsRow = row('hud--levels');
    this.levelsRow.hidden = true;
    this.levelEl = box(this.levelsRow, 'LEVEL', 'hud-level');
    this.blocksEl = box(this.levelsRow, 'BLOCKS', 'hud-blocks');
    this.lvlScoreEl = box(this.levelsRow, 'SCORE', 'hud-lvlscore');

    this.el.append(this.endlessRow, this.levelsRow);
  }

  /** Endless HUD: score (tweened) + persisted best. */
  render(score: number, highScore: number): void {
    this.endlessRow.hidden = false;
    this.levelsRow.hidden = true;
    this.highEl.textContent = String(highScore);
    this.tweenTo(score);
  }

  /** Levels HUD: current level, blocks left (remaining/total), score toward target. */
  renderLevels(
    level: number,
    score: number,
    targetScore: number,
    remaining: number,
    total: number,
  ): void {
    this.endlessRow.hidden = true;
    this.levelsRow.hidden = false;
    this.levelEl.textContent = String(level);
    this.blocksEl.textContent = `${remaining}/${total}`;
    this.lvlScoreEl.textContent = `${score}/${targetScore}`;
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
