// The reference walk: one case per carrier of the census (the engine's validate
// walks + the two layout-only labels), each pinning the LEAF a reference sits
// at, the frame it resolves under and its role — plus the scope rules (escapes,
// rows, list entries, declarations shadowing `{name}`), the bands, and the
// bounds that mark the walk truncated.

import { describe, expect, it } from 'vitest';
import { MAX_TEXT_EXPRS } from '../../text/interpolate';
import { MAX_REF_ITEMS } from './types';
import { readDataRefs } from './walk';

function refsOf(body: string, extra = '') {
  const source = `sections:\n  body:\n    type: flow\n    items:\n${body}${extra}`;
  const index = readDataRefs(source);
  if (index === null) {
    throw new Error('fixture should parse');
  }
  return index;
}

/** The comparable shape of each reference. */
function shape(body: string, extra = '') {
  return refsOf(body, extra).refs.map((ref) => ({
    path: ref.path,
    keys: ref.keys,
    frame: ref.frame,
    spelled: ref.spelled,
    carrier: ref.carrier,
    form: ref.form,
  }));
}

const AT = 'sections.body.items[0]';

describe('readDataRefs — one case per carrier', () => {
  it('text: data (value), text and link (inline)', () => {
    expect(
      shape(
        '      - type: text\n        data: { key: a }\n        text: "x {b} {c:date}"\n        link: { url: "https://e/{d}" }\n',
      ),
    ).toEqual([
      { path: AT, keys: ['data', 'key'], frame: [], spelled: 'a', carrier: 'value', form: 'whole' },
      { path: AT, keys: ['text'], frame: [], spelled: 'b', carrier: 'inline', form: 'inline' },
      { path: AT, keys: ['text'], frame: [], spelled: 'c', carrier: 'inline', form: 'inline' },
      { path: AT, keys: ['link', 'url'], frame: [], spelled: 'd', carrier: 'link', form: 'inline' },
    ]);
  });

  it('text spans: data, text and link, at the span', () => {
    const span = `${AT}.spans[0]`;
    expect(
      shape(
        '      - type: text\n        spans:\n          - { data: { key: a }, text: "{b}", link: { url: "{c}" } }\n',
      ),
    ).toEqual([
      {
        path: span,
        keys: ['data', 'key'],
        frame: [],
        spelled: 'a',
        carrier: 'value',
        form: 'whole',
      },
      { path: span, keys: ['text'], frame: [], spelled: 'b', carrier: 'inline', form: 'inline' },
      {
        path: span,
        keys: ['link', 'url'],
        frame: [],
        spelled: 'c',
        carrier: 'link',
        form: 'inline',
      },
    ]);
  });

  it("a text mark and any item's visible condition", () => {
    expect(
      shape(
        '      - type: text\n        text: hi\n        mark: { data: { key: m } }\n        visible: { key: v }\n',
      ),
    ).toEqual([
      {
        path: AT,
        keys: ['visible', 'key'],
        frame: [],
        spelled: 'v',
        carrier: 'visible',
        form: 'whole',
      },
      {
        path: AT,
        keys: ['mark', 'data', 'key'],
        frame: [],
        spelled: 'm',
        carrier: 'mark',
        form: 'whole',
      },
    ]);
  });

  it('image: data and link; qr_code and char_grid: data and text', () => {
    const refs = shape(
      [
        '      - { type: image, data: { key: i }, link: { url: "{il}" } }',
        '      - { type: qr_code, data: { key: q }, text: "{qt}" }',
        '      - { type: char_grid, data: { key: g }, text: "{gt}" }',
        '',
      ].join('\n'),
    );
    expect(refs.map((ref) => [ref.spelled, ref.carrier, ref.keys.join('.')])).toEqual([
      ['i', 'value', 'data.key'],
      ['il', 'link', 'link.url'],
      ['q', 'value', 'data.key'],
      ['qt', 'inline', 'text'],
      ['g', 'value', 'data.key'],
      ['gt', 'inline', 'text'],
    ]);
  });

  it('ellipse and checkbox data are their drawing conditions', () => {
    const refs = shape(
      '      - { type: ellipse, data: { key: e } }\n      - { type: checkbox, data: { key: c } }\n',
    );
    expect(refs.map((ref) => [ref.spelled, ref.carrier])).toEqual([
      ['e', 'ellipse'],
      ['c', 'checkbox'],
    ]);
  });

  it('bindings: declarations are references where they are declared; a declared {name} is not', () => {
    const refs = refsOf(
      '      - type: text\n        text: "{n} {m}"\n        bindings:\n          n: { key: 品名 }\n          d: { key: doc, scope: document }\n',
    ).refs;
    expect(refs.map((ref) => [ref.spelled, ref.carrier, ref.keys.join('.')])).toEqual([
      ['m', 'inline', 'text'],
      ['品名', 'declaration', 'bindings.n.key'],
      ['doc', 'declaration', 'bindings.d.key'],
    ]);
    expect([...(refs[0]?.shadow ?? [])]).toEqual(['n', 'd']);
  });

  it('a table: source, column data and label, row condition, header-group label', () => {
    const refs = shape(
      [
        '      - type: table',
        '        data: { key: inv.items }',
        '        columns:',
        '          - { label: "Qty {unit}", data: { key: qty } }',
        '          - { data: { key: total, scope: document } }',
        '        headerGroups:',
        '          - { label: "{title}", span: 2 }',
        '        row:',
        '          conditionalStyles:',
        '            - { when: { key: flagged }, style: { bold: true } }',
        '            - { when: { key: other, scope: document }, style: { bold: true } }',
        '',
      ].join('\n'),
    );
    expect(refs).toEqual([
      {
        path: AT,
        keys: ['data', 'key'],
        frame: [],
        spelled: 'inv.items',
        carrier: 'source',
        form: 'whole',
      },
      {
        path: `${AT}.columns[0]`,
        keys: ['data', 'key'],
        frame: ['inv', 'items'],
        spelled: 'qty',
        carrier: 'column',
        form: 'whole',
      },
      {
        path: `${AT}.columns[0]`,
        keys: ['label'],
        frame: [],
        spelled: 'unit',
        carrier: 'label',
        form: 'inline',
      },
      {
        path: `${AT}.columns[1]`,
        keys: ['data', 'key'],
        frame: [],
        spelled: 'total',
        carrier: 'column',
        form: 'whole',
      },
      // A row condition always reads the row: its `scope: document` is ignored.
      {
        path: `${AT}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        frame: ['inv', 'items'],
        spelled: 'flagged',
        carrier: 'rowCondition',
        form: 'whole',
      },
      {
        path: `${AT}.row.conditionalStyles[1]`,
        keys: ['when', 'key'],
        frame: ['inv', 'items'],
        spelled: 'other',
        carrier: 'rowCondition',
        form: 'whole',
      },
      {
        path: `${AT}.headerGroups[0]`,
        keys: ['label'],
        frame: [],
        spelled: 'title',
        carrier: 'label',
        form: 'inline',
      },
    ]);
  });

  it('a table cell resolves in the rows, and `scope: document` escapes them', () => {
    const refs = shape(
      [
        '      - type: table',
        '        data: { key: items }',
        '        columns:',
        '          - cell:',
        '              items:',
        '                - { type: text, data: { key: name } }',
        '                - { type: text, data: { key: total, scope: document } }',
        '',
      ].join('\n'),
    );
    expect(refs.slice(1).map((ref) => [ref.path, ref.frame, ref.spelled])).toEqual([
      [`${AT}.columns[0].cell.items[0]`, ['items'], 'name'],
      [`${AT}.columns[0].cell.items[1]`, [], 'total'],
    ]);
  });

  it('repeat and repeat_flow: sources whose cell / card items resolve in the rows', () => {
    const refs = shape(
      [
        '      - type: repeat',
        '        data: { key: cards }',
        '        cell: { items: [ { type: text, text: "{title}" } ] }',
        '      - type: repeat_flow',
        '        data: { key: notes }',
        '        item: { items: [ { type: text, data: { key: body } } ] }',
        '',
      ].join('\n'),
    );
    expect(refs.map((ref) => [ref.spelled, ref.carrier, ref.frame])).toEqual([
      ['cards', 'source', []],
      ['title', 'inline', ['cards']],
      ['notes', 'source', []],
      ['body', 'value', ['notes']],
    ]);
  });

  it('a list: its source, and its entry text and declarations in its entries', () => {
    const refs = shape(
      '      - type: list\n        data: { key: tags }\n        text: "#{word}"\n        bindings:\n          w: { key: label }\n',
    );
    expect(refs.map((ref) => [ref.spelled, ref.carrier, ref.frame])).toEqual([
      ['tags', 'source', []],
      ['word', 'inline', ['tags']],
      ['label', 'declaration', ['tags']],
    ]);
  });

  it('a list inside a table cell joins the row frame; a nested repeat or table is read from the root', () => {
    const refs = shape(
      [
        '      - type: table',
        '        data: { key: orders }',
        '        columns:',
        '          - cell:',
        '              items:',
        '                - { type: list, data: { key: lines }, text: "{sku}" }',
        '                - type: repeat',
        '                  data: { key: notes }',
        '                  cell: { items: [ { type: text, text: "{body}" } ] }',
        '',
      ].join('\n'),
    );
    expect(refs.map((ref) => [ref.spelled, ref.frame])).toEqual([
      ['orders', []],
      ['lines', ['orders']],
      ['sku', ['orders', 'lines']],
      ['notes', []],
      ['body', ['notes']],
    ]);
  });

  it('a container keeps its own frame for its items', () => {
    const refs = shape(
      '      - type: container\n        items:\n          - { type: text, data: { key: a } }\n',
    );
    expect(refs.map((ref) => [ref.path, ref.frame])).toEqual([[`${AT}.items[0]`, []]]);
  });

  it('the document block: strings inline, keywords / authors as string lists', () => {
    const index = readDataRefs(
      'document:\n  title: "{t}"\n  description: "{d}"\n  language: "{l}"\n  keywords: ["{k}", plain]\n  authors: ["{au}"]\nsections: {}\n',
    );
    expect(index?.refs.map((ref) => [ref.path, ref.keys.join('.'), ref.spelled, ref.form])).toEqual(
      [
        ['document', 'title', 't', 'inline'],
        ['document', 'description', 'd', 'inline'],
        ['document', 'language', 'l', 'inline'],
        ['document', 'keywords', 'k', 'strings'],
        ['document', 'authors', 'au', 'strings'],
      ],
    );
    const keywords = index?.refs[3];
    expect(keywords?.form === 'strings' ? keywords.strings : null).toEqual(['{k}', 'plain']);
  });

  it('walks the header and footer too', () => {
    const index = readDataRefs(
      'sections:\n  header:\n    items: [ { type: text, data: { key: h } } ]\n  footer:\n    items: [ { type: text, data: { key: f } } ]\n',
    );
    expect(index?.refs.map((ref) => ref.path)).toEqual([
      'sections.header.items[0]',
      'sections.footer.items[0]',
    ]);
  });
});

describe('readDataRefs — reading rules and bounds', () => {
  it('names each owner as the layer tree would', () => {
    const [ref] = refsOf('      - { type: text, text: "合計 {total}" }\n').refs;
    expect(ref?.owner).toEqual({ path: AT, type: 'text', label: '合計 {total}' });
  });

  it('keeps `{{` literal, a malformed expression literal, and one ref per key per leaf', () => {
    const refs = shape('      - { type: text, text: "{{a}} {b {c} {c:date}" }\n');
    expect(refs.map((ref) => ref.spelled)).toEqual(['c']);
  });

  it('names a typeless item by no type', () => {
    expect(refsOf('      - { data: { key: a } }\n').refs[0]?.owner).toEqual({
      path: AT,
      type: '',
      label: 'a',
    });
  });

  it('ignores garbage shapes without throwing', () => {
    expect(shape('      - 3\n      - { type: text, data: 5, spans: [7], bindings: [] }\n')).toEqual(
      [],
    );
    expect(readDataRefs(': [')).toBeNull();
    expect(readDataRefs('- a')).toBeNull();
  });

  it('marks the walk truncated past the expression bound of one string', () => {
    const text = Array.from({ length: MAX_TEXT_EXPRS }, (_, i) => `{k${i}}`).join(' ');
    expect(refsOf(`      - { type: text, text: "${text}" }\n`).truncated).toBe(true);
  });

  it('marks the walk truncated past the item bound', () => {
    const items = '      - { type: text, data: { key: a } }\n'.repeat(MAX_REF_ITEMS + 1);
    const index = refsOf(items);
    expect(index.truncated).toBe(true);
    expect(index.refs).toHaveLength(MAX_REF_ITEMS);
  });

  it('marks the walk truncated past the depth bound', () => {
    let nested = '{ type: text, data: { key: deep } }';
    for (let i = 0; i < 40; i++) {
      nested = `{ type: container, items: [ ${nested} ] }`;
    }
    expect(refsOf(`      - ${nested}\n`).truncated).toBe(true);
  });

  it('marks the walk truncated when a document list holds a non-string', () => {
    expect(readDataRefs('document:\n  keywords: ["{a}", 3]\nsections: {}\n')?.truncated).toBe(true);
  });

  it('reads `__proto__`-shaped data as plain keys', () => {
    const refs = shape('      - { type: text, data: { key: __proto__ }, text: "{constructor}" }\n');
    expect(refs.map((ref) => ref.spelled)).toEqual(['__proto__', 'constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
