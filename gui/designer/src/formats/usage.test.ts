import { describe, expect, it } from 'vitest';
import { readDefinitionsView } from '../palette/model';
import { MAX_USAGE_NODES } from '../styles/usage';
import { MAX_TEXT_EXPRS } from '../text/interpolate';
import { buildFormatUsage } from './usage';

const doc = (...lines: string[]) => `${lines.join('\n')}\n`;

/** The definitions the type filter resolves against: one dated field, one
 * currency field and one plain string at document scope, plus a row-scoped
 * pair inside an array source. */
const DEFS = readDefinitionsView(
  doc(
    'type: object',
    'properties:',
    '  order:',
    '    type: object',
    '    properties:',
    '      when: { type: string, format: date }',
    '      total: { type: number, format: currency }',
    '      note: { type: string }',
    '  lines:',
    '    type: array',
    '    items:',
    '      type: object',
    '      properties:',
    '        shipped: { type: string, format: date }',
    '        price: { type: number, format: currency }',
  ),
);

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

  it('files a `defaults.formats.<type>` name ONLY for the dated slots', () => {
    // REWRITTEN: this case used to assert that `defaults.formats.currency:
    // symbol` filed a reference under `symbol`, which is the very bug GUI-24
    // fixes — the registry is date/datetime-kind only, so the currency slot
    // names the currency's builtin `symbol` variant and can never reach an
    // entry of that name. Renaming an entry called `symbol` used to rewrite
    // this line and silently change how money displayed.
    const usage = buildFormatUsage(BOUND);
    expect(usage?.refs.get('symbol')).toBeUndefined();
    expect(usage?.refs.get('closing')?.[2]).toEqual({
      keys: ['defaults', 'formats', 'date'],
      addressable: true,
    });
  });

  it('files a dated `defaults.formats.datetime` name too', () => {
    const usage = buildFormatUsage(
      doc('defaults:', '  formats:', '    datetime: received', 'sections:', '  body: {}'),
    );
    expect(usage?.refs.get('received')).toEqual([
      { keys: ['defaults', 'formats', 'datetime'], addressable: true },
    ]);
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

  it('resolves a hostile FIELD key without walking the prototype chain', () => {
    // The type filter looks a binding's key up in the definitions view. A
    // definitions file may legally declare a field called `constructor` or
    // `__proto__`; resolving one must not read `Object.prototype` and decide
    // the field exists (which would make it non-dated and DROP a real
    // reference — a silent half-rename).
    const hostile = readDefinitionsView(
      doc(
        'type: object',
        'properties:',
        '  __proto__: { type: string, format: date }',
        '  constructor: { type: number, format: currency }',
      ),
    );
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: a, data: { key: __proto__, format: closing } }',
        '      - { type: text, text: b, data: { key: constructor, format: symbol } }',
        '      - { type: text, text: c, data: { key: toString, format: closing } }',
      ),
      hostile,
    );
    // The dated one is a reference; the currency one is not; an inherited
    // member (`toString`) is NOT a declared field, so it stays unresolvable
    // and is recorded.
    expect(usage?.refs.get('closing')).toHaveLength(2);
    expect(usage?.refs.get('symbol')).toBeUndefined();
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

describe('buildFormatUsage — the dated-binding filter', () => {
  const SECTIONS = doc(
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: a, data: { key: order.when, format: closing } }',
    '      - { type: text, text: b, data: { key: order.total, format: symbol } }',
    '      - { type: text, text: c, data: { key: order.note, format: value } }',
    '      - { type: text, text: d, data: { key: nowhere.at.all, format: closing } }',
  );

  it('records a dated binding and DROPS a currency / string one', () => {
    const usage = buildFormatUsage(SECTIONS, DEFS);
    // `order.when` is a date → a reference. `nowhere.at.all` is not declared
    // → unresolvable → recorded (the fail-toward-today fallback).
    expect(usage?.refs.get('closing')?.map((ref) => ref.path)).toEqual([
      'sections.body.items[0].data',
      'sections.body.items[3].data',
    ]);
    // `format: symbol` on a currency field is the currency's builtin symbol
    // variant, and `format: value` on a string is the raw-value variant.
    expect(usage?.refs.get('symbol')).toBeUndefined();
    expect(usage?.refs.get('value')).toBeUndefined();
  });

  it('keeps recording EVERYTHING when there are no definitions', () => {
    // Preserved deliberately: with nothing to resolve against, over-recording
    // is today's behaviour and is visible, while under-recording would leave
    // a dangling reference the engine warns about.
    const usage = buildFormatUsage(SECTIONS);
    expect(usage?.refs.get('closing')).toHaveLength(2);
    expect(usage?.refs.get('symbol')).toHaveLength(1);
    expect(usage?.refs.get('value')).toHaveLength(1);
  });

  it('still rewrites a dated name that SHADOWS a locale-pack variant', () => {
    // `compact` is a pack date variant. A registry entry of that name
    // genuinely shadows it (`named.or(from_pack)`), so a reference to it from
    // a dated binding is real and MUST keep being rewritten — the filter must
    // never be read as "a builtin spelling is never a reference".
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: a, data: { key: order.when, format: compact } }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('compact')).toHaveLength(1);
  });

  it('resolves a ROW-scoped binding against the array group', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: lines }',
        '        columns:',
        '          - { data: { key: shipped, format: closing } }',
        '          - { data: { key: price, format: symbol } }',
        '          - cell:',
        '              items:',
        '                - { type: text, text: x, data: { key: shipped, format: closing } }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('closing')).toHaveLength(2);
    expect(usage?.refs.get('symbol')).toBeUndefined();
  });

  it('honours the `scope: document` escape out of a row scope', () => {
    // Inside the table the ambient scope is `lines`, where `order.total` does
    // not exist — without the escape it would read as unresolvable and be
    // recorded. With it, the currency field resolves and the ref is dropped.
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: lines }',
        '        columns:',
        '          - { data: { key: order.total, scope: document, format: symbol } }',
        '          - { data: { key: order.total, format: symbol } }',
      ),
      DEFS,
    );
    // Only the second (row-scoped, so unresolvable) one survives.
    expect(usage?.refs.get('symbol')).toHaveLength(1);
  });

  it('never reads a `page_number` format as a registry reference', () => {
    // `PageNumberItem.format` is the wire's one OTHER `format:` string — a
    // page-number template layout substitutes `{page}`/`{pages}` into, not a
    // name. Filing it put a junk key in the index, and a registry entry that
    // happened to share the spelling would have had the template rewritten
    // (or, on a delete, removed) out from under the page number.
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  footer:',
        '    items:',
        '      - { type: page_number, format: "{page} / {pages}" }',
        '      - { type: page_number, format: closing }',
      ),
      DEFS,
    );
    expect(usage?.refs.size).toBe(0);
  });

  it('records a `format:` on a binding carrying no key at all', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: a, data: { format: closing } }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('closing')).toHaveLength(1);
  });
});

describe('buildFormatUsage — chip references in interpolated text', () => {
  it('records `{key:format}` and filters it by the SAME dated rule', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: "Due {order.when:closing} — {order.total:symbol}" }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('closing')).toEqual([
      {
        path: 'sections.body.items[0]',
        keys: ['text'],
        addressable: true,
        text: 'Due {order.when:closing} — {order.total:symbol}',
      },
    ]);
    expect(usage?.refs.get('symbol')).toBeUndefined();
  });

  it('records one reference per NAME however often it appears in the string', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: "{order.when:closing}/{order.when:closing}" }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('closing')).toHaveLength(1);
  });

  it('resolves a chip through the item DECLARATION, scope escape included', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: lines }',
        '        item:',
        '          items:',
        '            - type: text',
        '              text: "{paid:closing} {amount:symbol}"',
        '              bindings:',
        '                paid: { key: order.when, scope: document }',
        '                amount: { key: order.total, scope: document }',
      ),
      DEFS,
    );
    // `paid` declares a DATE field at document scope → a reference;
    // `amount` declares the currency field → not one.
    expect(usage?.refs.get('closing')).toHaveLength(1);
    expect(usage?.refs.get('symbol')).toBeUndefined();
  });

  it('scans every interpolated carrier, not just `text:`', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: "a"',
        '        link: { url: "https://x.test/{order.when:closing}" }',
        '        spans:',
        '          - { text: "{order.when:closing}" }',
        '      - type: table',
        '        data: { key: lines }',
        '        columns:',
        '          - { label: "{order.when:closing}" }',
      ),
      DEFS,
    );
    expect(usage?.refs.get('closing')?.map((ref) => ref.keys)).toEqual([
      ['url'],
      ['text'],
      ['label'],
    ]);
  });

  it('scans the `document:` metadata block, which is interpolated too', () => {
    const usage = buildFormatUsage(
      doc('document:', '  title: "Invoice {order.when:closing}"', 'sections:', '  body: {}'),
      DEFS,
    );
    expect(usage?.refs.get('closing')).toEqual([
      {
        path: 'document',
        keys: ['title'],
        addressable: true,
        text: 'Invoice {order.when:closing}',
      },
    ]);
  });

  it('records a chip in an ARRAY ELEMENT as NON-addressable — no key to drill', () => {
    // `document.keywords` is a list of strings, so there is no `keys` drill
    // that addresses one. Recording it non-addressable makes the rewrite
    // refuse WHOLE rather than half-apply and leave a dangling name.
    const usage = buildFormatUsage(
      doc('document:', '  keywords: ["{order.when:closing}"]', 'sections:', '  body: {}'),
      DEFS,
    );
    expect(usage?.refs.get('closing')?.[0].addressable).toBe(false);
  });

  it('marks the whole index TRUNCATED when a text saturates the expression cap', () => {
    // Past `MAX_TEXT_EXPRS` the GUI reads further expressions as literals
    // while the engine keeps interpolating them. Flagging only the refs it
    // DID see is not enough: a reference sitting entirely beyond the cap is
    // never recorded, so there is nothing for an addressability check to
    // refuse and the rename would half-apply silently. `truncated` is the
    // index-wide "I did not see everything" flag rename/delete already
    // stand down on.
    const text = Array.from({ length: MAX_TEXT_EXPRS + 1 }, () => '{order.when:closing}').join('');
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        `      - { type: text, text: "${text}" }`,
      ),
      DEFS,
    );
    expect(usage?.truncated).toBe(true);
  });

  it('does NOT truncate on a text just UNDER the cap', () => {
    const text = Array.from({ length: MAX_TEXT_EXPRS - 1 }, () => '{order.when:closing}').join('');
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        `      - { type: text, text: "${text}" }`,
      ),
      DEFS,
    );
    expect(usage?.truncated).toBe(false);
    expect(usage?.refs.get('closing')?.[0].addressable).toBe(true);
  });

  it('stops scanning strings once the node budget runs out', () => {
    // The budget has to bound the TEXT scan too, not only the map walk — a
    // hostile document made of nothing but strings would otherwise walk
    // unbounded, and a partial index must report itself as truncated so the
    // rewrite refuses rather than half-applying.
    const keys = Array.from(
      { length: MAX_USAGE_NODES + 8 },
      (_, n) => `  k${n}: "{order.when:closing}"`,
    );
    const usage = buildFormatUsage(doc('sections:', ...keys), DEFS);
    expect(usage?.truncated).toBe(true);
    expect(usage?.refs.get('closing')).toHaveLength(MAX_USAGE_NODES - 1);
  });

  it('does NOT drop a chip whose name is dated at ANOTHER plausible scope', () => {
    // Two positions where the engine resolves an interpolated name against a
    // DIFFERENT (key, scope) pair than the walk's structural reading:
    //   A. a `list`'s per-entry `text:` resolves against the array ENTRY;
    //   B. a table column's `label:` resolves at DOCUMENT scope with an EMPTY
    //      declaration map (`layout/engine/table.rs` `header_label`).
    // Where one field NAME exists at both scopes with different types, betting
    // on one reading DROPS a live reference — the under-rewrite failure the
    // whole rule exists to avoid. Both cases were reproduced dropping before
    // the candidate-set rule landed.
    const bothScopes = readDefinitionsView(
      doc(
        'type: object',
        'properties:',
        '  when: { type: number, format: currency }',
        '  orders:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        when: { type: string, format: date }',
      ),
    );
    const listCase = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: list, data: { key: orders }, text: "{when:closing}" }',
      ),
      bothScopes,
    );
    expect(listCase?.refs.get('closing')).toHaveLength(1);

    // B, with the types the other way round: dated at DOCUMENT scope (what a
    // header label reads) and non-dated where the walk would look.
    const documentDated = readDefinitionsView(
      doc(
        'type: object',
        'properties:',
        '  when: { type: string, format: date }',
        '  orders:',
        '    type: array',
        '    items:',
        '      type: object',
        '      properties:',
        '        when: { type: number, format: currency }',
      ),
    );
    const labelCase = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: orders }',
        '        bindings:',
        '          when: { key: when }',
        '        columns:',
        '          - { label: "{when:closing}" }',
      ),
      documentDated,
    );
    expect(labelCase?.refs.get('closing')).toHaveLength(1);
  });

  it('STILL drops a chip that is non-dated at every scope it could resolve at', () => {
    // The candidate-set rule must not degrade into "record everything": a name
    // that resolves, and resolves non-dated wherever it resolves, is dropped.
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: lines }',
        '        columns:',
        '          - { cell: { items: [ { type: text, text: "{price:symbol}" } ] } }',
        '      - { type: text, text: "{order.total:symbol}" }',
      ),
      DEFS,
    );
    // `price` resolves only inside `lines` (currency); `order.total` only at
    // document scope (currency). Neither is dated anywhere.
    expect(usage?.refs.get('symbol')).toBeUndefined();
  });

  it('ignores a bare `{key}` with no format, and text with no expression', () => {
    const usage = buildFormatUsage(
      doc(
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: text, text: "{order.when} plain {{escaped}}" }',
      ),
      DEFS,
    );
    expect(usage?.refs.size).toBe(0);
  });
});
