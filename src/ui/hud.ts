/**
 * Heads-up display: current score (with a count-up tween) and persisted high
 * score, plus floating "+N" pop-ups on scoring.
 */

export class HUD {
  readonly el: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly highEl: HTMLElement;
  private displayed = 0;
  private raf = 0;
  private startTs = 0;
  private startVal = 0;
  private target = 0;

  constructor(container: HTMLElement) {
    this.el = container;
    this.el.classList.add('hud');

    const scoreBox = document.createElement('div');
    scoreBox.className = 'hud-box hud-score';
    const scoreLabel = document.createElement('span');
    scoreLabel.className = 'hud-label';
    scoreLabel.textContent = 'SCORE';
    this.scoreEl = document.createElement('span');
    this.scoreEl.className = 'hud-value';
    this.scoreEl.textContent = '0';
    scoreBox.append(scoreLabel, this.scoreEl);

    const highBox = document.createElement('div');
    highBox.className = 'hud-box hud-high';
    const highLabel = document.createElement('span');
    highLabel.className = 'hud-label';
    highLabel.textContent = 'BEST';
    this.highEl = document.createElement('span');
    this.highEl.className = 'hud-value';
    this.highEl.textContent = '0';
    highBox.append(highLabel, this.highEl);

    this.el.append(scoreBox, highBox);
  }

  /** Update the display, tweening the score toward its new value. */
  render(score: number, highScore: number): void {
    this.highEl.textContent = String(highScore);
    this.tweenTo(score);
  }

  /** Snap both values to zero (used when a fresh game starts). */
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
