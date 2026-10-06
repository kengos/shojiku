// What an anchor picker offers and the name picking mints, read from the
// document alone: one case per exclusion (self, page_break, the three repeated
// scopes, columns and frames, an already-anchored item), the duplicate-id and
// unacceptable-id cases, every naming rule, and the partial-namespace rule.

import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { anchorCandidates, mintBase, pickTarget } from './anchorTargets';
import { MAX_ID_CHARS } from './idEdit';
import { buildIdIndex, type IdIndex, takenNames } from './idIndex';
import type { IdHolder } from './walk';

const BODY = 'sections.body.items';
const SELF = `${BODY}[0]`;

function indexOf(yaml: string): IdIndex {
  const editor = Editor.create(yaml);
  return buildIdIndex((path) => editor.read(path));
}

/** The offered holders as `id ?? path`, the shape the assertions read. */
function offered(index: IdIndex, self = SELF): string[] {
  return anchorCandidates(index, self).map((h) => h.id ?? h.path);
}

const DOC = `
sections:
  header:
    items:
      - { type: text, text: Title }
  body:
    type: flow
    items:
      - { type: ellipse, box: { w: 6, h: 4 } }
      - { type: text, data: { key: order.total } }
      - { type: page_break, id: brk }
      - type: container
        items:
          - { type: rect, id: inner }
      - type: table
        data: { key: lines }
        columns:
          - id: qty
            cell:
              id: qty_cell
              items:
                - { type: text, id: in_column }
      - type: repeat
        data: { key: tickets }
        cell:
          id: ticket
          items:
            - type: container
              items:
                - { type: text, id: in_repeat }
      - type: repeat_flow
        data: { key: cards }
        item:
          id: card
          items:
            - { type: text, id: in_card }
      - { type: ellipse, id: circled, anchor: inner }
      - { type: line, id: from_end, from: { item: inner }, to: { x: 0, y: 0 } }
      - { type: line, id: to_end, from: { x: 0, y: 0 }, to: { item: inner } }
      - { type: line, id: free, from: { x: 0, y: 0 }, to: { x: 9, y: 0 } }
      - { type: ellipse, id: loose, box: { w: 6, h: 4 } }
  footer:
    items:
      - { type: page_number }
`;

describe('anchorCandidates', () => {
  it('offers the document’s items with no box index at all, in document order', () => {
    expect(offered(indexOf(DOC))).toEqual([
      'sections.header.items[0]',
      `${BODY}[1]`,
      `${BODY}[3]`,
      'inner',
      `${BODY}[4]`,
      `${BODY}[5]`,
      `${BODY}[6]`,
      'free',
      'loose',
      'sections.footer.items[0]',
    ]);
  });

  it('carries the layer tree’s label and the kind for each', () => {
    const [head, total] = anchorCandidates(indexOf(DOC), SELF);
    expect(head).toMatchObject({ kind: 'text', label: 'Title' });
    expect(total).toMatchObject({ kind: 'text', label: 'order.total', dataKey: 'order.total' });
  });

  it('never offers the anchoring item itself — named or not', () => {
    expect(offered(indexOf(DOC))).not.toContain(SELF);
    expect(offered(indexOf(DOC), `${BODY}[11]`)).not.toContain('loose');
  });

  it('excludes a page_break, which places no box', () => {
    expect(offered(indexOf(DOC))).not.toContain('brk');
  });

  it('excludes items in a repeat cell, a column cell and a repeat_flow card, at any depth', () => {
    const list = offered(indexOf(DOC));
    for (const id of ['in_column', 'in_repeat', 'in_card']) {
      expect(list).not.toContain(id);
    }
    expect(list).not.toContain(`${BODY}[5].cell.items[0]`);
  });

  it('excludes columns and the three frames', () => {
    const list = offered(indexOf(DOC));
    for (const id of ['qty', 'qty_cell', 'ticket', 'card']) {
      expect(list).not.toContain(id);
    }
  });

  it('excludes an item that is itself anchored — either spelling, either end', () => {
    const list = offered(indexOf(DOC));
    expect(list).not.toContain('circled');
    expect(list).not.toContain('from_end');
    expect(list).not.toContain('to_end');
    // …while an UNanchored ellipse or line is an ordinary target.
    expect(list).toContain('free');
    expect(list).toContain('loose');
  });

  it('excludes a repeat or repeat_flow the engine SKIPS — anywhere but directly in a flow body', () => {
    const at = (body: string, items: string) =>
      offered(indexOf(`sections:\n  body:\n    type: ${body}\n    items:\n${items}`));
    const rep =
      '      - { type: ellipse }\n      - { type: repeat, id: r, cell: { items: [] } }\n      - { type: repeat_flow, id: rf, item: { items: [] } }\n';
    expect(at('flow', rep)).toEqual(['r', 'rf']);
    expect(at('absolute', rep)).toEqual([]);
    const nested =
      '      - { type: ellipse }\n      - type: container\n        id: c\n        items:\n          - { type: repeat, id: r, cell: { items: [] } }\n          - { type: repeat_flow, id: rf, item: { items: [] } }\n';
    expect(at('flow', nested)).toEqual(['c']);
    const band = offered(
      indexOf(`
sections:
  header:
    items:
      - { type: repeat, id: r, cell: { items: [] } }
      - { type: repeat_flow, id: rf, item: { items: [] } }
  body: { type: flow, items: [ { type: ellipse } ] }
`),
    );
    expect(band).toEqual([]);
  });

  it('excludes a page_number the engine SKIPS — anywhere but directly in a band', () => {
    const index = indexOf(`
sections:
  header:
    items:
      - { type: page_number, id: in_header }
      - type: container
        items: [ { type: page_number, id: in_band_container } ]
  body:
    type: flow
    items:
      - { type: ellipse }
      - { type: page_number, id: in_body }
  footer:
    items: [ { type: page_number, id: in_footer } ]
`);
    expect(offered(index).filter((id) => id.startsWith('in_'))).toEqual(['in_header', 'in_footer']);
  });

  it('offers an id two holders share once — the first eligible one', () => {
    const index = indexOf(`
sections:
  body:
    items:
      - { type: ellipse }
      - { type: text, id: twin, text: First }
      - { type: rect, id: twin }
`);
    expect(anchorCandidates(index, SELF).map((h) => [h.id, h.label])).toEqual([['twin', 'First']]);
  });

  it('skips an authored id the name rule refuses — empty, control characters, over-long, not a string', () => {
    const index = indexOf(`
sections:
  body:
    items:
      - { type: ellipse }
      - { type: text, id: "" }
      - { type: text, id: "a\\u0007b" }
      - { type: text, id: "${'x'.repeat(MAX_ID_CHARS + 1)}" }
      - { type: text, id: 3 }
      - { type: text, id: { a: 1 } }
      - { type: text, id: ok }
`);
    // A non-string id would be OVERWRITTEN by the minted name — the name field
    // never does that, so neither does picking.
    expect(offered(index)).toEqual(['ok']);
  });

  it('offers only named items when the namespace is partial', () => {
    const partial: IdIndex = { ...indexOf(DOC), truncated: true };
    expect(offered(partial)).toEqual(['inner', 'free', 'loose']);
  });

  it('survives a hostile document without offering anything from it', () => {
    const index = indexOf(`
sections:
  body:
    items:
      - { type: ellipse }
      - { __proto__: { type: text }, id: proto }
      - { type: text, constructor: x, data: { key: { nested: 1 } } }
`);
    // The `__proto__` entry has no own `type` — the walk calls it `item`,
    // which is not a target; the other is an ordinary unnamed text.
    expect(offered(index)).toEqual([`${BODY}[2]`]);
    expect(anchorCandidates(index, SELF)[0]?.dataKey).toBeUndefined();
  });
});

function holder(fields: Partial<IdHolder>): IdHolder {
  return {
    path: `${BODY}[1]`,
    id: undefined,
    kind: 'text',
    label: null,
    repeated: false,
    dataKey: undefined,
    foreign: false,
    owner: 'flow',
    ...fields,
  };
}

describe('mintBase — the first name an unnamed target is offered', () => {
  it('takes the bound data key', () => {
    expect(mintBase(holder({ dataKey: 'total' }))).toBe('total');
  });

  it('turns a dotted key’s dots into underscores', () => {
    expect(mintBase(holder({ dataKey: 'order.lines.total' }))).toBe('order_lines_total');
  });

  it('keeps `-` and digits, the rest of the ASCII name set', () => {
    expect(mintBase(holder({ dataKey: 'line-2' }))).toBe('line-2');
  });

  it('falls back to `<type>_1` for an unbound item', () => {
    expect(mintBase(holder({ kind: 'qr_code' }))).toBe('qr_code_1');
  });

  it('falls back to `<type>_1` for a key that is not plain ASCII', () => {
    expect(mintBase(holder({ dataKey: '合計' }))).toBe('text_1');
    expect(mintBase(holder({ dataKey: 'a b' }))).toBe('text_1');
    expect(mintBase(holder({ dataKey: 'a\u0001b' }))).toBe('text_1');
  });

  it('falls back to `<type>_1` for a key longer than a name may be', () => {
    expect(mintBase(holder({ dataKey: 'k'.repeat(MAX_ID_CHARS + 1) }))).toBe('text_1');
    expect(mintBase(holder({ dataKey: 'k'.repeat(MAX_ID_CHARS) }))).toBe('k'.repeat(MAX_ID_CHARS));
  });

  it('stems an unknown or hostile type as `item`', () => {
    expect(mintBase(holder({ kind: 'sparkline' }))).toBe('sparkline_1');
    expect(mintBase(holder({ kind: '図形' }))).toBe('item_1');
    expect(mintBase(holder({ kind: 'k'.repeat(33) }))).toBe('item_1');
  });
});

describe('pickTarget', () => {
  it('writes a named target’s own id and authors nothing else', () => {
    const index = indexOf(DOC);
    const inner = anchorCandidates(index, SELF).find((h) => h.id === 'inner') as IdHolder;
    expect(pickTarget(inner, index)).toEqual({ id: 'inner', ops: [] });
  });

  it('names an unnamed target in the same batch', () => {
    const index = indexOf(DOC);
    const total = anchorCandidates(index, SELF)[1] as IdHolder;
    expect(pickTarget(total, index)).toEqual({
      id: 'order_total',
      ops: [{ op: 'setScalar', path: `${BODY}[1]`, keys: ['id'], value: 'order_total' }],
    });
  });

  it('counts on past a name ANY node or reference uses', () => {
    const index = indexOf(`
sections:
  body:
    items:
      - { type: ellipse, anchor: text_2 }
      - { type: text }
      - type: repeat
        cell: { items: [ { type: rect, id: text_1 } ] }
`);
    // `text_1` is held inside a repeat (not offered, still TAKEN); `text_2` is
    // only an orphan anchor's name — minting it would capture that anchor.
    const [text] = anchorCandidates(index, `${BODY}[9]`);
    expect(pickTarget(text as IdHolder, index).id).toBe('text_3');
  });

  it('counts a taken data key on too', () => {
    const index = indexOf(`
sections:
  body:
    items:
      - { type: rect, id: total }
      - { type: text, data: { key: total } }
`);
    const target = anchorCandidates(index, 'none').find((h) => h.id === undefined) as IdHolder;
    expect(pickTarget(target, index).id).toBe('total_2');
  });
});

describe('takenNames', () => {
  it('is every holder id and every reference id', () => {
    expect([...takenNames(indexOf(DOC))].sort()).toEqual(
      [
        'brk',
        'card',
        'circled',
        'free',
        'from_end',
        'in_card',
        'in_column',
        'in_repeat',
        'inner',
        'loose',
        'qty',
        'qty_cell',
        'ticket',
        'to_end',
      ].sort(),
    );
  });

  it('includes a name ONLY a reference uses — an orphan anchor', () => {
    const index = indexOf(
      'sections: { body: { type: flow, items: [ { type: ellipse, anchor: ghost } ] } }',
    );
    expect([...takenNames(index)]).toEqual(['ghost']);
  });
});
