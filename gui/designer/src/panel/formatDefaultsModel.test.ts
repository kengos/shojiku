import { describe, expect, it } from 'vitest';
import {
  formatDefaultNameOp,
  formatDefaultPatternOp,
  PATTERN_TYPES,
  readFormatDefaultsView,
} from './formatDefaultsModel';

describe('readFormatDefaultsView', () => {
  it('reads the three arms a slot can hold', () => {
    const view = readFormatDefaultsView({
      formats: { date: 'wareki', datetime: { pattern: 'yyyy HH:mm' } },
    });
    expect(view.date).toEqual({ kind: 'name', name: 'wareki' });
    expect(view.datetime).toEqual({ kind: 'inline', pattern: 'yyyy HH:mm' });
    expect(view.currency).toEqual({ kind: 'unset' });
  });

  it('carries every declared type, so the section never branches on a missing key', () => {
    const view = readFormatDefaultsView(undefined);
    expect(Object.keys(view)).toEqual([
      'date',
      'datetime',
      'currency',
      'number',
      'percentage',
      'quantity',
    ]);
    expect(Object.values(view).every((slot) => slot.kind === 'unset')).toBe(true);
  });

  it('reads a garbage slot as UNSET — the row then shows the locale default', () => {
    const view = readFormatDefaultsView({
      formats: { date: 7, datetime: [], currency: {}, number: '', percentage: { pattern: 3 } },
    });
    for (const type of ['date', 'datetime', 'currency', 'number', 'percentage']) {
      expect(view[type]).toEqual({ kind: 'unset' });
    }
  });

  it('reads a non-map defaults or formats node as all-unset', () => {
    expect(readFormatDefaultsView('nope').date).toEqual({ kind: 'unset' });
    expect(readFormatDefaultsView({ formats: 'nope' }).date).toEqual({ kind: 'unset' });
  });
});

describe('formatDefaultNameOp', () => {
  it('sets a picked spelling at the slot', () => {
    expect(formatDefaultNameOp('date', 'wareki')).toEqual({
      op: 'setScalar',
      keys: ['defaults', 'formats', 'date'],
      value: 'wareki',
    });
  });

  it('CLEARS the slot on an empty spelling — an absent name is the locale default', () => {
    expect(formatDefaultNameOp('date', '')).toEqual({
      op: 'removeKey',
      keys: ['defaults', 'formats', 'date'],
    });
  });
});

describe('formatDefaultPatternOp', () => {
  it('AUTHORS NOTHING on an empty pattern', () => {
    // `InlineFormat.pattern` is required: writing `{}` produces a template the
    // engine cannot parse, and the op would still succeed with valid YAML.
    expect(formatDefaultPatternOp('date', '', { kind: 'unset' })).toBeNull();
    expect(formatDefaultPatternOp('date', '', { kind: 'inline', pattern: 'y' })).toBeNull();
  });

  it('edits an inline slot at its own pattern key, so the map’s comments survive', () => {
    expect(formatDefaultPatternOp('date', 'yyyy', { kind: 'inline', pattern: 'y' })).toEqual({
      op: 'setScalar',
      keys: ['defaults', 'formats', 'date', 'pattern'],
      value: 'yyyy',
    });
  });

  it('replaces the whole value when switching arms — the wire union is untagged', () => {
    for (const current of [{ kind: 'unset' } as const, { kind: 'name', name: 'wareki' } as const]) {
      expect(formatDefaultPatternOp('date', 'yyyy', current)).toEqual({
        op: 'putValue',
        keys: ['defaults', 'formats', 'date'],
        value: { pattern: 'yyyy' },
      });
    }
  });
});

describe('PATTERN_TYPES', () => {
  it('is the dated pair only — `NamedFormatKind` has no third arm', () => {
    // On the other four an inline pattern warns `format_pattern_ignored` and
    // the default form renders, so no pattern surface is offered there.
    expect(PATTERN_TYPES).toEqual(['date', 'datetime']);
  });
});
