# Architecture Decision Records

Short records of deliberate, load-bearing choices. Each is enforced across the codebase; read the relevant ADR before reversing something that looks odd.

| # | Decision |
| --- | --- |
| [0001](0001-high-score-only-persistence.md) | Persist only the high score (+ small meta), not the in-progress board |
| [0002](0002-dom-rendering-not-canvas.md) | Render with DOM + CSS transforms; canvas only for decorative particles |
| [0003](0003-uniform-random-piece-selection.md) | Uniform-random piece selection (no weighting / no guaranteed-solvable refill) |
| [0004](0004-prompt-service-worker-updates.md) | Prompt-based service-worker updates, not silent autoUpdate |
| [0005](0005-centered-portrait-app-frame.md) | Centered portrait app-frame layout |

Format: Context → Decision → Consequences. Keep them short.
