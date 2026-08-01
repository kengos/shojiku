// Tests for declCommit.ts — the ops one text-editor commit produces
// (text + declaration writes as ONE batch), incl. against a real document.
import { Editor, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { commitOps } from './declCommit';
import { mintDeclName } from './declMint';
import { readDeclarations } from './declModel';
import { MAX_TEXT_EXPRS } from './interpolate';

/** A read function over a flat path → materialized-value table. */
function readOf(doc: Record<string, unknown>): ReadFn {
  return (path) => doc[path];
}

const THROWS: ReadFn = () => {
  throw new Error('unreadable');
};

const ITEM = 'sections.body.items[0]';

describe('commitOps', () => {
  const read = readOf({
    [ITEM]: {
      type: 'text',
      text: '{f1} と {total}',
      bindings: { f1: { key: '品名' } },
    },
  });

  it('writes the text alone when nothing was staged', () => {
    const ops = commitOps({
      read: readOf({ [ITEM]: { type: 'text', text: 'a' } }),
      path: ITEM,
      oldText: 'a',
      newText: 'b',
      pending: [],
    });
    expect(ops).toEqual([{ op: 'setScalar', path: ITEM, keys: ['text'], value: 'b' }]);
  });

  it('clears the key when the text is emptied', () => {
    const ops = commitOps({
      read: readOf({ [ITEM]: { type: 'text', text: 'a' } }),
      path: ITEM,
      oldText: 'a',
      newText: '',
      pending: [],
    });
    expect(ops).toEqual([{ op: 'removeKey', path: ITEM, keys: ['text'] }]);
  });

  it('authors each staged declaration the new text references', () => {
    const ops = commitOps({
      read: readOf({ [ITEM]: { type: 'text', text: '' } }),
      path: ITEM,
      oldText: '',
      newText: '{f1} {shop}',
      pending: [
        { name: 'f1', key: '品名', scope: null },
        { name: 'shop', key: 'store_name', scope: 'document' },
      ],
    });
    expect(ops.slice(1)).toEqual([
      { op: 'putValue', path: ITEM, keys: ['bindings', 'f1'], value: { key: '品名' } },
      {
        op: 'putValue',
        path: ITEM,
        keys: ['bindings', 'shop'],
        value: { key: 'store_name', scope: 'document' },
      },
    ]);
  });

  it('drops a staged declaration the committed text does not reference', () => {
    // Inserted then deleted before the blur: nothing reaches the document.
    const ops = commitOps({
      read: readOf({ [ITEM]: { type: 'text', text: '' } }),
      path: ITEM,
      oldText: '',
      newText: 'plain',
      pending: [{ name: 'f1', key: '品名', scope: null }],
    });
    expect(ops).toHaveLength(1);
  });

  it('stages one op for a name picked twice', () => {
    const ops = commitOps({
      read: readOf({ [ITEM]: { type: 'text', text: '' } }),
      path: ITEM,
      oldText: '',
      newText: '{f1} {f1}',
      pending: [
        { name: 'f1', key: '品名', scope: null },
        { name: 'f1', key: '品名', scope: null },
      ],
    });
    expect(ops).toHaveLength(2);
  });

  it('writes nothing for a declaration the item already carries identically', () => {
    const ops = commitOps({
      read,
      path: ITEM,
      oldText: '{f1} と {total}',
      newText: '{f1} と {total}!',
      pending: [{ name: 'f1', key: '品名', scope: null }],
    });
    expect(ops).toHaveLength(1);
  });

  it('rewrites a declaration whose name now means something else', () => {
    const ops = commitOps({
      read,
      path: ITEM,
      oldText: '{f1}',
      newText: '{f1}',
      pending: [{ name: 'f1', key: 'other', scope: null }],
    });
    expect(ops[1]).toEqual({
      op: 'putValue',
      path: ITEM,
      keys: ['bindings', 'f1'],
      value: { key: 'other' },
    });
  });

  it('removes the declaration of a chip this edit deleted', () => {
    const ops = commitOps({
      read,
      path: ITEM,
      oldText: '{f1} と {total}',
      newText: '{total}',
      pending: [],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: ITEM, keys: ['text'], value: '{total}' },
      { op: 'removeKey', path: ITEM, keys: ['bindings', 'f1'] },
    ]);
  });

  it('keeps a declaration another surface of the item still references', () => {
    const linked = readOf({
      [ITEM]: {
        type: 'text',
        text: '{f1}',
        link: { url: 'https://example.test/{f1}' },
        bindings: { f1: { key: '品名' } },
      },
    });
    const ops = commitOps({ read: linked, path: ITEM, oldText: '{f1}', newText: '', pending: [] });
    expect(ops).toHaveLength(1);
  });

  it('keeps a declaration one of the item’s SPANS still references', () => {
    const spanned = readOf({
      [ITEM]: {
        type: 'text',
        text: '{f1}',
        spans: [{ text: 'prefix' }, { text: '{f1}' }],
        bindings: { f1: { key: '品名' } },
      },
    });
    const ops = commitOps({ read: spanned, path: ITEM, oldText: '{f1}', newText: '', pending: [] });
    expect(ops).toHaveLength(1);
  });

  it('leaves a declaration this edit never touched alone', () => {
    // Orphaned by someone else (the engine reports `unused_binding`): pruning
    // it here would be an edit the user did not make.
    const orphan = readOf({
      [ITEM]: { type: 'text', text: 'plain', bindings: { f1: { key: '品名' } } },
    });
    const ops = commitOps({
      read: orphan,
      path: ITEM,
      oldText: 'plain',
      newText: 'plainer',
      pending: [],
    });
    expect(ops).toHaveLength(1);
  });

  it('stands the prune down past the display-side expression cap', () => {
    // The GUI stops reading expressions at `MAX_TEXT_EXPRS`; the engine never
    // does. Past the cap a name can look unreferenced while the page still
    // resolves it, so dropping its declaration would break a live reference.
    const filler = Array.from({ length: MAX_TEXT_EXPRS }, (_, i) => `{k${i}}`).join('');
    const ops = commitOps({
      read,
      path: ITEM,
      oldText: `{f1}${filler}`,
      newText: filler,
      pending: [],
    });
    expect(ops).toHaveLength(1);
  });

  it('still prunes while the text stays under the cap', () => {
    const filler = Array.from({ length: MAX_TEXT_EXPRS - 2 }, (_, i) => `{k${i}}`).join('');
    const ops = commitOps({
      read,
      path: ITEM,
      oldText: `{f1}${filler}`,
      newText: filler,
      pending: [],
    });
    expect(ops[1]).toEqual({ op: 'removeKey', path: ITEM, keys: ['bindings', 'f1'] });
  });

  it('prunes nothing when the item cannot be read', () => {
    const ops = commitOps({
      read: THROWS,
      path: ITEM,
      oldText: '{f1}',
      newText: '',
      pending: [],
    });
    expect(ops).toEqual([{ op: 'removeKey', path: ITEM, keys: ['text'] }]);
  });
});

describe('the ops a commit produces against a real document', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: 合計',
    '',
  ].join('\n');

  it('authors the text and its declaration as ONE undo step', () => {
    const editor = Editor.create(SOURCE);
    const ops = commitOps({
      read: (path) => editor.read(path),
      path: ITEM,
      oldText: '合計',
      newText: '{f1} 合計',
      pending: [{ name: 'f1', key: '品名', scope: null }],
    });
    expect(editor.applyAll(ops).ok).toBe(true);
    expect(editor.text()).toContain('bindings:');
    expect(editor.text()).toContain('品名');
    editor.undo();
    expect(editor.text()).toBe(SOURCE);
  });

  it('serializes a digit-free invented name as a plain string key', () => {
    // A minted name never opens with a digit, so the declaration's key reads
    // back as the string the reference uses.
    const editor = Editor.create(SOURCE);
    const minted = mintDeclName('項目1', new Set());
    expect(
      editor.applyAll(
        commitOps({
          read: (path) => editor.read(path),
          path: ITEM,
          oldText: '合計',
          newText: minted.wire,
          pending: [{ name: minted.name, key: '項目1', scope: null }],
        }),
      ).ok,
    ).toBe(true);
    const round = Editor.create(editor.text());
    expect(readDeclarations((path) => round.read(path), ITEM).get(minted.name)).toEqual({
      key: '項目1',
      scope: null,
    });
  });

  it('removes the whole map when the last declaration is pruned', () => {
    const editor = Editor.create(SOURCE);
    const read: ReadFn = (path) => editor.read(path);
    editor.applyAll(
      commitOps({
        read,
        path: ITEM,
        oldText: '合計',
        newText: '{f1}',
        pending: [{ name: 'f1', key: '品名', scope: null }],
      }),
    );
    editor.applyAll(commitOps({ read, path: ITEM, oldText: '{f1}', newText: '合計', pending: [] }));
    expect(editor.text()).not.toContain('bindings');
    expect(editor.text()).toContain('合計');
  });
});
