# Slices: line-hint hotfix + plan B overlay highlights (drag-lag escalation)

> Handoff spec for the implementing agent. Context: `plan.md` §7 (2026-08-22 rows).
> TWO slices, committed separately in this order. Do NOT mix in Tier 2 work.
>
> Measured state after Tier 3 (`15d0539`), old iPad: drag over-board 25–35 fps,
> 18 fps on fast sweeps (target ≥ 55; off-board is a solid 60). Plus an
> owner-reported visual regression (slice A). Tier 3 made each repainted cell
> cheaper; what remains is that the **board layer repaints at all**: line-hint
> toggles touch cells at opposite board edges, so the damage region unions to
> nearly the whole board texture on every cell crossing. Fix = stop invalidating
> the board layer during drags (slice B).

---

## Slice A — HOTFIX: restore line-hint + invalid-preview on touch (CSS-only, tiny)

**Bug (regression from `15d0539`):** the `@media (pointer: coarse)` block at
`game.css:305` declares `.cell.filled` overrides (background + box-shadow) **later in
the file** than `.cell.line-hint` (261) and `.cell.preview--valid/--invalid`
(212/216), at equal specificity (0,2,0). Later-equal wins, so on touch devices a
**filled** cell in a hinted line shows no ring (a full line is mostly filled cells →
"full-line highlight broke"), and an invalid preview over filled cells loses its red
tint.

**Fix:** split the media block in two, each placed **immediately after its base rule**
so the pre-existing cascade order (hint/preview declared later than fills) is
restored:

- `@media (pointer: coarse) { .cell.filled { …flat override… } }` directly after the
  base `.cell.filled` rule (before the preview rules).
- `@media (pointer: coarse) { .block { …flat override… } }` directly after the base
  `.block` rule.

Declarations themselves are unchanged — this is a pure reordering. Add a short
comment on each: "must precede the preview/line-hint rules — equal specificity,
order-dependent".

**Verify:** on a touch device (or DevTools device emulation with touch), drag a piece
to a spot that completes a line through filled cells → the full row/col glows; hover
an invalid spot over filled cells → red tint + hatch visible. Tests/typecheck/build
green (CSS-only).

Suggested commit: `fix(css): restore line-hint + invalid preview on filled cells (coarse-pointer cascade order)`

---

## Slice B — Plan B: highlights on a dedicated overlay layer

**Goal:** during a drag, **zero paint invalidation of the board layer**. Preview and
line-hint highlights move to a separate composited overlay that mirrors the grid.
This is also the permanent fix for slice A's bug class — highlight rules stop sharing
elements with fill rules entirely.

### Implementation

**`src/ui/board-view.ts`:**
1. In the constructor, after the 64 cells, build and append an overlay:
   `<div class="board-hl" aria-hidden="true">` containing 64 `<div class="hcell">`
   children, kept in an `hcells: HTMLElement[]` array indexed like `cells`.
2. Retarget `showPreview` / `clearPreview` / `showLineHint` / `clearLineHint` to
   operate on `hcells` instead of `cells` (class names unchanged: `preview`,
   `preview--valid`, `preview--invalid`, `line-hint`). No API change — the drag and
   keyboard controllers and `app.ts` `showHint()` keep working untouched.
3. Everything else (fills, gems, aria-labels, metrics, pulse animations) stays on the
   board cells — those don't change during a drag.

**`src/styles/game.css`:**
1. On `.board`: add `position: relative;` and factor the two geometry values into
   variables used by both grids: `--board-pad: 8px; --board-gap: 5px;` (replace the
   literal `padding: 8px` and `gap: 5px`).
2. New rules:
   ```css
   /* Highlight overlay: its OWN composited layer, so preview/line-hint churn during
      a drag repaints this cheap, mostly-transparent layer — never the board texture
      (measured: whole-board damage unions were the drag-lag remainder). */
   .board-hl {
     position: absolute;
     inset: 0;
     padding: var(--board-pad);
     display: grid;
     grid-template-columns: repeat(var(--board-size, 8), 1fr);
     grid-template-rows: repeat(var(--board-size, 8), 1fr);
     gap: var(--board-gap);
     pointer-events: none;
     will-change: transform; /* forces the layer */
     contain: strict;
   }
   .hcell {
     position: relative;
     border-radius: var(--radius-block);
   }
   ```
3. Move the highlight visuals from `.cell.*` to `.hcell.*`. They now paint OVER cell
   content, so fills become translucent (cell's wood/gem shows through):
   - `.hcell.preview--valid`: `background: color-mix(in srgb, var(--preview-valid) 40%, transparent);`
     plus the existing inset ring.
   - `.hcell.preview--invalid`: `background: color-mix(in srgb, var(--preview-invalid) 35%, transparent);`
     plus the existing inset ring.
   - Move the `::before` checkmark / hatch rules verbatim to `.hcell.preview--*::before`.
   - Move `.cell.line-hint` → `.hcell.line-hint` verbatim (inset-only ring from Tier 3).
   - Delete the old `.cell.preview*` / `.cell.line-hint` rules (deletion, not
     branch-around). This also deletes slice A's ordering hazard — keep slice A as its
     own commit anyway (it ships first and documents the regression fix).
4. No `filter` / `backdrop-filter` anywhere. Nothing may animate or resize `.board-hl`.

**Tests (`src/ui/board-view.dom.test.ts`):**
- Retarget the existing preview/line-hint assertions from `.cell` to `.hcell`.
- Add the invariant this slice exists for: `showPreview` + `showLineHint` then
  `clearPreview` + `clearLineHint` never mutate any `.cell`'s `classList`
  (snapshot cell class strings before/after and assert equal).
- Keep the metrics-caching test green (geometry still reads `cells[0..1]`).

### Constraints

- Board `aria` semantics unchanged (overlay is `aria-hidden`; SR users already get
  placement info via announcements).
- Don't touch `drag-controller.ts`, `keyboard-controller.ts` logic, or anything in
  Tier 2's scope (renderBoard diffing, saveGame deferral).
- Colorblind cues (checkmark shape, hatch pattern) must survive verbatim.

### Verify

1. `npm run typecheck` && `npm test` && `npm run build`.
2. Owner iPad probe re-test (accept the SW refresh toast first): full-board sweep,
   both modes, including a deliberately fast sweep. **Target: ≥ 55 fps sustained;
   fast sweeps ≥ 50.** Record in `plan.md` §7.
3. Visual: line-hint glows across filled cells (slice A's case), valid/invalid
   distinguishable over both empty and filled cells, gems readable under a
   translucent highlight, highlights align pixel-perfect with cells at all board
   sizes (resize the window / rotate).
4. If STILL < 40 fps: stop and report back — next escalation is measuring whether the
   overlay layer itself is the cost (then: canvas-based overlay), but that is not
   expected given off-board drags hold 60.

Suggested commit: `perf(ui): draw preview/line-hint on a composited overlay — board layer never repaints during drag`
