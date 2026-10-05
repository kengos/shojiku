// A copy takes its own ids: a single item, a group whose anchor points INSIDE
// the copy (rewired), an anchor pointing OUTSIDE it (left alone), a name an
// orphan anchor still uses (never minted), a copy that carries no id (no extra
// ops), a partial DOCUMENT namespace (ids removed, never guessed), a copy that
// cannot be read whole (refused), and the batch cap on both sides — each
// applied to a real document where the result can be read back.

import { Editor, MAX_BATCH_OPS, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { MAX_TREE_DEPTH } from '../tree/model';
import { type CopyIds, copyIdOps, duplicateOps } from './copyIds';
import { MAX_ID_WALK_NODES } from './walk';

const DOC = `sections:
  body:
    items:
      - { type: text, id: total, text: Total }
      - type: container
        id: answer
        items:
          - { type: text, id: yes, text: "Yes" }
          - { type: ellipse, anchor: yes }
          - { type: ellipse, anchor: total }
      - { type: text, text: Plain }
      - type: table
        columns:
          - { id: qty, label: Qty }
`;

const BODY = 'sections.body.items';

/** The ops of an accepted copy (fails the test on a refusal). */
function opsOf(result: CopyIds): readonly Op[] {
  if (!result.ok) {
    throw new Error(`refused: ${result.reason}`);
  }
  return result.ops;
}

function duplicate(doc: string, index: number, parent = BODY): Editor {
  const editor = Editor.create(doc);
  expect(editor.applyAll(opsOf(duplicateOps((p) => editor.read(p), parent, index))).ok).toBe(true);
  return editor;
}

describe('duplicateOps', () => {
  it('gives a copied item the next free name', () => {
    const editor = duplicate(DOC, 0);
    expect(editor.read(`${BODY}[0]`)).toMatchObject({ id: 'total' });
    expect(editor.read(`${BODY}[1]`)).toMatchObject({ id: 'total_2' });
  });

  it('rewires an anchor inside the copy to the copy, and leaves one pointing outside', () => {
    const editor = duplicate(DOC, 1);
    expect(editor.read(`${BODY}[2]`)).toEqual({
      type: 'container',
      id: 'answer_2',
      items: [
        { type: 'text', id: 'yes_2', text: 'Yes' },
        { type: 'ellipse', anchor: 'yes_2' },
        { type: 'ellipse', anchor: 'total' },
      ],
    });
    // The original is untouched.
    expect(editor.read(`${BODY}[1]`)).toMatchObject({ id: 'answer' });
  });

  it('never mints a name an orphan anchor still uses', () => {
    // `total_2` is held by no node, so that ellipse draws nothing today;
    // minting it for the copy would silently attach the orphan to the copy.
    const orphan = DOC.replace('anchor: total }', 'anchor: total_2 }');
    const editor = duplicate(orphan, 0);
    expect(editor.read(`${BODY}[1]`)).toMatchObject({ id: 'total_3' });
  });

  it('is one undo step', () => {
    const editor = duplicate(DOC, 1);
    editor.undo();
    expect(editor.text()).toBe(Editor.create(DOC).text());
  });

  it('adds nothing to a plain duplicate when the copy carries no id', () => {
    const editor = Editor.create(DOC);
    expect(duplicateOps((p) => editor.read(p), BODY, 2)).toEqual({
      ok: true,
      ops: [{ op: 'duplicateItem', path: BODY, index: 2 }],
    });
  });

  it('renames a duplicated column', () => {
    const editor = duplicate(DOC, 0, `${BODY}[3].columns`);
    expect(editor.read(`${BODY}[3].columns[1]`)).toEqual({ id: 'qty_2', label: 'Qty' });
  });

  it('refuses when the original cannot be read — its ids cannot be seen to rename', () => {
    const refused = duplicateOps(
      () => {
        throw new Error('alias cap');
      },
      BODY,
      0,
    );
    expect(refused).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('copyIdOps', () => {
  const EMPTY = { holders: [], refs: [], truncated: false };
  // A namespace where `g` is already taken.
  const TAKEN = {
    holders: [{ path: `${BODY}[0]`, id: 'g', kind: 'text', label: null }],
    refs: [],
    truncated: false,
  };

  it('gives a subtree that names the same id twice one fresh name each, anchors to the first', () => {
    const result = copyIdOps(
      {
        type: 'container',
        items: [
          { type: 'text', id: 'g' },
          { type: 'text', id: 'g' },
          { type: 'ellipse', anchor: 'g' },
        ],
      },
      `${BODY}[1]`,
      TAKEN,
    );
    expect(opsOf(result)).toEqual([
      { op: 'setScalar', path: `${BODY}[1].items[0]`, keys: ['id'], value: 'g_2' },
      { op: 'setScalar', path: `${BODY}[1].items[1]`, keys: ['id'], value: 'g_3' },
      { op: 'setScalar', path: `${BODY}[1].items[2]`, keys: ['anchor'], value: 'g_2' },
    ]);
  });

  it('removes every copy id when the DOCUMENT namespace is partial', () => {
    const result = copyIdOps(
      { type: 'container', id: 'g', items: [{ type: 'text', id: 'h' }] },
      `${BODY}[1]`,
      { holders: [], refs: [], truncated: true },
    );
    expect(opsOf(result)).toEqual([
      { op: 'removeKey', path: `${BODY}[1]`, keys: ['id'] },
      { op: 'removeKey', path: `${BODY}[1].items[0]`, keys: ['id'] },
    ]);
  });

  it('refuses a copy too deep to walk whole', () => {
    let nested: unknown = { type: 'text', id: 'deep' };
    for (let n = 0; n <= MAX_TREE_DEPTH + 1; n++) {
      nested = { type: 'container', items: [nested] };
    }
    expect(copyIdOps(nested, `${BODY}[1]`, EMPTY)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses a copy past the walk budget', () => {
    const items = Array.from({ length: MAX_ID_WALK_NODES + 1 }, () => ({ type: 'rect' }));
    expect(copyIdOps({ type: 'container', items }, `${BODY}[1]`, EMPTY)).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('accepts a batch that, with its creating op, is exactly the cap — and refuses one more', () => {
    const items = Array.from({ length: MAX_BATCH_OPS }, (_, n) => ({ type: 'text', id: `t${n}` }));
    expect(copyIdOps({ type: 'container', items }, `${BODY}[1]`, EMPTY)).toEqual({
      ok: false,
      reason: 'too_many',
    });
    const atCap = copyIdOps({ type: 'container', items: items.slice(1) }, `${BODY}[1]`, EMPTY);
    expect(opsOf(atCap)).toHaveLength(MAX_BATCH_OPS - 1);
  });
});
