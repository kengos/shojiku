import { describe, expect, it } from 'vitest';
import { MAX_USAGE_NODES } from '../styles/usage';
import { buildFormatUsage } from './usage';

const doc = (...lines: string[]) => `${lines.join('\n')}\n`;

const BOUND = doc(
  'formats:',
  '  closing: { type: date, pattern: "yyyy.MM.dd" }',
  'defaults:',
  '  formats:',
  '    date: closing',
  '    currency: symbol',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: "{when}"',
  '        data: { key: when, format: closing }',
  '      - type: text',
  '        text: "{a}"',
  '        bindings:',
  '          a: { key: a, format: closing }',
);

describe('buildFormatUsage', () => {
  it('finds a binding format under `data` AND under `bindings.<name>`', () => {
    const usage = buildFormatUsage(BOUND);
    const refs = usage?.refs.get('closing') ?? [];
    // Three: the two bindings plus `defaults.formats.date`.
    expect(refs).toHaveLength(3);
    expect(refs.map((ref) => ref.path)).toEqual([
      'sections.body.items[0].data',
      'sections.body.items[1].bindings.a',
      undefined,
    ]);
    expect(refs.map((ref) => ref.keys)).toEqual([
      ['format'],
      ['format'],
      ['defaults', 'formats', 'date'],
    ]);
  });

  it('files a `defaults.formats.<type>` name under that name, root-addressed', () => {
    const refs = buildFormatUsage(BOUND)?.refs.get('symbol') ?? [];
    expect(refs).toEqual([{ keys: ['defaults', 'formats', 'currency'], addressable: true }]);
  });

  it('skips an inline `{ pattern }` default — a definition, not a reference', () => {
    const usage = buildFormatUsage(
      doc(
        'defaults:',
        '  formats:',
        '    date: { pattern: "yyyy" }',
        'sections:',
        '  body: { type: absolute }',
      ),
    );
    expect(usage?.refs.size).toBe(0);
    expect(usage?.truncated).toBe(false);
  });

  it('records nothing for an empty or non-string format', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: a, data: { key: a, format: "" } }',
        '      - { type: text, text: b, data: { key: b, format: 7 } }',
      ),
    );
    expect(usage?.refs.size).toBe(0);
  });

  it('files a hostile name in a real Map, never on a prototype', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: a, data: { key: a, format: "__proto__" } }',
      ),
    );
    expect(usage?.refs.get('__proto__')).toHaveLength(1);
    // The index is a Map, so nothing was written onto Object.prototype.
    expect(({} as Record<string, unknown>).format).toBeUndefined();
  });

  it('flags a reference reached through a hostile map key as non-addressable', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: a',
        '        bindings:',
        '          "a.b": { key: a, format: closing }',
      ),
    );
    expect(usage?.refs.get('closing')?.[0].addressable).toBe(false);
  });

  it('keeps a reference non-addressable BELOW the hostile key, not only at it', () => {
    // The hostile key decides the level it names; the verdict has to be
    // INHERITED down the rest of the walk. With the reference sitting two
    // levels under the bad segment, `SAFE_SEGMENT.test(key)` is true for
    // every key the walk still sees, so only the carried-down operand can
    // say no. Without it the rename would emit a `setScalar` against a path
    // that does not round-trip, rewriting a different node instead of
    // refusing the operation whole.
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        "bad key":',
        '          columns:',
        '            - { key: x, format: closing }',
      ),
    );
    expect(usage?.refs.get('closing')?.[0].addressable).toBe(false);
  });

  it('sets truncated when the node budget runs out', () => {
    const items = Array.from(
      { length: MAX_USAGE_NODES },
      (_, n) => `      - { type: text, text: t${n} }`,
    );
    const usage = buildFormatUsage(
      doc('sections:', '  body:', '    type: flow', '    items:', ...items),
    );
    expect(usage?.truncated).toBe(true);
  });

  it('returns null only when the text does not materialize to a map', () => {
    expect(buildFormatUsage('- a\n- b\n')).toBeNull();
    expect(buildFormatUsage('sections: [\n')).toBeNull();
    // A valid document with no references is an EMPTY index, not null.
    const empty = buildFormatUsage(doc('sections:', '  body: { type: absolute }'));
    expect(empty?.refs.size).toBe(0);
  });

  it('ignores a `defaults` that is not a map, and a `formats` that is not one', () => {
    expect(buildFormatUsage(doc('defaults: nope', 'sections:', '  body: {}'))?.refs.size).toBe(0);
    expect(
      buildFormatUsage(doc('defaults:', '  formats: nope', 'sections:', '  body: {}'))?.refs.size,
    ).toBe(0);
  });
});
