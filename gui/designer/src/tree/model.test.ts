import { describe, expect, it } from 'vitest';
import { buildTree, MAX_LABEL_CHARS, MAX_TREE_DEPTH, MAX_TREE_NODES } from './model';

const TEMPLATE = [
  'version: "0.1.0"',
  'sections:',
  '  header:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: 請求書',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: Hello world',
  '      - type: text',
  '        data: { key: order.code }',
  '      - type: rect',
  '        id: frame',
  '        box: { w: 100, h: 40 }',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            text: inner',
  '      - type: table',
  '        data: { key: items }',
  '        columns:',
  '          - label: 品名',
  '            data: { key: name }',
  '          - data: { key: qty }',
  '          - cell:',
  '              items:',
  '                - type: text',
  '                  data: { key: price }',
  '      - type: repeat_flow',
  '        data: { key: cards }',
  '        item:',
  '          items:',
  '            - type: text',
  '              text: card',
  '      - type: repeat',
  '        data: { key: grid }',
  '        cell:',
  '          items:',
  '            - type: text',
  '              text: cellText',
  '  footer:',
  '    type: flow',
  '    items: []',
  '',
].join('\n');

describe('buildTree', () => {
  it('walks sections and items with box-index-grammar paths', () => {
    const view = buildTree(TEMPLATE);
    expect(view).not.toBeNull();
    expect(view?.truncated).toBe(false);
    expect(view?.roots.map((node) => node.path)).toEqual([
      'sections.header',
      'sections.body',
      'sections.footer',
    ]);
    expect(view?.roots.map((node) => node.kind)).toEqual([
      'section:header',
      'section:body',
      'section:footer',
    ]);
    const body = view?.roots[1];
    expect(body?.children.map((node) => node.path)).toEqual([
      'sections.body.items[0]',
      'sections.body.items[1]',
      'sections.body.items[2]',
      'sections.body.items[3]',
      'sections.body.items[4]',
      'sections.body.items[5]',
      'sections.body.items[6]',
    ]);
    expect(view?.roots[2]?.children).toEqual([]);
  });

  it('parses an image-bearing template past the 2 MiB default cap', () => {
    // The editor holds text an inline image can push past the default cap; the
    // outline must stay populated (parsed at the ceiling), not silently empty.
    const bigSrc = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 1000)}`;
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: hi',
      '      - type: image',
      '        box: { w: 10, h: 10 }',
      `        src: ${bigSrc}`,
      '',
    ].join('\n');
    expect(new TextEncoder().encode(source).length).toBeGreaterThan(2 * 1024 * 1024);
    expect(buildTree(source)?.roots[0]?.children).toHaveLength(2);
  });

  it('descends table columns, cell sub-templates, and repeat cards like the palette walk', () => {
    const body = buildTree(TEMPLATE)?.roots[1];
    const table = body?.children[4];
    expect(table?.kind).toBe('table');
    expect(table?.children.map((node) => node.path)).toEqual([
      'sections.body.items[4].columns[0]',
      'sections.body.items[4].columns[1]',
      'sections.body.items[4].columns[2]',
    ]);
    expect(table?.children.map((node) => node.kind)).toEqual(['column', 'column', 'column']);
    expect(table?.children[2]?.children.map((node) => node.path)).toEqual([
      'sections.body.items[4].columns[2].cell.items[0]',
    ]);
    const repeatFlow = body?.children[5];
    expect(repeatFlow?.children.map((node) => node.path)).toEqual([
      'sections.body.items[5].item.items[0]',
    ]);
    const repeat = body?.children[6];
    expect(repeat?.children.map((node) => node.path)).toEqual([
      'sections.body.items[6].cell.items[0]',
    ]);
    const container = body?.children[3];
    expect(container?.children.map((node) => node.path)).toEqual([
      'sections.body.items[3].items[0]',
    ]);
  });

  it('labels rows by text content, then binding key, then id, then nothing', () => {
    const body = buildTree(TEMPLATE)?.roots[1];
    expect(body?.children[0]?.label).toBe('Hello world');
    expect(body?.children[1]?.label).toBe('order.code');
    expect(body?.children[2]?.label).toBe('frame');
    expect(body?.children[3]?.label).toBeNull();
  });

  it('shows a MULTI-LINE text as its first line plus a break marker', () => {
    // A row renders `white-space: nowrap`, which collapses a `\n` to a space:
    // a three-line address used to arrive as one space-joined string, with
    // nothing saying it had been shortened.
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: |-',
        '          東京都渋谷区1-2-3',
        '          シブヤビル 5F',
        '          〒150-0001',
        '',
      ].join('\n'),
    );
    expect(view?.roots[0]?.children[0]?.label).toBe('東京都渋谷区1-2-3 ⏎…');
  });

  it('marks a value whose ONLY break is a trailing one', () => {
    // The engine reads that break, so the page really does carry a second
    // line — the row must not claim the value is single-line.
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: "one\\n"',
        '',
      ].join('\n'),
    );
    expect(view?.roots[0]?.children[0]?.label).toBe('one ⏎…');
  });

  it('keeps the break marker when the FIRST line is itself too long to show', () => {
    // Clipping last would cut off the very thing that says the label is
    // partial — the case a long Japanese address hits first.
    const first = 'あ'.repeat(MAX_LABEL_CHARS * 2);
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        `        text: "${first}\\nsecond"`,
        '',
      ].join('\n'),
    );
    const label = view?.roots[0]?.children[0]?.label ?? '';
    expect(label.endsWith(' ⏎…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
    expect(label).toContain('…');
  });

  it('labels a value that is ONLY breaks with the marker alone', () => {
    // There is no readable line to promote, so the marker is the whole label —
    // it still says the value is multi-line, which is the only true thing left.
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: "\\n  \\n"',
        '',
      ].join('\n'),
    );
    expect(view?.roots[0]?.children[0]?.label).toBe(' ⏎…');
  });

  it('prefers text over binding key and id on one item', () => {
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: shown',
        '        data: { key: hidden.key }',
        '        id: hidden-id',
        '',
      ].join('\n'),
    );
    expect(view?.roots[0]?.children[0]?.label).toBe('shown');
  });

  it('labels columns by their label, then binding key', () => {
    const table = buildTree(TEMPLATE)?.roots[1]?.children[4];
    expect(table?.children[0]?.label).toBe('品名');
    expect(table?.children[1]?.label).toBe('qty');
    expect(table?.children[2]?.label).toBeNull();
  });

  /** A table with `headerGroups` above its columns — the group rows are their
   * own selectable nodes, so a canvas group click and the tree agree. */
  const GROUPED = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: table',
    '        headerGroups:',
    '          - { label: 品目, span: 2 }',
    '          - span: 1',
    '          - 9',
    '        columns:',
    '          - label: 品名',
    '          - label: 単位',
    '          - label: 金額',
    '',
  ].join('\n');

  it('gives each header group its own node, ahead of the columns it spans', () => {
    const table = buildTree(GROUPED)?.roots[0]?.children[0];
    expect(table?.children.map((node) => node.path)).toEqual([
      'sections.body.items[0].headerGroups[0]',
      'sections.body.items[0].headerGroups[1]',
      'sections.body.items[0].headerGroups[2]',
      'sections.body.items[0].columns[0]',
      'sections.body.items[0].columns[1]',
      'sections.body.items[0].columns[2]',
    ]);
    // Groups are leaves (their spanned columns are siblings, not children),
    // and a label-less or malformed entry keeps its slot with no label.
    expect(table?.children.slice(0, 3).map((node) => node.kind)).toEqual([
      'header_group',
      'header_group',
      'header_group',
    ]);
    expect(table?.children.slice(0, 3).map((node) => node.label)).toEqual(['品目', null, null]);
    expect(table?.children[0]?.children).toEqual([]);
  });

  it('stops mid-headerGroups when the node budget runs out at a table', () => {
    const filler = Array.from(
      { length: MAX_TREE_NODES - 2 },
      () => '      - { type: text, text: row }',
    ).join('\n');
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        filler,
        '      - type: table',
        '        headerGroups:',
        '          - { label: a, span: 1 }',
        '          - { label: b, span: 1 }',
        '        columns:',
        '          - label: a',
        '',
      ].join('\n'),
    );
    expect(view?.truncated).toBe(true);
    const table = view?.roots[0]?.children.at(-1);
    // The table took the last slot, so neither its groups nor its columns fit.
    expect(table?.children).toEqual([]);
  });

  it('keeps a row for a malformed sequence entry so sibling indices stay true', () => {
    const view = buildTree(
      ['sections:', '  body:', '    type: flow', '    items:', '      - 42', ''].join('\n'),
    );
    const entry = view?.roots[0]?.children[0];
    expect(entry?.path).toBe('sections.body.items[0]');
    expect(entry?.kind).toBe('item');
    expect(entry?.label).toBeNull();
  });

  it('treats a typeless map entry as a generic item', () => {
    const view = buildTree(
      ['sections:', '  body:', '    type: flow', '    items:', '      - id: mystery', ''].join(
        '\n',
      ),
    );
    expect(view?.roots[0]?.children[0]?.kind).toBe('item');
    expect(view?.roots[0]?.children[0]?.label).toBe('mystery');
  });

  it('clips long labels', () => {
    const long = 'x'.repeat(MAX_LABEL_CHARS + 40);
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        `      - { type: text, text: "${long}" }`,
        '',
      ].join('\n'),
    );
    const label = view?.roots[0]?.children[0]?.label;
    expect(label).toBe(`${'x'.repeat(MAX_LABEL_CHARS)}…`);
  });

  it('stops descending past the depth cap and reports truncation', () => {
    let inner = '{ type: text, text: deepest }';
    for (let i = 0; i < MAX_TREE_DEPTH + 8; i++) {
      inner = `{ type: container, items: [ ${inner} ] }`;
    }
    const view = buildTree(
      ['sections:', '  body:', '    type: flow', `    items: [ ${inner} ]`, ''].join('\n'),
    );
    expect(view?.truncated).toBe(true);
    let depth = 0;
    let node = view?.roots[0]?.children[0];
    while (node !== undefined && node.children.length > 0) {
      node = node.children[0];
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(MAX_TREE_DEPTH + 1);
  });

  it('stops at the node budget on a flooded document and reports truncation', () => {
    const items = Array.from(
      { length: MAX_TREE_NODES + 50 },
      () => '      - { type: text, text: row }',
    ).join('\n');
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        items,
        '  footer:',
        '    type: flow',
        '    items: []',
        '',
      ].join('\n'),
    );
    expect(view?.truncated).toBe(true);
    // The budget ran out inside the body walk, so the footer section itself
    // no longer fits — the roots stop at the body.
    expect(view?.roots.map((node) => node.kind)).toEqual(['section:body']);
    const total = view?.roots.reduce((sum, root) => sum + 1 + root.children.length, 0) ?? 0;
    expect(total).toBeLessThanOrEqual(MAX_TREE_NODES);
  });

  it('stops mid-columns when the node budget runs out at a table', () => {
    const filler = Array.from(
      { length: MAX_TREE_NODES - 2 },
      () => '      - { type: text, text: row }',
    ).join('\n');
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        filler,
        '      - type: table',
        '        columns:',
        '          - label: a',
        '          - label: b',
        '',
      ].join('\n'),
    );
    expect(view?.truncated).toBe(true);
    const table = view?.roots[0]?.children.at(-1);
    expect(table?.kind).toBe('table');
    // The table itself consumed the last budget slot; its columns did not fit.
    expect(table?.children).toEqual([]);
  });

  it('skips a non-map section and tolerates malformed columns and empty binding keys', () => {
    const view = buildTree(
      [
        'sections:',
        '  header: 3',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        columns:',
        '          - 42',
        '      - type: text',
        '        text: ""',
        '        data: { key: "" }',
        '        id: fallback',
        '      - type: text',
        '        data: nope',
        '      - { type: "", text: t }',
        '',
      ].join('\n'),
    );
    expect(view?.roots.map((node) => node.kind)).toEqual(['section:body']);
    const body = view?.roots[0];
    expect(body?.children[0]?.children[0]).toEqual({
      path: 'sections.body.items[0].columns[0]',
      kind: 'column',
      label: null,
      children: [],
    });
    expect(body?.children[1]?.label).toBe('fallback');
    expect(body?.children[2]?.label).toBeNull();
    expect(body?.children[3]?.kind).toBe('item');
  });

  it('returns null for malformed YAML', () => {
    expect(buildTree('items: [')).toBeNull();
  });

  it('returns null for a non-map root', () => {
    expect(buildTree('- a\n- b\n')).toBeNull();
  });

  it('returns null for an alias bomb instead of expanding it', () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x","x"]',
      'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]',
      'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]',
      'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]',
      'e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]',
      '',
    ].join('\n');
    expect(buildTree(bomb)).toBeNull();
  });

  it('shows an empty view when sections is missing or not a map', () => {
    expect(buildTree('version: "0.1.0"\n')?.roots).toEqual([]);
    expect(buildTree('sections: 5\n')?.roots).toEqual([]);
  });

  it('renders hostile key names verbatim without polluting prototypes', () => {
    const view = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        id: __proto__',
        '      - type: text',
        '        data: { key: __proto__ }',
        '',
      ].join('\n'),
    );
    expect(view?.roots[0]?.children[0]?.label).toBe('__proto__');
    expect(view?.roots[0]?.children[1]?.label).toBe('__proto__');
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
});

describe('a conditionally hidden or collapsed item', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: gone',
    '        visible: { key: show, collapse: true }',
    '      - type: page_break',
    '        visible: { key: split }',
  ].join('\n');

  it('is still listed, because the tree reads the DOCUMENT and not the layout', () => {
    // A COLLAPSED item emits no `PlacedBox` at all, so the canvas cannot
    // hit-test it — the layer tree is its only selection path, and the `line`
    // precedent (a box-less item editable NOWHERE) is what makes that worth
    // pinning rather than assuming.
    const tree = buildTree(SOURCE);
    const body = tree?.roots.find((n) => n.path === 'sections.body');
    const paths = body?.children.map((n) => n.path);
    expect(paths).toEqual(['sections.body.items[0]', 'sections.body.items[1]']);
  });

  it('marks the row as conditional so an absent item is explained', () => {
    // The tree does not evaluate the predicate — that is the engine's answer
    // — it only reports that one exists. Without the mark, selecting a
    // COLLAPSED item highlights nothing on canvas and reads as broken.
    const tree = buildTree(SOURCE);
    const body = tree?.roots.find((n) => n.path === 'sections.body');
    expect(body?.children.map((n) => n.conditional)).toEqual([true, true]);
  });

  it('leaves an unconditional item unmarked', () => {
    const tree = buildTree(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: text',
        '        text: always',
      ].join('\n'),
    );
    const body = tree?.roots.find((n) => n.path === 'sections.body');
    expect(body?.children[0]?.conditional).toBeUndefined();
  });

  it('keeps the item kinds so the row is recognisable', () => {
    const tree = buildTree(SOURCE);
    const body = tree?.roots.find((n) => n.path === 'sections.body');
    expect(body?.children.map((n) => n.kind)).toEqual(['text', 'page_break']);
  });
});
