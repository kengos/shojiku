// What entering a name means: the no-op and clear arms first (no coverage tool
// can see that they author nothing), then every refusal, then the rename
// cascade over all three reference spellings — applied to a real document so
// one undo is seen to restore the id AND its anchors together.

import { Editor, MAX_BATCH_OPS } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { followers, freshName, idEdit, MAX_ID_CHARS } from './idEdit';
import { buildIdIndex, type IdIndex } from './idIndex';

const DOC = `sections:
  header:
    items:
      - { type: text, id: head, text: Title }
  body:
    items:
      # the circled total
      - { type: text, id: total, text: "1,000" }
      - type: container
        items:
          - { type: text, id: inner, text: Inner }
          - { type: ellipse, anchor: total }
          - type: line
            from: { item: total, edge: left }
            to: { item: total, edge: right }
      - { type: text, text: Note }
      - type: table
        columns:
          - { id: qty, label: Qty }
          - label: Cell
            cell: { id: frame, items: [] }
`;

const TOTAL = 'sections.body.items[0]';
const NOTE = 'sections.body.items[2]';

function session(doc = DOC): { editor: Editor; index: () => IdIndex } {
  const editor = Editor.create(doc);
  return { editor, index: () => buildIdIndex((p) => editor.read(p)) };
}

describe('idEdit — what authors nothing', () => {
  it('an entry equal to the current id (after trimming) is a no-op', () => {
    const { index } = session();
    expect(idEdit(index(), TOTAL, 'total', '  total ')).toEqual({
      ok: true,
      ops: [],
      clears: false,
    });
  });

  it('an empty entry on an unnamed node is a no-op', () => {
    const { index } = session();
    expect(idEdit(index(), NOTE, undefined, '   ')).toEqual({ ok: true, ops: [], clears: false });
  });
});

describe('idEdit — clearing', () => {
  it('an empty entry removes the key and reports that it clears', () => {
    const { index } = session();
    expect(idEdit(index(), TOTAL, 'total', '')).toEqual({
      ok: true,
      ops: [{ op: 'removeKey', path: TOTAL, keys: ['id'] }],
      clears: true,
    });
  });
});

describe('idEdit — refusals', () => {
  it('refuses a name past the cap', () => {
    const { index } = session();
    expect(idEdit(index(), NOTE, undefined, 'x'.repeat(MAX_ID_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(idEdit(index(), NOTE, undefined, 'x'.repeat(MAX_ID_CHARS)).ok).toBe(true);
  });

  it('counts the cap in characters, so an emoji is one', () => {
    const { index } = session();
    // 120 emoji are 240 UTF-16 units — within the cap the message states.
    expect(idEdit(index(), NOTE, undefined, '🙂'.repeat(MAX_ID_CHARS)).ok).toBe(true);
    expect(idEdit(index(), NOTE, undefined, '🙂'.repeat(MAX_ID_CHARS + 1)).ok).toBe(false);
  });

  it('refuses a control character inside the name', () => {
    const { index } = session();
    expect(idEdit(index(), NOTE, undefined, 'a\nb')).toEqual({ ok: false, reason: 'control' });
    expect(idEdit(index(), NOTE, undefined, 'a\u007fb')).toEqual({ ok: false, reason: 'control' });
  });

  it('refuses any write over a truncated namespace — a CLEAR too', () => {
    const truncated = { holders: [], refs: [], truncated: true };
    expect(idEdit(truncated, NOTE, undefined, 'fresh')).toEqual({ ok: false, reason: 'truncated' });
    // A partial index counts no anchors, so a clear decided from it would skip
    // the confirm its anchors are owed.
    expect(idEdit(truncated, TOTAL, 'total', '')).toEqual({ ok: false, reason: 'truncated' });
  });

  it.each([
    ['an item elsewhere', 'total', TOTAL, 'text'],
    ['an item in another section', 'head', 'sections.header.items[0]', 'text'],
    ['a nested container child', 'inner', 'sections.body.items[1].items[0]', 'text'],
    ['a column', 'qty', 'sections.body.items[3].columns[0]', 'column'],
    ['a frame', 'frame', 'sections.body.items[3].columns[1].cell', 'cell_frame'],
  ])('refuses a name %s already carries, naming it', (_, name, holderPath, kind) => {
    const { index } = session();
    const edit = idEdit(index(), NOTE, undefined, name);
    expect(edit.ok).toBe(false);
    expect(edit).toMatchObject({ reason: 'duplicate', holder: { path: holderPath, kind } });
  });

  it('refuses a cascade over the batch cap, and accepts one exactly at it', () => {
    const doc = (n: number) =>
      [
        'sections:',
        '  body:',
        '    items:',
        '      - { type: text, id: a }',
        ...Array.from({ length: n }, () => '      - { type: ellipse, anchor: a }'),
      ].join('\n');
    expect(idEdit(session(doc(MAX_BATCH_OPS)).index(), TOTAL, 'a', 'b')).toEqual({
      ok: false,
      reason: 'too_many',
    });
    // 255 anchors + the id itself = 256 ops: the cap, accepted.
    const atCap = idEdit(session(doc(MAX_BATCH_OPS - 1)).index(), TOTAL, 'a', 'b');
    expect(atCap.ok && atCap.ops).toHaveLength(MAX_BATCH_OPS);
  });
});

describe('idEdit — naming and the rename cascade', () => {
  it('names an unnamed node with the trimmed entry, and nothing else', () => {
    const { index } = session();
    expect(idEdit(index(), NOTE, undefined, ' note ')).toEqual({
      ok: true,
      ops: [{ op: 'setScalar', path: NOTE, keys: ['id'], value: 'note' }],
      clears: false,
    });
  });

  it('a rename carries all three reference spellings, and one undo restores them all', () => {
    const { editor, index } = session();
    // Three leaves, two items: the line with both ends on `total` is one line.
    expect(followers(index(), 'total')).toBe(2);
    const edit = idEdit(index(), TOTAL, 'total', 'grand_total');
    expect(edit.ok).toBe(true);
    expect(edit.ok && edit.ops).toHaveLength(4);
    expect(edit.ok && editor.applyAll(edit.ops).ok).toBe(true);
    const text = editor.text();
    expect(text).toContain('id: grand_total');
    expect(text).toContain('anchor: grand_total');
    expect(text).toContain('from: { item: grand_total, edge: left }');
    expect(text).toContain('to: { item: grand_total, edge: right }');
    // Only the id and the three leaves changed: the comment and order stay.
    expect(text.replaceAll('grand_total', 'total')).toBe(Editor.create(DOC).text());
    editor.undo();
    expect(editor.text()).toBe(Editor.create(DOC).text());
  });

  it('a rename leaves anchors alone when another node also carries the old id', () => {
    const { index } = session(
      DOC.replace('{ type: text, text: Note }', '{ type: text, id: total, text: Note }'),
    );
    expect(followers(index(), 'total')).toBe(0);
    const edit = idEdit(index(), TOTAL, 'total', 'mine');
    expect(edit.ok && edit.ops).toEqual([
      { op: 'setScalar', path: TOTAL, keys: ['id'], value: 'mine' },
    ]);
  });

  it('counts no followers for an unnamed node', () => {
    const { index } = session();
    expect(followers(index(), undefined)).toBe(0);
  });
});

describe('freshName', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(freshName('total', new Set())).toBe('total');
    expect(freshName('total', new Set(['total']))).toBe('total_2');
    expect(freshName('total', new Set(['total', 'total_2', 'total_3']))).toBe('total_4');
  });

  it('counts on from a name that already ends in a number', () => {
    expect(freshName('total_2', new Set(['total_2']))).toBe('total_3');
    expect(freshName('total_2', new Set(['total_2', 'total_3']))).toBe('total_4');
  });

  it('cuts the stem so a minted name stays within the cap the field enforces', () => {
    const long = 'x'.repeat(MAX_ID_CHARS);
    const minted = freshName(long, new Set([long]));
    expect([...minted]).toHaveLength(MAX_ID_CHARS);
    expect(minted.endsWith('_2')).toBe(true);
    // In code points: an emoji stem is cut whole, never split.
    const emoji = '🙂'.repeat(MAX_ID_CHARS);
    expect([...freshName(emoji, new Set([emoji]))]).toHaveLength(MAX_ID_CHARS);
  });

  it('does not count on from a run longer than nine digits', () => {
    expect(freshName('a_1234567890', new Set(['a_1234567890']))).toBe('a_1234567890_2');
  });
});
