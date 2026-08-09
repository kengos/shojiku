import { describe, expect, it } from 'vitest';
import { readBindings } from './bindings';
import { buildUsage, fieldUsage } from './usage';

const TEMPLATE = [
  'sections:',
  '  header:',
  '    items:',
  '      - type: text',
  '        data: { key: receipt.number }',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        data: { key: receipt.number }',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            data: { key: receipt.issued_on }',
  '          - type: text',
  '            spans:',
  '              - { data: { key: recipient.name } }',
  '            mark:',
  '              data: { key: flags.circled }',
  '      - type: checkbox',
  '        box: { x: 0, y: 0 }',
  '        data: { key: flags.agreed }',
  '      - type: table',
  '        data: { key: items }',
  '        columns:',
  '          - label: 品名',
  '            data: { key: name }',
  '          - label: 数量',
  '            cell:',
  '              items:',
  '                - type: text',
  '                  data: { key: quantity }',
  '      - type: repeat',
  '        data: { key: tickets }',
  '        cell:',
  '          items:',
  '            - type: text',
  '              data: { key: seat }',
  '      - type: repeat_flow',
  '        data: { key: cards }',
  '        item:',
  '          items:',
  '            - type: text',
  '              data: { key: title }',
  '      - type: list',
  '        data: { key: tags }',
  '      - type: ellipse',
  '        box: { x: 0, y: 0, w: 10, h: 10 }',
  '        data: { key: flags.vip, equals: gold }',
  '',
].join('\n');

describe('readBindings', () => {
  it('collects bindings from an image-bearing template past the 2 MiB default cap', () => {
    const bigSrc = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 1000)}`;
    const bindings = readBindings(
      [
        'sections:',
        '  body:',
        '    items:',
        '      - type: text',
        '        data: { key: order.total }',
        '      - type: image',
        '        box: { w: 10, h: 10 }',
        `        src: ${bigSrc}`,
        '',
      ].join('\n'),
    );
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'order.total',
      scope: null,
      source: false,
    });
  });

  it('collects bindings with box-index paths, scopes, and source flags', () => {
    const bindings = readBindings(TEMPLATE);
    expect(bindings).toContainEqual({
      path: 'sections.header.items[0]',
      key: 'receipt.number',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'receipt.number',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[1].items[0]',
      key: 'receipt.issued_on',
      scope: null,
      source: false,
    });
    // A span and a text mark bind on their ITEM's path (no box of their own).
    expect(bindings).toContainEqual({
      path: 'sections.body.items[1].items[1]',
      key: 'recipient.name',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[1].items[1]',
      key: 'flags.circled',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[2]',
      key: 'flags.agreed',
      scope: null,
      source: false,
    });
    // Array sources, and row-relative bindings scoped to them.
    expect(bindings).toContainEqual({
      path: 'sections.body.items[3]',
      key: 'items',
      scope: null,
      source: true,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[3].columns[0]',
      key: 'name',
      scope: 'items',
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[3].columns[1].cell.items[0]',
      key: 'quantity',
      scope: 'items',
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[4]',
      key: 'tickets',
      scope: null,
      source: true,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[4].cell.items[0]',
      key: 'seat',
      scope: 'tickets',
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[5]',
      key: 'cards',
      scope: null,
      source: true,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[5].item.items[0]',
      key: 'title',
      scope: 'cards',
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[6]',
      key: 'tags',
      scope: null,
      source: true,
    });
    // An ellipse's presence binding (`MarkBinding` — `equals` and all) is a
    // value binding like the checkbox's.
    expect(bindings).toContainEqual({
      path: 'sections.body.items[7]',
      key: 'flags.vip',
      scope: null,
      source: false,
    });
  });

  it('yields nothing for unparseable text or a template without sections', () => {
    expect(readBindings('sections: [')).toEqual([]);
    expect(readBindings('version: "1"')).toEqual([]);
    expect(readBindings('sections: 7')).toEqual([]);
  });

  it('tolerates garbage item shapes and empty binding keys', () => {
    const bindings = readBindings(
      [
        'sections:',
        '  body:',
        '    items:',
        '      - 7',
        '      - type: text',
        '        data: { key: "" }',
        '      - type: text',
        '        data: { key: 5 }',
        '      - type: table',
        '        data: { key: rows }',
        '        columns:',
        '          - 7',
        '          - data: { key: cell_key }',
        '',
      ].join('\n'),
    );
    expect(bindings).toEqual([
      { path: 'sections.body.items[3]', key: 'rows', scope: null, source: true },
      {
        path: 'sections.body.items[3].columns[1]',
        key: 'cell_key',
        scope: 'rows',
        source: false,
      },
    ]);
  });

  it('bounds the walk depth against hostile nesting', () => {
    let inner = '{ type: text, data: { key: deep } }';
    for (let i = 0; i < 40; i += 1) {
      inner = `{ type: container, items: [ ${inner} ] }`;
    }
    const bindings = readBindings(`sections:\n  body:\n    items: [ ${inner} ]\n`);
    expect(bindings.some((b) => b.key === 'deep')).toBe(false);
    // The capped walk still collected the shallower containers' spine.
    expect(bindings).toEqual([]);
  });
});

describe('readBindings — interpolation refs', () => {
  it('counts a field used ONLY via text interpolation (the palette agrees with the engine)', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "合計 {amount.total_in_tax:currency} です"',
      '',
    ].join('\n');
    expect(readBindings(source)).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'amount.total_in_tax',
      scope: null,
      source: false,
    });
  });

  it('parses qr_code text interpolations too', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: qr_code',
      '        text: "https://example.com/{order.code}"',
      '',
    ].join('\n');
    expect(readBindings(source)).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'order.code',
      scope: null,
      source: false,
    });
  });

  it('scopes interpolations inside a repeat cell to the bound element', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: repeat',
      '        data: { key: tickets }',
      '        cell:',
      '          items:',
      '            - type: text',
      '              text: "座席 {seat}"',
      '',
    ].join('\n');
    expect(readBindings(source)).toContainEqual({
      path: 'sections.body.items[0].cell.items[0]',
      key: 'seat',
      scope: 'tickets',
      source: false,
    });
  });

  it('scopes interpolations inside a table column cell to the row', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: items }',
      '        columns:',
      '          - label: 数量',
      '            cell:',
      '              items:',
      '                - type: text',
      '                  text: "{quantity} 点"',
      '',
    ].join('\n');
    expect(readBindings(source)).toContainEqual({
      path: 'sections.body.items[0].columns[0].cell.items[0]',
      key: 'quantity',
      scope: 'items',
      source: false,
    });
  });

  it('scopes interpolations inside a repeat_flow card to the bound element', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: repeat_flow',
      '        data: { key: cards }',
      '        item:',
      '          items:',
      '            - type: text',
      '              text: "タイトル {title}"',
      '',
    ].join('\n');
    expect(readBindings(source)).toContainEqual({
      path: 'sections.body.items[0].item.items[0]',
      key: 'title',
      scope: 'cards',
      source: false,
    });
  });

  it('counts a field used only through a link URL (item or span)', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: plain',
      '        link: { url: "https://example.com/orders/{order.code}" }',
      '      - type: text',
      '        spans:',
      '          - text: terms',
      '            link: { url: "https://example.com/{terms.slug}" }',
      '',
    ].join('\n');
    const bindings = readBindings(source);
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'order.code',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[1]',
      key: 'terms.slug',
      scope: null,
      source: false,
    });
  });

  it('a key used in BOTH the text and a link URL is one placement', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "{order.code}"',
      '        link: { url: "https://example.com/{order.code}" }',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([
      { path: 'sections.body.items[0]', key: 'order.code', scope: null, source: false },
    ]);
  });

  it('caps the interpolation refs one hostile text can mint', () => {
    const exprs = Array.from({ length: 80 }, (_, i) => `{k${i}}`).join('');
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      `        text: "${exprs}"`,
      '',
    ].join('\n');
    expect(readBindings(source)).toHaveLength(64);
  });

  it("scopes a list's entry-template text to the list's own source", () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: list',
      '        data: { key: tags }',
      '        text: "{name} ×{quantity}"',
      '',
    ].join('\n');
    const bindings = readBindings(source);
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'name',
      scope: 'tags',
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'quantity',
      scope: 'tags',
      source: false,
    });
  });

  it('ignores a list text when the list binds no source (nothing to scope to)', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: list',
      '        text: "{name}"',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([]);
  });

  it('dedupes a key repeated in one text (one placement) and skips escapes/malformed', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "{a} と {a} と {{b}} と {c d}"',
      '',
    ].join('\n');
    const bindings = readBindings(source);
    expect(bindings).toEqual([
      { path: 'sections.body.items[0]', key: 'a', scope: null, source: false },
    ]);
  });

  it('emits BOTH a data.key ref and text interpolations when an item is later given text', () => {
    // A qr_code with data binds via data.key; its text (if any) would be
    // ignored by the engine when data wins, but the walk stays tolerant of
    // the transient both-keys state mid-edit.
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: qr_code',
      '        data: { key: order.url }',
      '        text: "{fallback.url}"',
      '',
    ].join('\n');
    const bindings = readBindings(source);
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'order.url',
      scope: null,
      source: false,
    });
    expect(bindings).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'fallback.url',
      scope: null,
      source: false,
    });
  });

  it('a non-string text value contributes nothing', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: { nested: map }',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([]);
  });

  it('counts a declared name under the key it declares, not the alias', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "品名: {f1}"',
      '        bindings:',
      '          f1: { key: 品名 }',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([
      { path: 'sections.body.items[0]', key: '品名', scope: null, source: false },
    ]);
  });

  it('follows a document-scope declaration out of a row scope', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: repeat_flow',
      '        data: { key: items }',
      '        item:',
      '          items:',
      '            - type: text',
      '              text: "{shop} / {name}"',
      '              bindings:',
      '                shop: { key: store_name, scope: document }',
      '',
    ].join('\n');
    const refs = readBindings(source);
    // The declared name reads top-level params (document scope), the
    // undeclared one still reads the bound row.
    expect(refs).toContainEqual({
      path: 'sections.body.items[0].item.items[0]',
      key: 'store_name',
      scope: null,
      source: false,
    });
    expect(refs).toContainEqual({
      path: 'sections.body.items[0].item.items[0]',
      key: 'name',
      scope: 'items',
      source: false,
    });
  });

  it('ignores a declaration nothing references', () => {
    // The engine reports that as `unused_binding`; counting it as a
    // placement would make the palette's usage indicator lie.
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: plain',
      '        bindings:',
      '          f1: { key: 品名 }',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([]);
  });

  it('counts two names pointing at one field as one placement', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "{a} {b}"',
      '        bindings:',
      '          a: { key: 品名 }',
      '          b: { key: 品名 }',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([
      { path: 'sections.body.items[0]', key: '品名', scope: null, source: false },
    ]);
  });

  it("resolves a list's per-entry declarations at the list's own scope", () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: list',
      '        data: { key: items }',
      '        text: "{f1} — {shop}"',
      '        bindings:',
      '          f1: { key: 品名 }',
      '          shop: { key: store_name, scope: document }',
      '',
    ].join('\n');
    const refs = readBindings(source);
    expect(refs).toContainEqual({
      path: 'sections.body.items[0]',
      key: '品名',
      scope: 'items',
      source: false,
    });
    expect(refs).toContainEqual({
      path: 'sections.body.items[0]',
      key: 'store_name',
      scope: null,
      source: false,
    });
  });

  it('leaves names alone when the bindings map is hostile', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: "{f1}"',
      '        bindings: [not, a, map]',
      '',
    ].join('\n');
    expect(readBindings(source)).toEqual([
      { path: 'sections.body.items[0]', key: 'f1', scope: null, source: false },
    ]);
  });
});

describe('readBindings — `scope: document` escapes the row', () => {
  const TEMPLATE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: table',
    '        data: { key: items }',
    '        columns:',
    '          - label: 品名',
    '            data: { key: name }',
    '          - label: 発注番号',
    '            data: { key: order.code, scope: document }',
    '          - label: 明細',
    '            cell:',
    '              items:',
    '                - type: text',
    '                  data: { key: store.name, scope: document }',
    '                - type: text',
    '                  data: { key: qty }',
    '                - type: text',
    '                  text: x',
    '                  spans:',
    '                    - text: y',
    '                      data: { key: doc.span, scope: document }',
    '                    - text: z',
    '                      data: { key: row.span }',
    '',
  ].join('\n');

  it('files an escaped binding at DOCUMENT scope, everywhere it can be authored', () => {
    const byKey = new Map(readBindings(TEMPLATE).map((ref) => [ref.key, ref.scope]));
    // Escaped: column data, cell item data, and a span's data.
    expect(byKey.get('order.code')).toBeNull();
    expect(byKey.get('store.name')).toBeNull();
    expect(byKey.get('doc.span')).toBeNull();
    // Ambient (the engine's `element` default) stays row-relative.
    expect(byKey.get('name')).toBe('items');
    expect(byKey.get('qty')).toBe('items');
    expect(byKey.get('row.span')).toBe('items');
  });

  it('counts an escaped binding in the SCALAR usage index, not the row one', () => {
    const usage = buildUsage(readBindings(TEMPLATE));
    expect(usage.scalar.get('order.code')).toEqual(['sections.body.items[0].columns[1]']);
    expect(usage.rows.get('items')?.get('order.code')).toBeUndefined();
    // …which is what the palette's used-indicator reads: the escaped binding
    // counts as a placement of the DOCUMENT group's field.
    const docGroup = { id: 'order', label: '', description: '', isArray: false, fields: [] };
    expect(fieldUsage(usage, docGroup, 'order.code')).toEqual([
      'sections.body.items[0].columns[1]',
    ]);
    // The row-relative ones still land under their group.
    expect(usage.rows.get('items')?.get('name')).toEqual(['sections.body.items[0].columns[0]']);
  });

  it('treats every NON-`document` scope value as ambient', () => {
    // Only the one wire spelling escapes; `element` is the default, and a
    // hostile value must never be read as an escape.
    for (const scope of [
      'element',
      'Document',
      'constructor',
      '{ evil: true }',
      '[document]',
      '5',
    ]) {
      const source = [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: items }',
        '        columns:',
        `          - { label: c, data: { key: k, scope: ${scope} } }`,
        '',
      ].join('\n');
      expect(readBindings(source)[1]?.scope, scope).toBe('items');
    }
  });

  it('never reads an INHERITED scope (a `__proto__`-shaped binding map)', () => {
    // A YAML `__proto__` key stays inert own data, so the binding below owns
    // no `scope` and must read as ambient.
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: items }',
      '        columns:',
      '          - label: c',
      '            data:',
      '              key: k',
      '              __proto__: { scope: document }',
      '',
    ].join('\n');
    expect(readBindings(source)[1]?.scope).toBe('items');
  });
});

describe('a nested list’s entries', () => {
  const NESTED = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: repeat',
    '        data: { key: orders }',
    '        cell:',
    '          items:',
    '            - type: list',
    '              data: { key: items }',
    '              text: "{title} ×{qty}"',
    '            - type: list',
    '              data: { key: releases, scope: document }',
    '              text: "{name}"',
    '            - type: list',
    '              text: "{orphan}"',
    '',
  ].join('\n');

  it('count under the array’s own scope — joined for a row-carried source', () => {
    const usage = buildUsage(readBindings(NESTED));
    // The row-carried list: its entry keys belong to `orders.items`, NOT to
    // `orders` (where they would mark the ORDER's fields as used) and not to
    // a bare `items` (which no group is keyed by).
    expect(usage.rows.get('orders.items')?.get('title')).toEqual([
      'sections.body.items[0].cell.items[0]',
    ]);
    expect(usage.rows.get('orders')?.get('title')).toBeUndefined();
    expect(usage.rows.get('items')).toBeUndefined();
    // The list itself is still a row-relative SOURCE binding of `orders`.
    expect(usage.rows.get('orders')?.get('items')).toEqual([
      'sections.body.items[0].cell.items[0]',
    ]);
  });

  it('escape to the top level with the list, when it does', () => {
    const usage = buildUsage(readBindings(NESTED));
    expect(usage.rows.get('releases')?.get('name')).toEqual([
      'sections.body.items[0].cell.items[1]',
    ]);
  });

  it('contribute nothing when the list binds no array at all', () => {
    const usage = buildUsage(readBindings(NESTED));
    const scopes = [...usage.rows.keys()];
    expect(scopes).not.toContain('orphan');
    for (const [, fields] of usage.rows) {
      expect(fields.has('orphan')).toBe(false);
    }
    expect(usage.scalar.has('orphan')).toBe(false);
  });
});

describe('`visible:` presence bindings', () => {
  const VISIBLE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: image',
    '        src: stamp.svg',
    '        visible: { key: order.status, equals: approved }',
    '      - type: repeat',
    '        data: { key: rows }',
    '        grid: { columns: 1 }',
    '        cell:',
    '          items:',
    '            - type: rect',
    '              box: { x: 0, y: 0, w: 1, h: 1 }',
    '              visible: { key: flagged }',
    '            - type: rect',
    '              box: { x: 0, y: 0, w: 1, h: 1 }',
    '              visible: { key: draft, scope: document }',
  ].join('\n');

  it('counts a document-scope `visible.key` as a reference', () => {
    // Without this the field would read as UNUSED in the palette even though
    // the document depends on it to decide whether the item draws.
    const refs = readBindings(VISIBLE);
    expect(refs.some((r) => r.key === 'order.status' && r.scope === null)).toBe(true);
  });

  it('scopes a `visible.key` inside a repeat cell to the bound element', () => {
    const refs = readBindings(VISIBLE);
    expect(refs.some((r) => r.key === 'flagged' && r.scope === 'rows')).toBe(true);
  });

  it('honours the `scope: document` escape from inside a cell', () => {
    const refs = readBindings(VISIBLE);
    expect(refs.some((r) => r.key === 'draft' && r.scope === null)).toBe(true);
  });
});
