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
});
