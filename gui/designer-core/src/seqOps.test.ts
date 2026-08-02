// Tests for seqOps.ts — the four sequence ops (moveItem / duplicateItem /
// insertItem / removeItem), exercised through `applyOp` (the ONE public
// entry). The snippet.ts shape refusals as an op sees them (caps, cycles,
// exotic objects, __proto__ inertness) and the opCreate.ts deferred
// sequence auto-create are pinned here too.
import { describe, expect, it } from 'vitest';
import { parseTemplate } from './document';
import { applyOp, MAX_SNIPPET_DEPTH, MAX_SNIPPET_NODES, type Op, type SnippetValue } from './ops';

// A realistic template with comments, nested maps, a flow-item sequence, and
// mixed flow/block styles — the round-trip subject. It is written in the
// `eemeli/yaml` canonical form (a fixed point of parse -> toString, e.g. the
// `[ heading ]` inner spacing the library emits), so an op that touches one key
// leaves every other byte identical.
const FIXTURE = [
  'version: 0.1.0',
  'name: receipt',
  '# Presentation defaults',
  'defaults:',
  '  locale: ja-JP',
  '  currency: JPY',
  'styles:',
  '  heading:',
  '    fontSize: 24 # title size',
  '    textAlign: center',
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: 領収書',
  '        styleNames: [ heading ]',
  '      - type: text',
  '        data: { key: customerName }',
  '      - type: rect',
  '        box: { x: 0, y: 100, w: 200, h: 40 }',
  '',
].join('\n');

function apply(source: string, op: Op): string {
  const doc = parseTemplate(source);
  const result = applyOp(doc, op);
  expect(result.ok).toBe(true);
  return String(doc);
}

describe('moveItem', () => {
  it('reorders a flow item, preserving each item verbatim', () => {
    const out = apply(FIXTURE, { op: 'moveItem', path: 'sections.body.items', from: 0, to: 2 });
    const items = parseTemplate(out).toJS().sections.body.items;
    expect(items.map((i: { type: string }) => i.type)).toEqual(['text', 'rect', 'text']);
    expect(out).toContain('styleNames: [ heading ]');
  });

  it('fails when the from index is out of range', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'sections.body.items', from: 9, to: 0 });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when the to index is out of range', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'sections.body.items', from: 0, to: 9 });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
  });

  it('fails when the from index is negative', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'sections.body.items', from: -1, to: 0 });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
  });

  it('fails when an index is not an integer', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'sections.body.items', from: 1.5, to: 0 });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
  });

  it('fails when the path is not a sequence', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'defaults', from: 0, to: 0 });
    expect(result.ok === false && result.error.code).toBe('not_a_seq');
  });

  it('fails when the sequence path does not resolve', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'moveItem', path: 'nope', from: 0, to: 0 });
    expect(result.ok === false && result.error.code).toBe('path_not_found');
  });
});

describe('duplicateItem', () => {
  it('inserts a copy after the source and leaves existing items unchanged', () => {
    const out = apply(FIXTURE, { op: 'duplicateItem', path: 'sections.body.items', index: 2 });
    const items = parseTemplate(out).toJS().sections.body.items;
    expect(items).toHaveLength(4);
    expect(items[2]).toEqual(items[3]);
    expect(out).toContain('styleNames: [ heading ]');
  });

  it('fails when the index is out of range', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'duplicateItem', path: 'sections.body.items', index: 9 });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when the path is not a sequence', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'duplicateItem', path: 'defaults', index: 0 });
    expect(result.ok === false && result.error.code).toBe('not_a_seq');
  });

  it('copies an alias as an alias instead of expanding it (bomb-safe)', () => {
    // The item under items[0] references the anchored style map; duplicating it
    // must keep the `*base` alias node rather than materializing the subtree
    // (which is what an alias bomb would exploit).
    const doc = parseTemplate(
      ['shared: &base { fontSize: 10 }', 'items:', '  - style: *base', ''].join('\n'),
    );
    const result = applyOp(doc, { op: 'duplicateItem', path: 'items', index: 0 });
    expect(result.ok).toBe(true);
    const out = String(doc);
    expect(out.match(/\*base/g)).toHaveLength(2);
    expect(out.match(/fontSize: 10/g)).toHaveLength(1);
  });
});

describe('insertItem', () => {
  const TEXT_SNIPPET = { type: 'text', text: 'テキスト' };

  it('appends at index == length and leaves existing items byte-identical', () => {
    const out = apply(FIXTURE, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 3,
      value: TEXT_SNIPPET,
    });
    const items = parseTemplate(out).toJS().sections.body.items;
    expect(items).toHaveLength(4);
    expect(items[3]).toEqual(TEXT_SNIPPET);
    expect(out).toContain('styleNames: [ heading ]');
    expect(out).toContain('fontSize: 24 # title size');
  });

  it('inserts at index 0 and at a middle index', () => {
    const first = parseTemplate(
      apply(FIXTURE, {
        op: 'insertItem',
        path: 'sections.body.items',
        index: 0,
        value: TEXT_SNIPPET,
      }),
    ).toJS().sections.body.items;
    expect(first[0]).toEqual(TEXT_SNIPPET);
    expect(first).toHaveLength(4);
    const middle = parseTemplate(
      apply(FIXTURE, {
        op: 'insertItem',
        path: 'sections.body.items',
        index: 1,
        value: TEXT_SNIPPET,
      }),
    ).toJS().sections.body.items;
    expect(middle[1]).toEqual(TEXT_SNIPPET);
  });

  it('inserts a nested snippet (box map + style) into a nested items sequence', () => {
    const doc = parseTemplate(
      [
        'sections:',
        '  body:',
        '    items:',
        '      - type: container',
        '        items: []',
        '',
      ].join('\n'),
    );
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items[0].items',
      index: 0,
      value: { type: 'rect', box: { w: 120, h: 60 }, style: { borderWidth: 1 } },
    });
    expect(result.ok).toBe(true);
    const rect = parseTemplate(String(doc)).toJS().sections.body.items[0].items[0];
    expect(rect).toEqual({ type: 'rect', box: { w: 120, h: 60 }, style: { borderWidth: 1 } });
  });

  it('inserts a snippet carrying an array value (styleNames list)', () => {
    const out = apply(FIXTURE, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 3,
      value: { type: 'text', text: 'x', styleNames: ['heading'] },
    });
    const item = parseTemplate(out).toJS().sections.body.items[3];
    expect(item).toEqual({ type: 'text', text: 'x', styleNames: ['heading'] });
  });

  it('serializes the inserted subtree at the canonical fixed point', () => {
    const out = apply(FIXTURE, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 3,
      value: { type: 'qr_code', box: { w: 60, h: 60 }, text: 'https://example.com' },
    });
    expect(String(parseTemplate(out))).toBe(out);
  });

  it('auto-creates a missing items sequence on an existing map (append at 0)', () => {
    const doc = parseTemplate(['sections:', '  body:', '    type: flow', ''].join('\n'));
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(result.ok).toBe(true);
    expect(parseTemplate(String(doc)).toJS().sections.body.items[0]).toEqual(TEXT_SNIPPET);
  });

  it('auto-creates a missing TOP-LEVEL sequence on the document root map', () => {
    const out = apply(FIXTURE, { op: 'insertItem', path: 'attachments', index: 0, value: 'a' });
    expect(parseTemplate(out).toJS().attachments).toEqual(['a']);
  });

  it('does NOT create the sequence when index validation fails (no partial edit)', () => {
    const source = ['sections:', '  body:', '    type: flow', ''].join('\n');
    const doc = parseTemplate(source);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 1,
      value: TEXT_SNIPPET,
    });
    expect(result.ok === false && result.error.code).toBe('index_out_of_range');
    expect(String(doc)).toBe(source);
  });

  it('fails path_not_found when the parent of the missing key is also missing', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.footer.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(result.ok === false && result.error.code).toBe('path_not_found');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails path_not_found when the final segment is an index into a missing node', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items[9]',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(result.ok === false && result.error.code).toBe('path_not_found');
  });

  it('fails not_a_map when the missing key sits on a scalar parent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'name.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('fails not_a_seq when the path resolves to a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'defaults',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(result.ok === false && result.error.code).toBe('not_a_seq');
  });

  it('fails when the index is past the end, negative, or not an integer', () => {
    const doc = parseTemplate(FIXTURE);
    for (const index of [4, -1, 0.5, Number.NaN]) {
      const result = applyOp(doc, {
        op: 'insertItem',
        path: 'sections.body.items',
        index,
        value: TEXT_SNIPPET,
      });
      expect(result.ok === false && result.error.code).toBe('index_out_of_range');
    }
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a snippet deeper than the cap without touching the document', () => {
    let value: SnippetValue = 'leaf';
    for (let i = 0; i <= MAX_SNIPPET_DEPTH; i++) {
      value = { nested: value };
    }
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'insertItem', path: 'sections.body.items', index: 0, value });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a snippet over the node budget', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: Array.from({ length: MAX_SNIPPET_NODES + 1 }, () => 'x'),
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a CYCLIC snippet without hanging (depth bound terminates it)', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: cycle as SnippetValue,
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects non-finite numbers, null, undefined, and non-data leaves', () => {
    const doc = parseTemplate(FIXTURE);
    const hostile = [
      { size: Number.POSITIVE_INFINITY },
      { text: null },
      { text: undefined },
      { text: Symbol('x') },
      { text: 10n },
    ];
    for (const value of hostile) {
      const result = applyOp(doc, {
        op: 'insertItem',
        path: 'sections.body.items',
        index: 0,
        value: value as unknown as SnippetValue,
      });
      expect(result.ok === false && result.error.code).toBe('invalid_value');
    }
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a non-plain-object map (class instance) in the snippet', () => {
    class Sneaky {
      type = 'text';
    }
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: new Sneaky() as unknown as SnippetValue,
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('accepts a null-prototype map (JSON-equivalent plain data)', () => {
    const bare = Object.create(null) as Record<string, SnippetValue>;
    bare.type = 'text';
    bare.text = 'x';
    const out = apply(FIXTURE, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 3,
      value: bare,
    });
    expect(parseTemplate(out).toJS().sections.body.items[3]).toEqual({ type: 'text', text: 'x' });
  });

  it('treats JSON __proto__ and constructor keys as data, never polluting prototypes', () => {
    const hostile = JSON.parse(
      '{"type": "text", "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}',
    );
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: hostile,
    });
    // Whether the keys round-trip as data or are dropped, the prototype chain
    // must stay clean — that is the load-bearing assertion.
    expect(result.ok).toBe(true);
    expect({} as { polluted?: boolean }).not.toHaveProperty('polluted');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});

describe('insertItem block-style first insert', () => {
  const TEXT_SNIPPET = { type: 'text', text: 'テキスト' };

  it('converts an authored empty flow sequence to block style on the first insert', () => {
    const out = apply(['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'), {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    // Block form: the item lands under `items:` as a `- ` entry, not `[ … ]`.
    expect(out).toContain('items:\n      - type: text');
    expect(out).not.toContain('items: [');
    expect(parseTemplate(out).toJS().sections.body.items[0]).toEqual(TEXT_SNIPPET);
  });

  it('is serialize-fixed-point after the first block insert', () => {
    const out = apply(['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'), {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(String(parseTemplate(out))).toBe(out);
  });

  it('authors block style when the items sequence is auto-created (was missing)', () => {
    const out = apply(['sections:', '  body:', '    type: flow', ''].join('\n'), {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(out).toContain('items:\n      - type: text');
    expect(out).not.toContain('items: [');
  });

  it('keeps a NON-empty flow sequence in flow form when inserting a second item', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: [ { type: text, text: a } ]',
      '',
    ].join('\n');
    const out = apply(source, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 1,
      value: { type: 'text', text: 'b' },
    });
    // The authored flow form is preserved — only touched keys change.
    expect(out).toContain('items: [');
    expect(parseTemplate(out).toJS().sections.body.items).toHaveLength(2);
  });

  it('authors block style again after removing back to empty and re-inserting', () => {
    const doc = parseTemplate(
      ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n'),
    );
    const first = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(first.ok).toBe(true);
    const removed = applyOp(doc, { op: 'removeItem', path: 'sections.body.items', index: 0 });
    expect(removed.ok).toBe(true);
    const again = applyOp(doc, {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: TEXT_SNIPPET,
    });
    expect(again.ok).toBe(true);
    expect(String(doc)).toContain('items:\n      - type: text');
  });
});

describe('removeItem', () => {
  it('removes a middle item, preserving the others byte-for-byte', () => {
    const out = apply(FIXTURE, { op: 'removeItem', path: 'sections.body.items', index: 1 });
    const items = parseTemplate(out).toJS().sections.body.items;
    expect(items).toHaveLength(2);
    expect(items.map((i: { type: string }) => i.type)).toEqual(['text', 'rect']);
    expect(out).toContain('styleNames: [ heading ]');
  });

  it('removes the first and the last item', () => {
    const first = parseTemplate(
      apply(FIXTURE, { op: 'removeItem', path: 'sections.body.items', index: 0 }),
    ).toJS().sections.body.items;
    expect(first.map((i: { type: string }) => i.type)).toEqual(['text', 'rect']);
    const last = parseTemplate(
      apply(FIXTURE, { op: 'removeItem', path: 'sections.body.items', index: 2 }),
    ).toJS().sections.body.items;
    expect(last.map((i: { type: string }) => i.type)).toEqual(['text', 'text']);
  });

  it('keeps an emptied sequence in place rather than pruning it', () => {
    const doc = parseTemplate(['items:', '  - type: text', '    text: x', ''].join('\n'));
    const result = applyOp(doc, { op: 'removeItem', path: 'items', index: 0 });
    expect(result.ok).toBe(true);
    expect(String(doc)).toBe('items: []\n');
  });

  it('fails when the index is out of range, negative, or not an integer', () => {
    const doc = parseTemplate(FIXTURE);
    for (const index of [3, -1, 1.5]) {
      const result = applyOp(doc, { op: 'removeItem', path: 'sections.body.items', index });
      expect(result.ok === false && result.error.code).toBe('index_out_of_range');
    }
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when the path is not a sequence', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeItem', path: 'defaults', index: 0 });
    expect(result.ok === false && result.error.code).toBe('not_a_seq');
  });

  it('fails when the sequence path does not resolve', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeItem', path: 'nope', index: 0 });
    expect(result.ok === false && result.error.code).toBe('path_not_found');
  });
});
