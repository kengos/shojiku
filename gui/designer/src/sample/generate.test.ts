// Tests for generate.ts — sample params generated from the definitions
// schema. genWalk.ts (the bounded schema walk) and genConstraints.ts (the
// per-type value constraints) are internals of this surface and are pinned
// HERE through `generateParams`/`extendParams`.
import { describe, expect, it } from 'vitest';
import {
  extendParams,
  extendParamsValue,
  fillMissingParams,
  generateParams,
  missingParamKeys,
} from './generate';
import { MAX_GENERATED_ROWS } from './genWalk';
import { baselineSynth, type SynthSpec, type ValueSynth } from './synth';

/** Build a definitions YAML from a top-level `properties` object literal. */
function defs(properties: Record<string, unknown>): string {
  return JSON.stringify({ version: '0.2.0', type: 'object', properties });
}

const gen = (properties: Record<string, unknown>, synth?: ValueSynth, locale?: string) =>
  JSON.parse(generateParams(defs(properties), synth, locale));

describe('generateParams', () => {
  it('uses example values verbatim', () => {
    const out = gen({
      a: { type: 'string', example: 'hello' },
      n: { type: 'number', example: 42 },
    });
    expect(out).toEqual({ a: 'hello', n: 42 });
  });

  it('picks an enum member deterministically', () => {
    const out = gen({ status: { type: 'string', enum: ['draft', 'sent', 'paid'] } });
    expect(['draft', 'sent', 'paid']).toContain(out.status);
    expect(gen({ status: { type: 'string', enum: ['draft', 'sent', 'paid'] } }).status).toBe(
      out.status,
    );
  });

  it('picks the VALUE of a labeled enum member, never the pair object', () => {
    const declared = [
      { value: 'backorder', label: '（入荷待ち）' },
      { value: 'arrived', label: '入荷済み' },
    ];
    const out = gen({ status: { type: 'string', enum: declared } });
    expect(['backorder', 'arrived']).toContain(out.status);
  });

  it('keeps a labeled numeric member in its declared type', () => {
    const out = gen({ rank: { type: 'integer', enum: [{ value: 3, label: '三号' }] } });
    expect(out.rank).toBe(3);
  });

  it('falls past an enum whose every member is malformed', () => {
    const out = gen({ status: { type: 'string', enum: [{ label: 'orphan' }, { a: 1 }] } });
    expect(typeof out.status).toBe('string');
  });

  it('respects minimum/maximum, clamping a synth that escapes them', () => {
    const high: ValueSynth = () => 999;
    expect(gen({ x: { type: 'number', minimum: 10, maximum: 20 } }, high).x).toBe(20);
    const low: ValueSynth = () => 1;
    expect(gen({ x: { type: 'number', minimum: 10, maximum: 20 } }, low).x).toBe(10);
    const inRange: ValueSynth = () => 15;
    expect(gen({ x: { type: 'number', minimum: 10, maximum: 20 } }, inRange).x).toBe(15);
  });

  it('respects minLength/maxLength', () => {
    const long: ValueSynth = () => 'abcdefghij';
    expect(gen({ s: { type: 'string', maxLength: 3 } }, long).s).toBe('abc');
    const shortSynth: ValueSynth = () => 'a';
    expect((gen({ s: { type: 'string', minLength: 5 } }, shortSynth).s as string).length).toBe(5);
  });

  it('leaves a non-numeric/non-string synth value unclamped', () => {
    const boolSynth: ValueSynth = () => false;
    expect(gen({ flag: { type: 'boolean' } }, boolSynth).flag).toBe(false);
  });

  it('defaults a leaf schema with no type to a string sample', () => {
    expect(typeof gen({ mystery: {} }).mystery).toBe('string');
  });

  it('reconciles an example with the declared type', () => {
    // A leading-zero account number parses as a number in YAML but the field is
    // a string — generation must produce a type-valid value.
    expect(gen({ acct: { type: 'string', example: 12345678 } }).acct).toBe('12345678');
    expect(gen({ flag: { type: 'string', example: true } }).flag).toBe('true');
    expect(gen({ n: { type: 'number', example: '42' } }).n).toBe(42);
    // A non-numeric string for a number field, and a matching example, pass
    // through unchanged.
    expect(gen({ n: { type: 'integer', example: 'NaN-ish' } }).n).toBe('NaN-ish');
    expect(gen({ n: { type: 'number', example: '' } }).n).toBe('');
    expect(gen({ s: { type: 'string', example: 'plain' } }).s).toBe('plain');
  });

  it('generates minItems rows within the row cap', () => {
    const out = gen({
      items: { type: 'array', minItems: 4, items: { type: 'string', example: 'x' } },
    });
    expect(out.items).toEqual(['x', 'x', 'x', 'x']);
  });

  it('bounds a hostile minItems at the row cap', () => {
    const out = gen({
      items: { type: 'array', minItems: 1e9, items: { type: 'string', example: 'x' } },
    });
    expect(out.items).toHaveLength(MAX_GENERATED_ROWS);
  });

  it('defaults the row count when minItems is absent', () => {
    const out = gen({ items: { type: 'array', items: { type: 'string', example: 'x' } } });
    expect(out.items).toHaveLength(3);
  });

  it('emits null rows for an array with no items schema', () => {
    const out = gen({ items: { type: 'array' } });
    expect(out.items).toEqual([null, null, null]);
  });

  it('skips non-object property schemas and objects with no properties', () => {
    expect(gen({ bad: 'not-a-schema', empty: { type: 'object' } })).toEqual({ empty: {} });
  });

  it('falls back to an empty document for null definitions', () => {
    expect(generateParams(null)).toBe('{}');
  });

  it('falls back to an empty document for malformed or property-less schemas', () => {
    expect(generateParams('{{{ bad')).toBe('{}');
    expect(generateParams('- a\n- b')).toBe('{}');
    expect(generateParams(JSON.stringify({ type: 'object' }))).toBe('{}');
  });

  it('caps generation depth on a pathologically nested schema', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 40; i += 1) {
      schema = { type: 'object', properties: { a: schema } };
    }
    expect(() => generateParams(defs({ root: schema }))).not.toThrow();
  });

  it('passes the format hint, key path, and locale to the synth', () => {
    const seen: SynthSpec[] = [];
    const synth: ValueSynth = (spec) => {
      seen.push(spec);
      return 'v';
    };
    generateParams(
      defs({
        contact: { type: 'object', properties: { email: { type: 'string', format: 'email' } } },
      }),
      synth,
      'ja-JP',
    );
    const emailSpec = seen.find((s) => s.format === 'email');
    expect(emailSpec?.keyPath).toBe('contact.email');
    expect(emailSpec?.locale).toBe('ja-JP');
  });

  it('falls back to the baseline synth for a field whose synth throws', () => {
    const synth: ValueSynth = (spec) => {
      if (spec.keyPath === 'a') {
        throw new Error('boom');
      }
      return 'ok';
    };
    const out = gen({ a: { type: 'string' }, b: { type: 'string' } }, synth);
    expect(out.a).toBe(
      baselineSynth({ type: 'string', keyPath: 'a', locale: 'en', constraints: {} }),
    );
    expect(out.b).toBe('ok');
  });

  it('returns the lower bound when the range is contradictory', () => {
    const mid: ValueSynth = () => 50;
    expect(gen({ x: { type: 'number', minimum: 100, maximum: 0 } }, mid).x).toBe(100);
  });

  it('bounds a pathologically long enum before picking', () => {
    const big = Array.from({ length: 400 }, (_, i) => `v${i}`);
    const out = gen({ pick: { type: 'string', enum: big } });
    expect(big.slice(0, 256)).toContain(out.pick);
  });
});

describe('fillMissingParams', () => {
  it('adds only the missing top-level keys, keeping existing values', () => {
    const out = JSON.parse(
      fillMissingParams(
        '{"a":"kept"}',
        defs({ a: { type: 'string', example: 'other' }, b: { type: 'string', example: 'new' } }),
      ),
    );
    expect(out.a).toBe('kept');
    expect(out.b).toBe('new');
  });

  it('fills a blank document fully and tolerates invalid params', () => {
    expect(
      JSON.parse(fillMissingParams('{}', defs({ a: { type: 'string', example: 'x' } }))).a,
    ).toBe('x');
    expect(
      JSON.parse(fillMissingParams('nope', defs({ a: { type: 'string', example: 'x' } }))).a,
    ).toBe('x');
  });
});

describe('missingParamKeys', () => {
  it('reports the schema keys absent from the params', () => {
    const schema = defs({ a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } });
    expect(missingParamKeys('{"a":"x"}', schema)).toEqual(['b', 'c']);
  });

  it('is empty when every top-level key is present', () => {
    const schema = defs({ a: { type: 'string' }, b: { type: 'string' } });
    expect(missingParamKeys('{"a":1,"b":2}', schema)).toEqual([]);
  });

  it('treats invalid params as fully missing', () => {
    expect(missingParamKeys('not json', defs({ a: { type: 'string' } }))).toEqual(['a']);
  });

  it('is empty for null, malformed, or property-less definitions', () => {
    expect(missingParamKeys('{"a":1}', null)).toEqual([]);
    expect(missingParamKeys('{"a":1}', '{{ not yaml')).toEqual([]);
    expect(missingParamKeys('{}', defs({}))).toEqual([]);
    // A schema with NO `properties` key, and a non-object schema root.
    expect(missingParamKeys('{"a":1}', 'type: object\n')).toEqual([]);
    expect(missingParamKeys('{"a":1}', '42')).toEqual([]);
  });

  it('does not count a prototype key as present (proto-safe)', () => {
    // The schema declares `a`; a params doc whose ONLY own key is unrelated must
    // still report `a` missing — a prototype `a` must never mask it.
    const schema = defs({ toString: { type: 'string' } });
    // `toString` exists on Object.prototype; the own-key check must still flag it.
    expect(missingParamKeys('{}', schema)).toEqual(['toString']);
  });
});

describe('extendParams', () => {
  it('adds an array of rows under a fresh key, keeping other subtrees intact', () => {
    const result = extendParams('{"a":1}', 'items', {
      type: 'array',
      minItems: 2,
      items: { type: 'object', properties: { name: { type: 'string', example: 'x' } } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      expect(parsed.a).toBe(1);
      expect(parsed.items).toEqual([{ name: 'x' }, { name: 'x' }]);
    }
  });

  it('refuses an existing key without changing the text', () => {
    expect(extendParams('{"a":1}', 'a', { type: 'string' })).toEqual({
      ok: false,
      reason: 'key_exists',
    });
  });

  it('refuses invalid params', () => {
    expect(extendParams('nope', 'k', { type: 'string' })).toEqual({
      ok: false,
      reason: 'invalid_params',
    });
  });

  it('treats prototype names as ordinary keys (own-property check, inert data)', () => {
    // Literal JSON string — an object literal `{ __proto__: … }` in test
    // source would set the prototype and exercise nothing.
    expect(extendParams('{"__proto__": {"x": 1}}', '__proto__', { type: 'string' })).toEqual({
      ok: false,
      reason: 'key_exists',
    });
    const fresh = extendParams('{}', '__proto__', { type: 'string' });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      const root = JSON.parse(fresh.text) as Record<string, unknown>;
      expect(Object.keys(root)).toEqual(['__proto__']);
      expect(Object.getPrototypeOf(root)).toBe(Object.prototype);
    }
  });
});

describe('extendParamsValue', () => {
  it('adds an explicit value under a fresh key, keeping other subtrees intact', () => {
    const rows = [
      { name: 'a', qty: 1 },
      { name: 'b', qty: 2 },
    ];
    const result = extendParamsValue('{"a":1}', 'table', rows);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.text);
      expect(parsed.a).toBe(1);
      expect(parsed.table).toEqual(rows); // verbatim, not synth-generated
    }
  });

  it('refuses an existing key and invalid params', () => {
    expect(extendParamsValue('{"a":1}', 'a', [])).toEqual({ ok: false, reason: 'key_exists' });
    expect(extendParamsValue('nope', 'k', [])).toEqual({ ok: false, reason: 'invalid_params' });
  });
});
