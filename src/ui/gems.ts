/**
 * Gem vocabulary + marker rendering, shared by the board, tray/ghost pieces, and
 * the HUD so a gem looks and reads the same everywhere.
 *
 * A gem's color is an index 1..MATERIAL_COUNT. The color name is carried in the
 * host cell's aria-label for screen readers.
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

/**
 * Single-letter cue per gem color, shown only when the colorblind-markers
 * setting is on — a hue-independent distinguisher (R/B/G/A/P/C).
 */
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
 * A colored cut-gem marker for `color`: an inline SVG (scales to any cell size).
 *
 * A gemstone silhouette — NOT a rotated square. It has a FLAT TOP (the table),
 * angled shoulders widening to the girdle (its widest point), and a pointed
 * bottom (the pavilion). Facet polygons split the crown so it reads as a cut
 * stone. Purely decorative — `aria-hidden`; the semantic color lives in the host
 * cell's label.
 *
 *      table
 *    ┌───────┐        26,18 ── 74,18
 *   ╱  crown  ╲      ╱            ╲
 *  ├───girdle──┤    2,44          98,44
 *   ╲ pavilion╱          ╲      ╱
 *      ▼                    50,98
 *
 * When `colorblind` is true, a legible letter cue (R/B/G/A/P/C) is overlaid so
 * colors are distinguishable without relying on hue.
 */
export function buildGemMarker(color: number, colorblind = false): SVGElement {
  const svg = svgEl('svg', {
    class: `gem gem--${color}`,
    viewBox: '0 0 100 100',
    'aria-hidden': 'true',
  });
  (svg as SVGElement & { style: CSSStyleDeclaration }).style.setProperty('--gem', `var(--gem-${color})`);

  svg.append(
    // Outline: flat-top gemstone (table → girdle → pavilion point).
    svgEl('polygon', { class: 'gem__stone', points: '26,18 74,18 98,44 50,98 2,44' }),
    // Crown band (above the girdle) catches light — a subtle lighter facet.
    svgEl('polygon', { class: 'gem__facet', points: '26,18 74,18 98,44 2,44' }),
    // Facet lines of a brilliant cut: girdle (horizontal), the table's side
    // edges down to the girdle, and the pavilion facets converging to the point.
    svgEl('path', {
      class: 'gem__lines',
      d: 'M2,44 H98 M26,18 L36,44 M74,18 L64,44 M36,44 L50,98 M64,44 L50,98',
    }),
  );

  if (colorblind) {
    const letter = svgEl('text', {
      class: 'gem__cb',
      x: '50',
      y: '50',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    letter.textContent = GEM_COLOR_LETTERS[color] ?? String(color);
    svg.append(letter);
  }

  return svg;
}
