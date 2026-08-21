import { describe, it, expect, vi } from 'vitest';
import { KeyboardController, clampOrigin, type KeyboardConfig } from './keyboard-controller';
import { SHAPES } from '../core/shapes';
import type { BoardView } from '../ui/board-view';
import type { Move, Piece, Shape } from '../core/types';

function byId(id: string): Shape {
  const s = SHAPES.find((x) => x.id === id);
  if (!s) throw new Error(`no shape ${id}`);
  return s;
}

describe('clampOrigin', () => {
  const sq = byId('square2'); // 2x2
  it('clamps negative origins to 0', () => {
    expect(clampOrigin({ row: -5, col: -5 }, sq, 8)).toEqual({ row: 0, col: 0 });
  });
  it('clamps so the whole shape stays in bounds (bottom-right)', () => {
    expect(clampOrigin({ row: 99, col: 99 }, sq, 8)).toEqual({ row: 6, col: 6 }); // 8 - 2
  });
  it('respects shape width/height per axis', () => {
    const line5h = byId('line5-h'); // width 5, height 1
    expect(clampOrigin({ row: 99, col: 99 }, line5h, 8)).toEqual({ row: 7, col: 3 });
  });
  it('leaves an in-range origin unchanged', () => {
    expect(clampOrigin({ row: 3, col: 4 }, sq, 8)).toEqual({ row: 3, col: 4 });
  });
});

/** Minimal DOM-free stand-in for a focused `.tray-piece` element. */
function makePieceEl(id: string) {
  const classes = new Set<string>();
  const el = {
    dataset: { pieceId: id } as Record<string, string | undefined>,
    classList: {
      add: (c: string) => { classes.add(c); },
      remove: (c: string) => { classes.delete(c); },
    },
    focus: () => {},
    closest: (_sel: string) => el,
  };
  return el;
}

interface FakeKeyEvent {
  key: string;
  target: unknown;
  stopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
function makeEvent(key: string, target: unknown): FakeKeyEvent {
  return {
    key,
    target,
    stopped: false,
    preventDefault() {},
    stopPropagation() { this.stopped = true; },
  };
}

interface Handlers {
  onTrayKey(e: KeyboardEvent): void;
  onDocKey(e: KeyboardEvent): void;
}

function setup() {
  const piece: Piece = { id: 'p1', shape: byId('single'), material: 1, placed: false };
  const onPlace = vi.fn<(m: Move) => void>();
  const boardView = { showPreview: () => {}, clearPreview: () => {} } as unknown as BoardView;
  const cfg: KeyboardConfig = {
    trayEl: {} as unknown as HTMLElement,
    boardView,
    getPieces: () => [piece],
    canPlaceAt: () => true,
    onPlace,
    announce: () => {},
  };
  const kc = new KeyboardController(cfg);
  const h = kc as unknown as Handlers;
  // Mirror real bubbling: tray listener first, then document — unless stopped.
  const dispatch = (ev: FakeKeyEvent): void => {
    h.onTrayKey(ev as unknown as KeyboardEvent);
    if (!ev.stopped) h.onDocKey(ev as unknown as KeyboardEvent);
  };
  return { piece, onPlace, dispatch };
}

describe('KeyboardController pickup/drop', () => {
  it('a single pickup keypress does NOT also drop (race regression)', () => {
    const { onPlace, dispatch } = setup();
    const el = makePieceEl('p1');
    dispatch(makeEvent('Enter', el));
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('pickup -> arrows -> drop calls onPlace exactly once with the moved origin', () => {
    const { onPlace, dispatch } = setup();
    const el = makePieceEl('p1');
    dispatch(makeEvent('Enter', el)); // pick up at (0,0)
    dispatch(makeEvent('ArrowDown', el)); // -> (1,0)
    dispatch(makeEvent('ArrowRight', el)); // -> (1,1)
    dispatch(makeEvent('Enter', el)); // drop
    expect(onPlace).toHaveBeenCalledTimes(1);
    const move = onPlace.mock.calls[0]?.[0];
    expect(move).toEqual({ type: 'place', pieceId: 'p1', at: { row: 1, col: 1 } });
  });

  it('Escape cancels without placing', () => {
    const { onPlace, dispatch } = setup();
    const el = makePieceEl('p1');
    dispatch(makeEvent('Enter', el));
    dispatch(makeEvent('Escape', el));
    dispatch(makeEvent('ArrowDown', el)); // no longer holding -> ignored
    expect(onPlace).not.toHaveBeenCalled();
  });
});
