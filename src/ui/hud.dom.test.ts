// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { HUD } from './hud';

describe('HUD (DOM)', () => {
  let container: HTMLElement;
  let hud: HUD;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    hud = new HUD(container);
  });

  const rows = (): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>('.hud-row'));

  it('renderGems shows one remaining chip per color with a diamond + count', () => {
    hud.renderGems(3, [
      { color: 1, remaining: 14 },
      { color: 2, remaining: 6 },
    ]);

    const gemsRow = container.querySelector<HTMLElement>('.hud--gems')!;
    expect(gemsRow.hidden).toBe(false);
    // The other rows are hidden — one HUD variant at a time.
    expect(rows().filter((r) => !r.hidden)).toEqual([gemsRow]);

    const chips = gemsRow.querySelectorAll('.gem-chip');
    expect(chips.length).toBe(2);
    expect(chips[0]!.querySelector('.gem--1')).not.toBeNull();
    expect(chips[0]!.querySelector('.gem-chip-count')?.textContent).toBe('14');
    expect(chips[0]!.getAttribute('aria-label')).toBe('14 red left');
    expect(chips[1]!.querySelector('.gem--2')).not.toBeNull();
    expect(chips[1]!.querySelector('.gem-chip-count')?.textContent).toBe('6');
  });

  it('re-rendering gem chips replaces the previous set (no stale chips)', () => {
    hud.renderGems(3, [{ color: 1, remaining: 5 }, { color: 2, remaining: 5 }]);
    hud.renderGems(3, [{ color: 1, remaining: 2 }]);
    const chips = container.querySelectorAll('.hud--gems .gem-chip');
    expect(chips.length).toBe(1);
    expect(chips[0]!.querySelector('.gem-chip-count')?.textContent).toBe('2');
  });

  it('renderLevels hides the blocks box on a pure score level (no blocks)', () => {
    hud.renderLevels(1, 40, 100, 0, 0);
    const blocksBox = container.querySelector<HTMLElement>('.hud-blocks')!; // the .hud-box wrapper
    expect(blocksBox.hidden).toBe(true);

    // A level with blocks shows the box again.
    hud.renderLevels(1, 40, 100, 3, 8);
    expect(blocksBox.hidden).toBe(false);
    expect(blocksBox.querySelector('.hud-value')?.textContent).toBe('3/8');
  });

  it('renderStreak shows the multiplier badge only at streak >= 2, with a numeric ×N', () => {
    const badge = (): HTMLElement => container.querySelector<HTMLElement>('.streak-badge')!;
    hud.renderStreak(1, 1, true); // below 2 — not shown
    expect(badge().hidden).toBe(true);

    hud.renderStreak(3, 2, true);
    expect(badge().hidden).toBe(false);
    expect(badge().querySelector('.streak-badge__mult')?.textContent).toBe('×2'); // numeric, not color-only

    hud.renderStreak(0, 1, false); // streak broke — badge gone
    expect(badge().hidden).toBe(true);
  });

  it('renderStreak reflects the grace shield state (spent marked by shape, not hue alone)', () => {
    const shield = (): HTMLElement => container.querySelector<HTMLElement>('.streak-badge__shield')!;
    hud.renderStreak(4, 2.5, true); // grace ready
    expect(shield().classList.contains('streak-badge__shield--spent')).toBe(false);

    hud.renderStreak(4, 2.5, false); // grace spent
    expect(shield().classList.contains('streak-badge__shield--spent')).toBe(true);
  });

  // ---- D2: status strip + score hero ----
  const modeTag = (): HTMLElement => container.querySelector<HTMLElement>('.hud-mode-tag')!;

  it('status strip mode tag: ENDLESS by default, DAILY for the daily context', () => {
    hud.render(0, 0);
    expect(modeTag().textContent).toBe('ENDLESS');
    hud.render(0, 0, 'daily');
    expect(modeTag().textContent).toBe('DAILY');
  });

  it('LEVEL is relocated to the strip — no LEVEL box remains in either row', () => {
    hud.renderLevels(7, 40, 100, 3, 8);
    expect(modeTag().textContent).toBe('LEVEL 7');
    expect(container.querySelector('.hud-level')).toBeNull(); // no LEVEL hud-box

    hud.renderGems(12, [{ color: 1, remaining: 5 }]);
    expect(modeTag().textContent).toBe('LEVEL 12');
    expect(container.querySelector('.hud-level')).toBeNull();
  });

  it('streak badge is preserved in the strip (P7 markup + slot intact)', () => {
    const strip = container.querySelector<HTMLElement>('.hud-streak-line')!;
    const badge = strip.querySelector<HTMLElement>('.streak-badge');
    expect(badge).not.toBeNull();
    expect(badge!.querySelector('.streak-badge__mult')).not.toBeNull();
    expect(badge!.querySelector('.streak-badge__shield')).not.toBeNull();
    // The mode tag (left) and the badge (right) share the same reserved line.
    expect(strip.querySelector('.hud-mode-tag')).not.toBeNull();
    // The badge still behaves exactly as P7 defined it.
    hud.renderStreak(3, 2, true);
    expect(badge!.hidden).toBe(false);
  });

  it('score hero: endless row keeps distinct SCORE (.hud-score) + BEST (.hud-high) boxes', () => {
    hud.render(120, 900);
    expect(container.querySelector('.hud-score')).not.toBeNull(); // hero box (flex 1.4 in CSS)
    const bestBox = container.querySelector('.hud-high');
    expect(bestBox).not.toBeNull(); // secondary box (--fs-chip value + dim label in CSS)
    expect(bestBox!.querySelector('.hud-value')?.textContent).toBe('900');
  });
});
