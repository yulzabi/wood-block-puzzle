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
}

/**
 * Board is a flat Uint8Array of length BOARD_SIZE*BOARD_SIZE.
 * 0 = empty; >0 = filled, value is the material index of the piece that filled it.
 */
export type Board = Uint8Array;

export type Screen = 'home' | 'playing' | 'gameover';

export interface GameState {
  readonly board: Board;
  readonly tray: readonly Piece[]; // length TRAY_SIZE; placed pieces flagged
  readonly score: number;
  readonly highScore: number;
  readonly status: Screen;
  readonly rngState: number; // current PRNG state (seedable/deterministic)
  readonly pieceSeq: number; // counter for unique piece ids
}

/** The only mutation the engine accepts. */
export type Move = { readonly type: 'place'; readonly pieceId: string; readonly at: Coord };

/** Why a move was rejected. */
export type RejectReason = 'not-found' | 'occupied' | 'out-of-bounds' | 'already-placed';

/** Semantic events emitted by the engine for the UI to animate. */
export type GameEvent =
  | { type: 'placed'; cells: Coord[]; material: number }
  | { type: 'cleared'; rows: number[]; cols: number[]; cells: Coord[] }
  | { type: 'scored'; delta: number; total: number; kind: 'placement' | 'clear' }
  | { type: 'refill'; pieces: Piece[] }
  | { type: 'gameover'; finalScore: number; highScore: number };

export interface MoveResult {
  readonly ok: boolean; // false if the move was invalid (no state change)
  readonly state: GameState; // unchanged when ok === false
  readonly events: readonly GameEvent[];
  readonly reason?: RejectReason;
}
