/**
 * Shared, DOM-free types for the game core.
 *
 * The whole core is a pure function of `(GameState, Move)`; these types define
 * the state it threads and the semantic events it emits for the UI to animate.
 */

/** Board is 8x8. */
export const BOARD_SIZE = 8;
/** Exactly three pieces are offered at a time. */
export const TRAY_SIZE = 3;
/** Number of wood-tone materials pieces can take (1..MATERIAL_COUNT). */
export const MATERIAL_COUNT = 6;

/** A cell coordinate or a relative offset within a shape. */
export interface Coord {
  readonly row: number;
  readonly col: number;
}

/**
 * A shape is a normalized set of relative filled cells (min row = 0, min col = 0).
 * Shapes never rotate, so each orientation we want in play is its own entry.
 */
export interface Shape {
  readonly id: string;
  readonly cells: readonly Coord[];
  readonly size: number; // cells.length
  readonly width: number; // max col + 1
  readonly height: number; // max row + 1
}

/** A concrete tray piece instance (a shape + a visual material + placement state). */
export interface Piece {
  readonly id: string; // unique per instance, e.g. "p-<n>"
  readonly shape: Shape;
  readonly material: number; // 1..MATERIAL_COUNT wood-tone index
  readonly placed: boolean;
  /**
   * Gems riding on some of this piece's shape cells (Levels gems goal). Maps a
   * shape-cell index (into `shape.cells`) to a gem color; absent = no gems.
   * Inert until piece-borne gems land; undefined for every ordinary piece.
   */
  readonly gems?: Readonly<Record<number, number>>;
}

/**
 * Board is a flat Uint8Array of length BOARD_SIZE*BOARD_SIZE.
 * 0 = empty; >0 = filled, value is the material index of the piece that filled it.
 */
export type Board = Uint8Array;

export type Screen = 'home' | 'playing' | 'gameover';

/** Which game mode a session is running. */
export type GameMode = 'endless' | 'levels';

/**
 * A Levels session's win condition — reach a target score, or clear a per-color
 * quota of gems. Never both (either/or). Endless has no win condition and
 * carries 'score' inertly.
 */
export type GoalType = 'gems' | 'score';

/** Per-color gem counts, keyed by color index (1..MATERIAL_COUNT). */
export type GemCounts = Readonly<Record<number, number>>;

/**
 * Full lifecycle status of a session. Endless uses home/playing/gameover;
 * Levels adds levelcomplete/levelfailed.
 */
export type GameStatus = 'home' | 'playing' | 'gameover' | 'levelcomplete' | 'levelfailed';

export interface GameState {
  readonly board: Board;
  readonly tray: readonly Piece[]; // length TRAY_SIZE; placed pieces flagged
  readonly score: number;
  readonly highScore: number;
  readonly status: GameStatus;
  readonly rngState: number; // current PRNG state (seedable/deterministic)
  readonly pieceSeq: number; // counter for unique piece ids
  readonly streak: number; // consecutive line-clearing placements (0 = no active streak)

  // --- Mode ---
  readonly mode: GameMode;
  // Levels-mode fields (inert for endless: goalType 'score', 0 score, empty gems/counts).
  readonly level: number; // current level number (0 in endless)
  readonly goalType: GoalType; // win condition: reach a score, or clear gem quotas
  readonly targetScore: number; // score needed (score goal); 0 otherwise
  readonly gems: Uint8Array; // length 64; 0 = none, >0 = gem color still on the board
  readonly quotas: GemCounts; // per-color gems the level requires cleared (gems goal)
  readonly gemsCleared: GemCounts; // per-color gems cleared so far
  readonly gemSupplyRemaining: GemCounts; // per-color gems not yet dealt (generation invariant)
}

/** The only mutation the engine accepts. */
export type Move = { readonly type: 'place'; readonly pieceId: string; readonly at: Coord };

/** Why a move was rejected. */
export type RejectReason = 'not-found' | 'occupied' | 'out-of-bounds' | 'already-placed';

/** Semantic events emitted by the engine for the UI to animate. */
export type GameEvent =
  | { type: 'placed'; cells: Coord[]; material: number }
  | { type: 'cleared'; rows: number[]; cols: number[]; cells: Coord[] }
  // Emitted after `cleared`, before `refill`, when a clear removes gems (Levels
  // gems goal). `cleared` = per-color gems removed this move; `totals` = the
  // cumulative per-color gems cleared so far (for HUD progress vs quotas).
  | { type: 'gemsCleared'; cleared: Record<number, number>; totals: Record<number, number> }
  | { type: 'scored'; delta: number; total: number; kind: 'placement' | 'clear' }
  | { type: 'combo'; streak: number; multiplier: number; lines: number }
  | { type: 'refill'; pieces: Piece[] }
  | { type: 'gameover'; finalScore: number; highScore: number }
  | { type: 'levelcomplete'; level: number; score: number }
  | { type: 'levelfailed'; level: number };

export interface MoveResult {
  readonly ok: boolean; // false if the move was invalid (no state change)
  readonly state: GameState; // unchanged when ok === false
  readonly events: readonly GameEvent[];
  readonly reason?: RejectReason;
}
