import { describe, it, expect } from 'vitest';
import { clearsFragment, lineCount } from './line-hint';

describe('lineCount', () => {
  it('sums rows and cols', () => {
    expect(lineCount({ rows: [], cols: [] })).toBe(0);
    expect(lineCount({ rows: [2], cols: [] })).toBe(1);
    expect(lineCount({ rows: [0, 7], cols: [4] })).toBe(3);
  });
});

describe('clearsFragment', () => {
  it('is empty when nothing clears', () => {
    expect(clearsFragment(0)).toBe('');
    expect(clearsFragment(-1)).toBe('');
  });
  it('uses the singular for one line', () => {
    expect(clearsFragment(1)).toBe('clears 1 line');
  });
  it('pluralizes for more than one', () => {
    expect(clearsFragment(2)).toBe('clears 2 lines');
    expect(clearsFragment(5)).toBe('clears 5 lines');
  });
});
