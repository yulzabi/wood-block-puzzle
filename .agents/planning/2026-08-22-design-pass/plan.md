# Wood Block Puzzle — UX/UI Design Pass Plan

> **Status: APPROVED (owner + TPM, 2026-08-22) — implementing slice-by-slice per §10.**
> Decisions: app.ts spine wiring APPROVED (flag 1); core/daily.ts history field APPROVED
> (flag 2); FTUE generation tuning DEFERRED to a separate, later, owner-approved core slice
> (flag 3). Hard gates added: Clean-Sweep flash is CUT on *any* `?perf=1` clear-frame
> regression (no debate — the gold burst carries the tier); D5 acceptance requires a
> *measured* gem-letter/preview-cue contrast check per board theme; the D1 iPad gate must
> actually run (never skipped as "should be free"). Awards merge into a tabbed Stats panel
> and Style lives in Settings (home action row stays at 3). D4+D5 are the retention heart;
> D6–D8 are optional polish — a shipping boundary may be drawn before them.
> Designer plan for the visual/UX polish pass (P10 cosmetics/achievements, P11 juice/FTUE,
> HUD hierarchy, map + streak calendar). Inputs: `2026-08-20-wood-block-puzzle/review-notes.md`,
> `2026-08-22-engagement/plan.md`, current `src/styles/` + `src/ui/`.
>
> **Constraints honored throughout (load-bearing, not preferences):**
> - A11y preserved: shape-cued placement preview (check/hatch), gem colorblind letter toggle,
>   full keyboard play, aria-live announcements, `prefers-reduced-motion` everywhere.
>   No state ever becomes color-only.
> - Perf preserved: the `@media (pointer: coarse)` flat-block split and the `.board-hl`
>   compositor overlay stay. **No `filter`/`drop-shadow`/`backdrop-filter`/gradients on
>   board cells or blocks on touch.** Every visual slice gets a `?perf=1` old-iPad gate.
> - Ethics: skill-gated cosmetics only (no RNG/currency/grind), invitational streaks,
>   honest unlock conditions, no manufactured anxiety.
> - No new gameplay systems, no backend. Core stays DOM-free. Changes in `src/ui/`,
>   `src/styles/`, `src/platform/` (+ the established `app.ts` spine wiring pattern —
>   see §9 flags). Tests + typecheck green; one commit per slice.

---

## 1. Visual system — tighten the wood language into tokens

The game already has a coherent voice: warm dark backdrop, six wood tones, carved-recess
panels, pill buttons with a press-down, gold as the "reward" color. The problem is that the
voice is **implicit** — sizes, golds, and elevations are hard-coded per component. The fix is
consolidation, not reinvention.

### Keep (works, don't touch)
- The 6-tone wood palette `--wood-1..6` and structural colors (`--board-bg/inset`,
  `--cell-empty/-hi`) — legible, warm, already tuned for contrast.
- Gem palette `--gem-1..6` + letter cues — colorblind-safe pairing is settled (device-verified).
- Pill buttons with the 2px press-down; the carved-inset panel look (`inset` shadow language).
- `--radius-block: 22%` blocks; dark radial backdrop; system font stack (fast, native-feel).
- The flat mobile block style *as a mechanism* (perf split stays; we only tune its values).

### Refine (the token work)
Formalize in `theme.css` — pure consolidation, near-zero visual diff, so later slices edit
one place:

- **Gold ramp.** Gold is the reward color but appears as four ad-hoc values today
  (`#ffd479` combo/new-best, `#ffe08a` node score, `rgba(255,216,148)` line-hint,
  `rgba(255,208,120)` completed ring). Collapse to `--gold` (#ffd479) and `--gold-soft`
  (rgba form for rings/hints). Everything celebratory draws from this ramp — it's also the
  achievement/cosmetic identity color (§2–3).
- **Type scale.** `--fs-label: 11px` (letterspaced labels), `--fs-meta: 13px`,
  `--fs-body: 15px`, `--fs-chip: 18px`, `--fs-value: 26px`, `--fs-hero: 56px`. Current
  sizes already cluster on these; tokenizing stops drift.
- **Spacing scale.** 4 / 8 / 12 / 16 / 24 as `--sp-1..5`. HUD gaps, panel padding, menu gaps
  all snap to it (they're within 2px already).
- **Elevation vocabulary** (named shadow tokens, all values already in use):
  `--elev-carve` (inset recess: hud-box/tray/stat-box), `--elev-raise` (button/block),
  `--elev-float` (overlay panel/toast). One definition each; components reference tokens.
- **Radius:** keep `--radius-block`/`--radius-panel`, add `--radius-card: 24px` (gameover
  panel) and use `999px` pills via `--radius-pill`.
- **Flat mobile block tune** (the "make flat look good" ask): keep single flat fill + the one
  un-blurred inset top highlight, and add a second **un-blurred** dark bottom inset edge
  (`inset 0 -2px 0 rgba(0,0,0,.25)`) so mobile blocks read bevelled, not sticker-flat.
  Un-blurred insets are near-free to paint (no blur kernel). **Gate: `?perf=1` iPad drag
  re-check must hold ~60fps, else revert to single-shadow.**
- **Panel grain (desktop-first, optional):** a subtle tiling wood-grain SVG
  `background-image` on *static panels only* (home/gameover panels — painted once, never
  churned). Explicitly **not** on cells, blocks, or anything the drag path touches, and
  skipped under `(pointer: coarse)` until the iPad gate proves it free.

## 2. Cosmetic unlock system (P10) — skill-gated, CSS-variable-powered

**Mechanism (the key design decision):** every cosmetic is a **named set of CSS custom
properties** applied as `data-theme-board` / `data-palette-blocks` / `data-palette-particles`
attributes on the app frame, plus a palette array swap for particles. Zero new paint cost —
the same rules render, only variable values change — so cosmetics are perf-safe by
construction on both device classes.

Three cosmetic tracks (deliberately *not* "piece skins" as separate geometry — shape/radius
variants risk the paint budget and dilute the wood identity; skins here = material palettes):

| Track | What changes | Sets |
| --- | --- | --- |
| **Board themes** | `--board-bg/-inset`, `--cell-empty/-hi`, backdrop tint | Classic Oak (default) · Birch Light · Walnut Dark · Ebony Night |
| **Block palettes** | the `--wood-1..6` set | Classic (default) · Autumn (russet/amber) · Driftwood (grey-washed) · Cherry (deep reds) |
| **Particle palettes** | the particle `WOOD_TONES` array | Wood Chips (default) · Gold Sparks · Ember · Leaf |

Palette rules: every block palette keeps 6 mutually-distinguishable tones that stay distinct
from the gem hues and the preview green/red (blocks are decorative material indices — no
gameplay semantics ride on their hue, and the preview/line-hint cues are shape+overlay based,
so palettes can't break a11y; still re-verify the letter-cue contrast per board theme).

**Unlock mapping (fixed, honest, no RNG — each names its condition when locked):**

| Cosmetic | Unlocked by |
| --- | --- |
| Birch Light board | Beat level 10 |
| Walnut Dark board | Beat level 25 |
| Ebony Night board | Beat level 50 |
| Autumn blocks | Endless 1,000 points |
| Driftwood blocks | 100 total lines cleared |
| Cherry blocks | ×5 streak reached |
| Gold Sparks particles | 7-day daily streak |
| Ember particles | First 4-line clear ("Clean Sweep") |
| Leaf particles | Beat level 5 |

**Selection UI:** a "Style" panel (from Settings or a home ghost button) — three labeled rows
of swatch buttons. Locked swatches render dimmed **with a padlock glyph + their unlock text**
(shape cue, not color-only; real `<button disabled>` with full aria-label). Selection persists
instantly.

**Storage:** `wbp.v1.cosmetics` → `{ selected: { board, blocks, particles } }`. Unlocks are
*derived from achievements* (§3) rather than stored twice — one source of truth, no
double-bookkeeping. Never-throw load with defaults, per the storage house style.

## 3. Achievements / milestones (P10)

**Visual identity: the carved medallion.** The level map already established the game's
emblem language — a circular carved wood medallion with a gold ring when completed. Awards
reuse it exactly: earned = wood medallion + `--gold` ring + glyph; locked = recessed,
desaturated medallion with the padlock and the condition text. This makes map, awards, and
cosmetics one visual family for free.

**Surface:** an "Awards" grid panel (home ghost button, alongside Stats — or merged into a
tabbed Stats/Awards panel to avoid home-row crowding; recommend merging). Header shows
`earned/total`. Unlock moment in-game: a **bottom toast** reusing the `sw-toast` pattern
(medallion glyph + "Achievement — Clean Sweep!"), auto-dismissing, aria-live polite,
never blocking play; celebration effects follow §4's ladder (respecting reduced-motion).

**The list (18, four families):**

| Family | Achievements |
| --- | --- |
| Clearing | First Clear · Double (2 lines, one move) · Triple (3) · **Clean Sweep** (4+) · Fresh Start (a clear leaves the board empty) · 100 Lines · 500 Lines |
| Streak | Warming Up (×2) · On Fire (×3) · **Unstoppable** (×5, the cap) |
| Levels | Beat Level 5 · 10 · 25 · 50 |
| Daily | First Daily · 7-Day Streak · 30-Day Streak · Daily Best over 500 |

**Detection & data (no core changes):** the app spine already receives every needed signal —
`cleared` events carry rows+cols (count = lines-per-move; board-empty check is a cheap scan),
combo events carry the multiplier, level completion and daily results flow through existing
handlers. Detection lives in a small pure `src/ui/achievements.ts` evaluator (unit-testable:
`(event|snapshot, unlocked) → newly-unlocked[]`), wired in `app.ts`. Persistence:
`wbp.v1.achievements` → `{ [id]: unlockedAtISODate }` (never-throw, backward-compatible).
Lifetime counters that don't exist yet (total lines already in Stats; add nothing unless a
chosen achievement needs it — the list above needs **zero new counters**).

## 4. Celebration / juice (P11) — an escalation ladder, compositor-only

Principle: **intensity tracks accomplishment**, and every tier is transform/opacity/canvas
work only — nothing repaints board cells, and reduced-motion always falls back to the
existing static text feedback (score pop text remains; particles/flashes no-op as today).

| Moment | Today | Proposed escalation |
| --- | --- | --- |
| 1-line clear | 7 chips/cell burst + score pop | unchanged (baseline is good) |
| 2 lines | same as 1 | ~1.5× chip count; score pop at `--fs-chip`+ |
| 3 lines | same | 2× chips, **gold-tinted** chip mix; combo pop scales up |
| 4+ lines (Clean Sweep) | same | full gold palette burst + a single **overlay flash**: one full-board element on the existing `.board-hl` layer animating opacity 0→.25→0 (~180ms) — one composited layer fade, zero cell repaints |
| Streak ×3+ | combo pop | pop grows with ×N; burst adopts gold; stronger haptic step (existing haptics API) |
| Streak ×5 (cap) | — | badge does a one-shot scale pulse (transform-only) + Unstoppable toast |
| Level complete | panel | gem-colored chip burst from panel center; milestone/boss levels (N%10==0) get a bigger gold burst |
| New best (Endless) | 🏆 line | + gold burst on panel enter |
| Near-miss | — | game-over panel line: “**42 away from your best**” when within 15% of best (honest, no timer, no guilt) — the P11 retry pull |

Implementation shape: extend `particles.burst(points, opts?)` with `{palette?, multiplier?}`
(pooled system already caps at 400 — escalation stays inside the cap). The streak badge
already has the `--warm` ramp; the ladder reuses it rather than inventing a second system.

## 5. HUD hierarchy

Current stack: reserved 24px streak line (right-aligned badge, usually empty) → equal-width
score boxes → (gem chips row variant). Two issues: the reserved line is dead space 90% of the
time, and SCORE/BEST/LEVEL have equal visual weight though their importance differs.

**Proposal — the reserved line becomes a "status strip" (same fixed height, no layout jump):**
- **Left slot: mode context.** `LEVEL 12` / `DAILY` tag (small letterspaced label chip). This
  *moves LEVEL out of the hud-box rows*, which (a) frees a full box width so gem chips stop
  crowding on gem levels, and (b) gives score-goal levels a roomier 2-box row.
- **Right slot: streak badge** exactly as it is today (its overlap-proof flow slot is
  preserved — same line, same reservation, badge markup/classes untouched so P7 tests hold).
- **Score becomes the hero:** in the box row, SCORE gets `flex: 1.4` and keeps `--fs-value`;
  BEST drops one step (`--fs-chip`) with a dimmer label. Endless reads instantly as
  "your score, then your target."
- **Gem chips:** stay right-aligned; with LEVEL relocated they get the whole row — chip count
  stays high-contrast `--fs-chip`, letter cue untouched.
- aria: the strip's mode tag is plain text (already announced elsewhere; no live region
  changes). All existing aria-live composition in the move message is untouched.

## 6. Level map language + the streak calendar

### Map polish (visual only — mechanics stay)
- **Completion header:** `12 / 50 · 24%` beside the "Levels" title — the map-as-collectible
  Zeigarnik pull, one line, no new data (derivable from level results).
- **Milestone medallions:** every 10th node renders larger (~80px) with a small gold banner
  ribbon under the number — matching the engagement plan's boss-every-10 rhythm and the §3
  medallion identity. Pure render branch on `level % 10 === 0`.
- **Completed nodes:** add a small carved notch/check glyph inside the gold ring (shape cue —
  completed must not be ring-color-only).
- **Band ambience:** the trail background subtly darkens per 10-level band (one static
  vertical gradient on the trail inner — painted once, scroll-cheap).
- Keep: slalom trail, "?" locked places, focal pulse (already reduced-motion-gated), native
  disabled locked nodes.

### Streak calendar (deferred from P9 — design + minimal data model)
- **Minimal data:** extend `DailyState` with `history: Record<string, number>` (`YYYY-MM-DD`
  → that day's score), written in `recordDailyResult` (one line: `history[today] = score`).
  Storage bump with the established backward-compat pattern (missing → `{}`); pure, fully
  testable; unbounded growth is ~40 bytes/day — prune to a rolling 400 days on save.
  ⚠ This touches `src/core/daily.ts` — flagged in §9, needs owner sign-off on the core edit.
- **Design:** a month grid (7 columns, Mon–Sun) inside an overlay panel opened by tapping the
  Daily card's streak line ("Streak 4 🔥 ›"). States, each with a **shape** cue:
  - Completed day: filled amber square + dot ✓ mark.
  - Forgiven gap (a missed day bridged by the streak — derivable at render from neighboring
    completed days, no extra storage): hollow ring + shield glyph, echoing the in-game grace
    shield vocabulary.
  - Missed day: plain empty cell. **Deliberately neutral — no red, no "broken" iconography**
    (ethics: invitational, not guilt).
  - Today: outlined; future days: blank.
  - Month pager (‹ ›) limited to months with history.
- Header: current streak / longest / best score (data already exists). Full keyboard/aria:
  the grid is a labeled table, each day cell aria-labelled ("Aug 14, played, 320 points").

## 7. FTUE polish (P11) — presentation-side teaching

- **First-clear celebration (once ever):** the first line clear a player lands gets the tier-3
  gold burst + a one-time "Line clear! +N" banner (stored `wbp.v1.seenFirstClear`-style flag).
  A guaranteed competence hit on the guaranteed-solvable opening (P8a already ensures a legal
  start; levels 1–3 are already the easy band).
- **Gem coach mark (once):** on the first gem-goal level, a dismissible one-liner anchored
  above the board — "Clear lines through gems to collect them" — with the gem glyph.
  Progressive disclosure without a tutorial wall; stored seen-flag; Escape/tap dismisses;
  announced politely.
- **Intro overlay refresh:** keep 3 steps, but swap the text-only list for step glyphs
  (piece → board / full line flash / crossed-out board) drawn with existing block/gem CSS —
  teach-by-showing at near-zero cost. Still skippable/re-openable.
- **Early-win *generation* tuning** (first trays produce an obvious clear within 2–3
  placements) is the one FTUE item that lives in `src/core/levels.ts` piece-pool parameters —
  **explicitly out of this design pass's file scope**; flagged in §9 as a separate
  owner-approved core-tuning slice if wanted.

## 8. Slices — ordered, each independently shippable (one commit each)

| # | Slice | Files | Test surface | Device gate |
| --- | --- | --- | --- | --- |
| D1 | **Token consolidation + flat-block tune** (§1) | `theme.css`, `game.css` | visual no-diff by inspection; suite green | `?perf=1` drag ~60fps; flat blocks still read as wood |
| D2 | **HUD status strip + score hero** (§5) | `hud.ts`, `game.css` | render-assert: strip slots, badge intact, LEVEL relocated | narrow-width eyeball (badge/BEST no overlap) |
| D3 | **Celebration ladder + near-miss line** (§4) | `particles.ts`, `hud.ts`, `screens.ts`, `game.css` | unit: burst opts, ladder mapping, near-miss threshold; reduced-motion no-op | clear-frame fps (no Tier-2 regression) |
| D4 | **Achievements** (§3): evaluator + storage + toast + Awards panel | `ui/achievements.ts` (new), `storage.ts`, `screens.ts`, `app.ts` wiring | unit evaluator matrix; render-assert panel/toast; storage round-trip | toast legibility |
| D5 | **Cosmetics** (§2): theme attributes + Style panel + palettes (gated on D4) | `theme.css`, `screens.ts`, `storage.ts`, `app.ts`, `particles.ts` | render-assert locked/unlocked swatches; selection persistence; palette-contrast checks | `?perf=1` per board theme; gem letter contrast per theme |
| D6 | **Level-map polish** (§6 map) | `screens.ts`, `game.css` | render-assert: completion header, milestone node class, completed glyph | map eyeball + scroll perf |
| D7 | **Daily history + streak calendar** (§6 calendar) | `core/daily.ts` ⚠, `storage.ts`, `screens.ts`, `game.css` | pure history/prune tests; back-compat load; calendar render-assert incl. forgiven-day derivation | calendar eyeball |
| D8 | **FTUE presentation** (§7, minus core tuning) | `screens.ts`, `app.ts`, `storage.ts` (seen-flags), `game.css` | render-assert coach mark + first-clear banner one-shot | first-run walkthrough on device |

Ordering rationale: D1 is the foundation every later slice's CSS references. D2/D3 are
user-visible wins with no storage risk. D4 must precede D5 (unlocks derive from
achievements). D6–D8 are independent of each other.

## 9. Tensions & flags — RESOLVED (owner + TPM, 2026-08-22)

1. **`app.ts` wiring — ✅ APPROVED.** "No core changes / no architecture drift" was the
   intent, not "never touch app.ts." Achievement detection, cosmetic application, and
   coach-marks wire through the spine (the established HUD/daily/resume pattern).
2. **`core/daily.ts` history field (D7) — ✅ APPROVED.** One-line pure addition to
   `recordDailyResult` + schema bump, fully test-covered; it's the model the P9b deferral
   asked for. Proceed in D7.
3. **FTUE generation tuning — ⏸ DEFERRED.** D8 ships the presentation half only. The
   `core/levels.ts` early-clear tuning is a separate, later, owner-approved slice — never
   bundled into D8.
4. **Clean-Sweep board flash (D3) — HARD GATE, non-negotiable.** One opacity-animated element
   on the composited `.board-hl` layer. If `?perf=1` shows *any* clear-frame regression on
   the old iPad, the flash is cut, no debate — the gold burst alone carries the tier.
5. **Flat-block second inset + panel grain (D1) — behind the iPad gate, which MUST be run**
   (never skipped as "should be free"); either reverts independently if the gate fails.
6. **Home-screen crowding — ✅ mitigation approved.** Awards merges into a tabbed Stats
   panel; Style lives inside Settings; the home action row stays at three items.
7. **D5 contrast is load-bearing (TPM guardrail):** each board theme's acceptance requires a
   *measured* contrast check of the gem colorblind letter cue and the preview shape cues
   against that theme's backgrounds — dark themes (Walnut Dark, Ebony Night) are exactly
   where the cue could silently die. Not an assumption; a checked number per theme.

## 10. Per-slice verification protocol

Every slice: `npm test` + `npm run typecheck` green → owner on-device look-check (old iPad)
→ `?perf=1` probe for anything touching game surfaces (drag fps + clear-frame) → single
commit (explicit paths, no `git add -A`) → stop for review before the next slice.
