# Slice: Tier 3 paint diet (drag-lag fix, device-confirmed diagnosis)

> Handoff spec for the implementing agent. Context: `plan.md` §3.2, §4 Tier 3, and the
> §7 results log (2026-08-22). One slice, CSS-focused, tests green, stop-and-ask
> before commit. Do NOT mix in Tier 2 work (renderBoard diffing / saveGame deferral)
> — that is the next slice.

## Why (measured, old iPad, probe `?perf=1`)

- Idle 60 fps; drag **off-board** 60 fps; drag **over the board** < 20 fps — identical
  in Endless and Levels. The ghost and input pipeline are already clean (Tier 1,
  `578bc58`); the entire remaining drag lag is **board-cell repaint churn**: each cell
  boundary crossed toggles ≤ 10 preview cells + up to 24 line-hint cells, and each
  repaints at gradient + 2×`color-mix` + triple-shadow cost; the line-hint outer glow
  bleeds 9 px past cell bounds, inflating the damage region.
- Gems are NOT the dominant cost (Endless has none) but carry the same bug class
  (`filter` on `.gem`) — fix while here.

## Changes (all in `src/styles/game.css` unless noted)

### 1. Flat block styling on coarse pointers — the main event

Add AFTER the base `.block` rule (must come later in the file than both `.cell.filled`
and `.block` so the equal-specificity override wins):

```css
/* Coarse pointers = mobile GPUs. The gradient + 2×color-mix + triple-shadow block
   look is what every preview/line-hint-churned cell repaints with during a drag —
   measured < 20 fps on an older iPad. Serve a flat fill + un-blurred insets there;
   fine pointers (desktop) keep the rich look. */
@media (pointer: coarse) {
  .cell.filled,
  .block {
    background: var(--block);
    box-shadow:
      inset 0 2px 0 rgba(255, 255, 255, 0.28),
      inset 0 -2px 0 rgba(0, 0, 0, 0.28);
  }
}
```

Notes:
- Un-blurred (0-radius) insets only — blur radius is the expensive part.
- `.drag-ghost .block` (higher specificity, later in file) intentionally keeps its
  blurred lift shadow: it is painted once at pickup, never during motion. Leave it.

### 2. Line-hint: inset-only (all pointer types)

Replace the `.cell.line-hint` box-shadow so nothing paints outside the cell:

```css
.cell.line-hint {
  box-shadow:
    inset 0 0 0 2px rgba(255, 216, 148, 0.95),
    inset 0 0 6px 1px rgba(255, 190, 110, 0.6);
}
```

The warm glow now lives fully inside the cell → repaint damage shrinks to exactly the
touched cells. Applies everywhere (not media-gated): visually near-identical, and
smaller damage rects help desktops too.

### 3. Gem marker: remove the CSS filter

In `.gem`, delete the `filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));` line.
Contrast is already carried by the SVG's dark stroke (`.gem__stone`,
`stroke: rgba(0,0,0,0.45)`, width 3). If the gem loses legibility on pale wood cells
(owner eyeballs it), bake a shadow INTO the SVG instead (in `src/ui/gems.ts`
`buildGemMarker`): one extra `polygon` with the stone's points offset +2/+3 units,
dark translucent fill, appended BEFORE `.gem__stone`. Never re-add a CSS `filter`.

## Hard constraints

- CSS-only (plus the optional `gems.ts` SVG shadow polygon). No changes to
  `drag-controller.ts`, `board-view.ts`, `app.ts`, or any behavior.
- Do not add `filter` / `backdrop-filter` anywhere.
- Colorblind cues must survive untouched: valid checkmark / invalid hatch shapes,
  gem letter cue, target ring.
- `prefers-reduced-motion` behavior unchanged.
- Desktop (`pointer: fine`) keeps the rich block look; only line-hint and gem shadow
  change globally.

## Verification

1. `npm run typecheck` && `npm test` (suite must stay green — no test touches these
   styles) && `npm run build`.
2. Owner re-runs the iPad probe after deploy (accept the SW refresh toast first!):
   full-board sweep with the biggest piece, both modes. **Target: ≥ 55 fps sustained
   over-board.** Record in `plan.md` §7.
3. Owner look-check: blocks still read as wood on the iPad; valid/invalid preview
   distinguishable; gems legible.
4. If the re-test lands < 40 fps: STOP adding style tweaks — escalate to plan B
   (dedicated overlay layer for preview/line-hint highlights so board cells never
   repaint during a drag; see plan.md §7 note).

Suggested commit message:
`perf(css): mobile paint diet — flat blocks (coarse pointer), inset-only line-hint, de-filtered gems`
