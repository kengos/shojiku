// The value-rule model: range / placeholder / example reads at a keys path and
// their op builders — the refusals that keep a fractional, negative or hostile
// number off a `u64` key (a parse error for the whole document), the null op of
// an unchanged entry, and the typed example per base type.

import { describe, expect, it } from 'vitest';
import { applyDefinitionOps } from './definitionsEdit';
import {
  exampleEditable,
  exampleOp,
  parseNumber,
  placeholderOp,
  rangeConflict,
  rangeOp,
  readValueRules,
  shownScalar,
} from './valueRules';

const DEFS = `type: object
properties:
  name:
    type: string
    minLength: 1
    maxLength: 40
    placeholder: "—"
    example: Taro
  qty:
    type: integer
    minimum: -5
    maximum: 99.5
    example: 3
  odd:
    type: string
    minLength: abc
    example: { a: 1 }
  tags:
    type: array
    minItems: 0
    maxItems: 5
    items: { type: string, maxLength: 12 }
`;

const AT = (name: string) => ['properties', name];

describe('readValueRules', () => {
  it('reads every range key, the placeholder and the example as authored', () => {
    const name = readValueRules(DEFS, AT('name'));
    expect(name.ranges.minLength).toBe('1');
    expect(name.ranges.maxLength).toBe('40');
    expect(name.ranges.minimum).toBe('');
    expect(name.placeholder).toBe('—');
    expect(name.example).toBe('Taro');
    const qty = readValueRules(DEFS, AT('qty'));
    expect([qty.ranges.minimum, qty.ranges.maximum]).toEqual(['-5', '99.5']);
    expect(qty.example).toBe(3);
    const tags = readValueRules(DEFS, AT('tags'));
    expect([tags.ranges.minItems, tags.ranges.maxItems]).toEqual(['0', '5']);
    expect(readValueRules(DEFS, [...AT('tags'), 'items']).ranges.maxLength).toBe('12');
  });

  it('shows a non-number authored on a number key verbatim, and a container example raw', () => {
    const odd = readValueRules(DEFS, AT('odd'));
    expect(odd.ranges.minLength).toBe('abc');
    expect(odd.example).toEqual({ a: 1 });
    expect(odd.placeholder).toBe('');
  });

  it('degrades to all-empty for a missing node, a hostile segment or unreadable text', () => {
    for (const rules of [
      readValueRules(DEFS, AT('nope')),
      readValueRules(DEFS, ['properties', '__proto__']),
      readValueRules('{ [unclosed', AT('name')),
      readValueRules(DEFS, [...AT('name'), 'type']),
    ]) {
      expect(rules.ranges.maxLength).toBe('');
      expect(rules.placeholder).toBe('');
      expect(rules.example).toBeUndefined();
    }
  });
});

describe('shownScalar', () => {
  it('spells numbers and booleans, keeps text, and shows a container as empty', () => {
    expect(shownScalar(1.5)).toBe('1.5');
    expect(shownScalar(true)).toBe('true');
    expect(shownScalar('x')).toBe('x');
    expect(shownScalar([1])).toBe('');
    expect(shownScalar(undefined)).toBe('');
  });
});

describe('parseNumber', () => {
  const COUNT = { whole: true, nonNegative: true };
  const BOUND = { whole: false, nonNegative: false };
  it('refuses what a u64 count key cannot hold', () => {
    expect(parseNumber('-1', COUNT)).toBe('negative');
    expect(parseNumber('1.5', COUNT)).toBe('not_whole');
    expect(parseNumber('1e400', COUNT)).toBe('too_large');
    expect(parseNumber('9007199254740992', COUNT)).toBe('too_large');
    expect(parseNumber('abc', COUNT)).toBe('not_a_number');
    expect(parseNumber(' 12 ', COUNT)).toBe(12);
    // A negative zero means 0 — written as `-0` it would break the u64 key.
    for (const zero of ['-0', '-0.0', '-0e3']) {
      expect(Object.is(parseNumber(zero, COUNT), 0)).toBe(true);
    }
  });

  it('takes any finite number for a bound', () => {
    expect(parseNumber('-1.5', BOUND)).toBe(-1.5);
    expect(parseNumber('1e400', BOUND)).toBe('too_large');
    expect(parseNumber('-Infinity', BOUND)).toBe('too_large');
    expect(parseNumber('abc', BOUND)).toBe('not_a_number');
  });
});

describe('rangeOp', () => {
  const keys = (key: string) => [...AT('name'), key];
  it('sets a count key as a number', () => {
    expect(rangeOp(AT('name'), 'maxLength', '40', '12')).toEqual({
      ok: true,
      op: { op: 'setScalar', keys: keys('maxLength'), value: 12 },
    });
  });

  it('sets a bound to a negative fraction', () => {
    expect(rangeOp(AT('qty'), 'minimum', '-5', '-2.5')).toEqual({
      ok: true,
      op: { op: 'setScalar', keys: [...AT('qty'), 'minimum'], value: -2.5 },
    });
  });

  it('clears an authored key on an empty entry, and authors nothing when none was set', () => {
    expect(rangeOp(AT('name'), 'minLength', '1', '  ')).toEqual({
      ok: true,
      op: { op: 'removeKey', keys: keys('minLength') },
    });
    expect(rangeOp(AT('name'), 'minItems', '', '')).toEqual({ ok: true, op: null });
  });

  it('authors nothing for the same number spelled differently', () => {
    expect(rangeOp(AT('name'), 'maxLength', '40', '40.0')).toEqual({ ok: true, op: null });
  });

  it('refuses hostile magnitudes on every count key and lets a bound take a negative', () => {
    for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const) {
      expect(rangeOp(AT('name'), key, '', '-1')).toEqual({ ok: false, refusal: 'negative' });
      expect(rangeOp(AT('name'), key, '', '1.5')).toEqual({ ok: false, refusal: 'not_whole' });
      expect(rangeOp(AT('name'), key, '', '1e400')).toEqual({ ok: false, refusal: 'too_large' });
      expect(rangeOp(AT('name'), key, '', 'abc')).toEqual({ ok: false, refusal: 'not_a_number' });
    }
    for (const key of ['minimum', 'maximum'] as const) {
      expect(rangeOp(AT('qty'), key, '', '1e400')).toEqual({ ok: false, refusal: 'too_large' });
      expect(rangeOp(AT('qty'), key, '', 'abc')).toEqual({ ok: false, refusal: 'not_a_number' });
      expect(rangeOp(AT('qty'), key, '', '-1').ok).toBe(true);
    }
  });
});

describe('rangeConflict', () => {
  it('is true only for two readable bounds with the lower above the upper', () => {
    expect(rangeConflict('10', '5')).toBe(true);
    expect(rangeConflict('5', '10')).toBe(false);
    expect(rangeConflict('5', '5')).toBe(false);
    expect(rangeConflict('', '5')).toBe(false);
    expect(rangeConflict('10', '')).toBe(false);
    expect(rangeConflict('abc', '5')).toBe(false);
  });
});

describe('placeholderOp', () => {
  it('sets verbatim, clears on empty, and authors nothing unchanged', () => {
    expect(placeholderOp(AT('name'), '', ' — ')).toEqual({
      op: 'setScalar',
      keys: [...AT('name'), 'placeholder'],
      value: ' — ',
    });
    expect(placeholderOp(AT('name'), '—', '')).toEqual({
      op: 'removeKey',
      keys: [...AT('name'), 'placeholder'],
    });
    expect(placeholderOp(AT('name'), '—', '—')).toBeNull();
  });
});

describe('exampleOp', () => {
  const ex = (type: string, current: unknown, raw: string) =>
    exampleOp(AT('f'), type, current, raw);
  const set = (value: unknown) => ({
    ok: true,
    op: { op: 'setScalar', keys: [...AT('f'), 'example'], value },
  });

  it('types the example by the field', () => {
    expect(ex('string', undefined, '0012')).toEqual(set('0012'));
    expect(ex('string', undefined, ' ')).toEqual(set(' '));
    expect(ex('number', undefined, '1.5')).toEqual(set(1.5));
    expect(ex('integer', undefined, '-3')).toEqual(set(-3));
    expect(ex('boolean', undefined, 'true')).toEqual(set(true));
    expect(ex('boolean', true, 'false')).toEqual(set(false));
  });

  it('refuses what the type cannot hold', () => {
    expect(ex('number', undefined, 'abc')).toEqual({ ok: false, refusal: 'not_a_number' });
    expect(ex('integer', undefined, '1.5')).toEqual({ ok: false, refusal: 'not_whole' });
    expect(ex('number', undefined, '1e400')).toEqual({ ok: false, refusal: 'too_large' });
  });

  it('clears on empty and authors nothing when unchanged', () => {
    expect(ex('number', 3, ' ')).toEqual({
      ok: true,
      op: { op: 'removeKey', keys: [...AT('f'), 'example'] },
    });
    expect(ex('string', undefined, '')).toEqual({ ok: true, op: null });
    expect(ex('integer', 3, '3')).toEqual({ ok: true, op: null });
    expect(ex('string', 'Taro', 'Taro')).toEqual({ ok: true, op: null });
  });
});

describe('exampleEditable', () => {
  it('is false only for a container example', () => {
    expect(exampleEditable(undefined)).toBe(true);
    expect(exampleEditable('x')).toBe(true);
    expect(exampleEditable(0)).toBe(true);
    expect(exampleEditable(false)).toBe(true);
    expect(exampleEditable({ a: 1 })).toBe(false);
    expect(exampleEditable([1])).toBe(false);
  });
});

describe('round trip', () => {
  // A fixed-point fixture (block style), so byte-exact holds.
  const SOURCE = `# Order data.
type: object
properties:
  # Free text.
  memo:
    type: string # short
    maxLength: 40 # a line
    placeholder: "-"
`;

  it('a range, placeholder or example edit touches only its own key', () => {
    const range = rangeOp(['properties', 'memo'], 'maxLength', '40', '12');
    const op = range.ok ? range.op : null;
    expect(applyDefinitionOps(SOURCE, [op as NonNullable<typeof op>])).toBe(
      SOURCE.replace('maxLength: 40', 'maxLength: 12'),
    );
    const cleared = placeholderOp(['properties', 'memo'], '-', '');
    expect(applyDefinitionOps(SOURCE, [cleared as NonNullable<typeof cleared>])).toBe(
      SOURCE.replace('    placeholder: "-"\n', ''),
    );
    const example = exampleOp(['properties', 'memo'], 'string', undefined, 'メモ');
    const added = example.ok ? example.op : null;
    expect(applyDefinitionOps(SOURCE, [added as NonNullable<typeof added>])).toBe(
      `${SOURCE}    example: メモ\n`,
    );
  });
});
