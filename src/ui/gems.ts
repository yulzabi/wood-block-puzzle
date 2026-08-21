/**
 * Gem vocabulary + marker rendering, shared by the board, tray/ghost pieces, and
 * the HUD so a gem looks and reads the same everywhere.
 *
 * A gem's color is an index 1..MATERIAL_COUNT. Each color pairs a hue with a
 * distinct letter cue (R/B/G/A/P/C) so colors are distinguishable WITHOUT hue —
 * color-blind-safe, matching the placement-preview precedent.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Human color name per gem color index (for aria-labels). Index 0 unused. */
export const GEM_COLOR_NAMES: readonly string[] = [
  '',
  'red',
  'blue',
  'green',
  'amber',
  'purple',
  'cyan',
];

/** Single-letter cue per gem color — the color-blind-safe, hue-independent marker. */
export const GEM_COLOR_LETTERS: readonly string[] = ['', 'R', 'B', 'G', 'A', 'P', 'C'];

/** Human name for a gem color (falls back gracefully for out-of-range indices). */
export function gemColorName(color: number): string {
  return GEM_COLOR_NAMES[color] ?? `color ${color}`;
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * A colored diamond marker for gem `color`: an inline SVG (scales to any cell
 * size) of a rotated, rounded, faceted stone with an upright letter cue. Purely
 * decorative — `aria-hidden`; the semantic color lives in the host cell's label.
 */
export function buildGemMarker(color: number): SVGElement {
  const svg = svgEl('svg', {
    class: `gem gem--${color}`,
    viewBox: '0 0 100 100',
    'aria-hidden': 'true',
  });
  (svg as SVGElement & { style: CSSStyleDeclaration }).style.setProperty('--gem', `var(--gem-${color})`);

  const g = svgEl('g', { transform: 'rotate(45 50 50)' });
  g.append(
    svgEl('rect', { class: 'gem__stone', x: '24', y: '24', width: '52', height: '52', rx: '12' }),
    svgEl('rect', { class: 'gem__facet', x: '24', y: '24', width: '52', height: '24', rx: '12' }),
  );

  const text = svgEl('text', {
    class: 'gem__letter',
    x: '50',
    y: '50',
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
  });
  text.textContent = GEM_COLOR_LETTERS[color] ?? String(color);

  svg.append(g, text);
  return svg;
}
