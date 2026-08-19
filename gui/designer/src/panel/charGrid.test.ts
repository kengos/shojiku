// @vitest-environment node
// The char_grid panel model: what it reads out of a document (including a
// hostile one), and what each control authors.
//
// The load-bearing case is `countOp`. `CharGridSpec.chars_per_line` and
// `.lines` are REQUIRED, non-`Option` `usize` fields, so the panel's usual
// "an empty value clears the key" rule would author a template the engine
// cannot parse — these tests are what pin that it never does.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  countOp,
  countStepOp,
  countSteppable,
  DEFAULT_WRITING_MODE,
  gridLengthOp,
  MAX_GRID_COUNT,
  readCharGrid,
  WRITING_MODES,
  writingModeOp,
} from './charGrid';

const P = 'sections.body.items[0]';

function reads(node: unknown): ReadFn {
  return ((path: string) => (path === P ? node : undefined)) as ReadFn;
}

const FULL = {
  type: 'char_grid',
  grid: { charsPerLine: 20, lines: 10, cellSize: '9mm', lineGap: '4.5mm', charGap: 2 },
  writingMode: 'vertical_rl',
};

describe('readCharGrid', () => {
  it('reads the authored grid, keeping each length in its authored unit', () => {
    expect(readCharGrid(reads(FULL), P)).toEqual({
      charsPerLine: '20',
      lines: '10',
      cellSize: '9mm',
      lineGap: '4.5mm',
      charGap: '2',
      writingMode: 'vertical_rl',
    });
  });

  it('reads an ABSENT grid as every field unset at the engine default mode', () => {
    expect(readCharGrid(reads({ type: 'char_grid' }), P)).toEqual({
      charsPerLine: '',
      lines: '',
      cellSize: '',
      lineGap: '',
      charGap: '',
      writingMode: DEFAULT_WRITING_MODE,
    });
  });

  it('degrades a hostile node to unset instead of throwing', () => {
    // A `grid` that is not a map, a container where a scalar belongs, a
    // non-map item, an absent path, and a read that throws.
    expect(readCharGrid(reads({ type: 'char_grid', grid: 'nope' }), P).charsPerLine).toBe('');
    expect(readCharGrid(reads({ type: 'char_grid', grid: [1, 2] }), P).lines).toBe('');
    expect(
      readCharGrid(reads({ type: 'char_grid', grid: { cellSize: { a: 1 } } }), P).cellSize,
    ).toBe('');
    expect(readCharGrid(reads('not a map'), P).charsPerLine).toBe('');
    expect(readCharGrid(reads(undefined), P).lines).toBe('');
    expect(
      readCharGrid(
        (() => {
          throw new Error('alias bomb');
        }) as ReadFn,
        P,
      ).cellSize,
    ).toBe('');
  });

  it('stays inert against a __proto__-carrying grid', () => {
    // The grid keys are fixed literals rather than attacker strings, so this
    // is inert by construction — asserted anyway, because "by construction"
    // is exactly the reasoning that stops being true after a refactor.
    const hostile = JSON.parse('{"type":"char_grid","grid":{"__proto__":{"lines":99}}}');
    expect(readCharGrid(reads(hostile), P).lines).toBe('');
    expect(({} as Record<string, unknown>).lines).toBeUndefined();
  });

  it('does not echo an unknown writingMode back as the selected one', () => {
    // Showing a garbage value as selected would misreport what the engine does.
    expect(readCharGrid(reads({ grid: {}, writingMode: 'sideways' }), P).writingMode).toBe(
      DEFAULT_WRITING_MODE,
    );
    expect(readCharGrid(reads({ grid: {}, writingMode: 7 }), P).writingMode).toBe(
      DEFAULT_WRITING_MODE,
    );
  });
});

describe('countOp — a REQUIRED usize key', () => {
  it('authors a whole count', () => {
    expect(countOp(P, 'charsPerLine', '24')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charsPerLine'],
      value: 24,
    });
  });

  it('authors NOTHING for an empty value — the key must never be cleared', () => {
    expect(countOp(P, 'charsPerLine', '')).toBeNull();
    expect(countOp(P, 'lines', '   ')).toBeNull();
  });

  it('refuses a non-integer, a zero, a negative and a past-the-cap count', () => {
    expect(countOp(P, 'lines', '2.5')).toBeNull();
    expect(countOp(P, 'lines', 'abc')).toBeNull();
    expect(countOp(P, 'lines', '0')).toBeNull();
    expect(countOp(P, 'lines', '-3')).toBeNull();
    expect(countOp(P, 'lines', String(MAX_GRID_COUNT + 1))).toBeNull();
    expect(countOp(P, 'lines', String(MAX_GRID_COUNT))).not.toBeNull();
  });
});

describe('countStepOp / countSteppable', () => {
  it('steps through the same guard, so ▼ cannot reach zero', () => {
    expect(countStepOp(P, 'lines', '10', 1)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'lines'],
      value: 11,
    });
    expect(countStepOp(P, 'lines', '1', -1)).toBeNull();
  });

  it('dispatches nothing from an unsteppable current value', () => {
    expect(countStepOp(P, 'lines', '', 1)).toBeNull();
    expect(countStepOp(P, 'lines', '3.5', 1)).toBeNull();
    expect(countSteppable('')).toBe(false);
    expect(countSteppable('0')).toBe(false);
    expect(countSteppable('2.5')).toBe(false);
    expect(countSteppable('12')).toBe(true);
  });
});

describe('gridLengthOp / writingModeOp', () => {
  it('keeps the authored unit and CLEARS on empty (the optional keys)', () => {
    expect(gridLengthOp(P, 'cellSize', '9mm')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'cellSize'],
      value: '9mm',
    });
    // Clearing the cell side is what returns it to the engine's
    // derive-from-the-content-width behaviour — the whole point of the field.
    expect(gridLengthOp(P, 'cellSize', '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'cellSize'],
    });
  });

  it('never authors the engine default writing mode', () => {
    expect(writingModeOp(P, 'vertical_rl')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['writingMode'],
      value: 'vertical_rl',
    });
    expect(writingModeOp(P, 'horizontal_tb')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['writingMode'],
    });
  });
});

describe('WRITING_MODES stays pinned to the engine wire', () => {
  it('matches the WritingMode variants the engine deserializes', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../../engine/core/src/style/writing.rs', import.meta.url)),
      'utf8',
    );
    // `#[serde(rename_all = "snake_case")]`, so the wire spelling is the
    // variant name snake-cased.
    const body = src.slice(src.indexOf('pub enum WritingMode'));
    const variants = [
      ...body.slice(0, body.indexOf('}')).matchAll(/^\s{4}([A-Z][A-Za-z]*),$/gm),
    ].map((m) => m[1].replace(/(?!^)([A-Z])/g, '_$1').toLowerCase());
    // A regex that stopped matching would compare against an empty list and
    // pass vacuously — pin that it found something first.
    expect(variants.length).toBeGreaterThan(0);
    expect([...WRITING_MODES].sort()).toEqual([...variants].sort());
  });
});
