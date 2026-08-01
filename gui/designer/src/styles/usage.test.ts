import { describe, expect, it } from 'vitest';
import { buildStyleUsage, MAX_USAGE_DEPTH, MAX_USAGE_NODES, type StyleRef } from './usage';

/** The set of `{ path, key }` locations a name is referenced at — the
 * op-addressable identity of each ref, name list dropped for comparison. */
function refLocations(refs: readonly StyleRef[] | undefined): string[] {
  return (refs ?? []).map((ref) => `${ref.path}#${ref.key}`).sort();
}

/** A template exercising every wire position the engine's own style-name check
 * visits: item, span, mark, table (own / row / row alternate / header / column
 * / column cell + its items), container / repeat cell / repeat_flow descent,
 * and both the header and footer sections. */
const ALL_POSITIONS = `
styles:
  a: { fontWeight: bold }
sections:
  header:
    type: flow
    items:
      - { type: text, text: H, styleNames: [a] }
  body:
    type: flow
    items:
      - type: text
        text: hi
        styleNames: [a]
        spans:
          - { text: s, styleNames: [a] }
        mark: { shape: circle, styleNames: [a] }
      - type: container
        items:
          - { type: text, text: c, styleNames: [a] }
      - type: repeat
        data: { key: rows }
        cell:
          styleNames: [a]
          items:
            - { type: text, text: r, styleNames: [a] }
      - type: repeat_flow
        data: { key: cards }
        item:
          styleNames: [a]
          items:
            - { type: text, text: rf, styleNames: [a] }
      - type: table
        data: { key: lines }
        styleNames: [a]
        row: { styleNames: [a], alternateStyleNames: [a] }
        header: { styleNames: [a] }
        columns:
          - label: C1
            styleNames: [a]
            cell:
              styleNames: [a]
              items:
                - { type: text, text: cc, styleNames: [a] }
  footer:
    type: flow
    items:
      - { type: text, text: F, styleNames: [a] }
`;

describe('buildStyleUsage — position coverage', () => {
  it('finds a reference in every wire position across header/body/footer', () => {
    const usage = buildStyleUsage(ALL_POSITIONS);
    expect(usage).not.toBeNull();
    expect(usage?.truncated).toBe(false);
    // The table row's own `styleNames` and `alternateStyleNames` are BOTH keyed
    // at the row map's path, distinguished by the wire `key` — not a synthetic
    // `.alternate` display path (which a child map named `alternate` would clash
    // with). Every other position keys at the holding map's path.
    expect(refLocations(usage?.refs.get('a'))).toEqual(
      [
        'sections.header.items[0]#styleNames',
        'sections.body.items[0]#styleNames',
        'sections.body.items[0].spans[0]#styleNames',
        'sections.body.items[0].mark#styleNames',
        'sections.body.items[1].items[0]#styleNames',
        'sections.body.items[2].cell#styleNames',
        'sections.body.items[2].cell.items[0]#styleNames',
        'sections.body.items[3].item#styleNames',
        'sections.body.items[3].item.items[0]#styleNames',
        'sections.body.items[4]#styleNames',
        'sections.body.items[4].row#styleNames',
        'sections.body.items[4].row#alternateStyleNames',
        'sections.body.items[4].header#styleNames',
        'sections.body.items[4].columns[0]#styleNames',
        'sections.body.items[4].columns[0].cell#styleNames',
        'sections.body.items[4].columns[0].cell.items[0]#styleNames',
        'sections.footer.items[0]#styleNames',
      ].sort(),
    );
  });

  it('marks every reference addressable when the path is clean identifiers', () => {
    const usage = buildStyleUsage(ALL_POSITIONS);
    expect(usage?.refs.get('a')?.every((ref) => ref.addressable)).toBe(true);
  });

  it('indexes style usage in an image-bearing template past the 2 MiB default cap', () => {
    const bigSrc = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 1000)}`;
    const usage = buildStyleUsage(
      [
        'sections:',
        '  body:',
        '    items:',
        '      - type: text',
        '        text: hi',
        '        styleNames: [heading]',
        '      - type: image',
        '        box: { w: 10, h: 10 }',
        `        src: ${bigSrc}`,
        '',
      ].join('\n'),
    );
    expect(usage).not.toBeNull();
    expect(usage?.refs.get('heading')).toHaveLength(1);
  });

  it('flags a reference reached through a hostile map key as non-addressable', () => {
    // A key containing a `.` re-splits into two path segments (silently
    // ambiguous — parsePath would NOT throw); a key containing `[` is
    // unparseable. Both make the ref non-addressable so a rewrite refuses.
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - type: container
        "ev.il":
          styleNames: [dotted]
        "br[k":
          styleNames: [bracketed]
`);
    expect(usage?.refs.get('dotted')?.[0]?.addressable).toBe(false);
    expect(usage?.refs.get('bracketed')?.[0]?.addressable).toBe(false);
  });

  it('keeps an alternate-named child map distinct from a row alternate slot', () => {
    // A regression pin for the old synthesized `${path}.alternate` ambiguity: a
    // map under a key literally named `alternate` that carries `styleNames`
    // records at `…alternate#styleNames`, NOT collapsed with a row's
    // `alternateStyleNames` (which records at the row path `#alternateStyleNames`).
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - type: text
        text: hi
        alternate: { styleNames: [x] }
`);
    expect(refLocations(usage?.refs.get('x'))).toEqual([
      'sections.body.items[0].alternate#styleNames',
    ]);
  });

  it('aggregates a name used by several items (count = refs.length)', () => {
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - { type: text, text: one, styleNames: [shared] }
      - { type: text, text: two, styleNames: [shared] }
      - { type: text, text: three, styleNames: [shared, solo] }
`);
    expect(usage?.refs.get('shared')?.length).toBe(3);
    expect(usage?.refs.get('solo')?.length).toBe(1);
    // The three-name ref carries the full array so a rename can restate it.
    expect(usage?.refs.get('solo')?.[0]?.names).toEqual(['shared', 'solo']);
  });
});

describe('buildStyleUsage — hostile / degenerate input', () => {
  it('returns null on malformed YAML', () => {
    expect(buildStyleUsage(': : : not yaml : :')).toBeNull();
  });

  it('returns null when the document root is not a map', () => {
    expect(buildStyleUsage('42')).toBeNull();
    expect(buildStyleUsage('- a\n- b')).toBeNull();
  });

  it('returns null on an alias bomb (materialization cap trips)', () => {
    const bomb = `
a: &a [x, x, x, x, x, x, x, x, x, x]
b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]
c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]
d: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]
e: [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]
`;
    expect(buildStyleUsage(bomb)).toBeNull();
  });

  it('flags truncated and bounds deep nesting without throwing (over the depth cap)', () => {
    // Nest containers past MAX_USAGE_DEPTH — the walk stops, never recurses
    // unbounded, sets `truncated`, and returns a Map (best effort), not a throw.
    let inner = '{ type: text, text: deep, styleNames: [deep] }';
    for (let i = 0; i < MAX_USAGE_DEPTH + 4; i++) {
      inner = `{ type: container, items: [${inner}] }`;
    }
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - ${inner}
`);
    expect(usage).not.toBeNull();
    expect(usage?.truncated).toBe(true);
    // The deeply-buried reference is beyond the cap — not counted, no crash.
    expect(usage?.refs.get('deep')).toBeUndefined();
  });

  it('flags truncated and bounds a huge flat document at the node budget', () => {
    const items = Array.from(
      { length: MAX_USAGE_NODES + 50 },
      () => '      - { type: text, text: x, styleNames: [wide] }',
    ).join('\n');
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
${items}
`);
    expect(usage).not.toBeNull();
    expect(usage?.truncated).toBe(true);
    // Some references land past the budget; the count is bounded, not infinite.
    expect(usage?.refs.get('wide')?.length ?? 0).toBeLessThan(MAX_USAGE_NODES + 50);
  });

  it('skips non-string entries, an all-non-string array, and a non-array value', () => {
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - { type: text, text: a, styleNames: [ok, 3, true] }
      - { type: text, text: b, styleNames: "notalist" }
      - { type: text, text: c, styleNames: [1, 2] }
`);
    expect(usage?.refs.get('ok')?.length).toBe(1);
    // Only the string entry is carried on the ref.
    expect(usage?.refs.get('ok')?.[0]?.names).toEqual(['ok']);
    // The number/boolean entries are skipped, the string-valued styleNames on
    // the second item contributes nothing, and an array with NO string entries
    // records no reference at all.
    expect([...(usage?.refs.keys() ?? [])]).toEqual(['ok']);
  });

  it('counts a hostile style name via Map.get without polluting the prototype', () => {
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - { type: text, text: a, styleNames: ["__proto__", "constructor"] }
`);
    expect(usage?.refs.get('__proto__')?.length).toBe(1);
    expect(usage?.refs.get('constructor')?.length).toBe(1);
    // No prototype pollution from the walk.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('buildStyleUsage — valid but empty', () => {
  it('returns an empty Map (not null), untruncated, for a document with no references', () => {
    const usage = buildStyleUsage(`
sections:
  body:
    type: flow
    items:
      - { type: text, text: plain }
`);
    expect(usage).not.toBeNull();
    expect(usage?.refs.size).toBe(0);
    expect(usage?.truncated).toBe(false);
  });

  it('returns an empty Map for a valid document with no sections', () => {
    const usage = buildStyleUsage('page:\n  size: A4\n');
    expect(usage).not.toBeNull();
    expect(usage?.refs.size).toBe(0);
  });
});
