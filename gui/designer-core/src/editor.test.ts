import { describe, expect, it } from 'vitest';
import { MAX_TEMPLATE_BYTES, TemplateParseError } from './document';
import { Editor, type EditorChange, MAX_BATCH_OPS } from './editor';
import { MAX_HISTORY } from './history';
import type { Op } from './ops';
import { PathSyntaxError } from './path';

const FIXTURE = ['defaults:', '  locale: ja-JP', '  currency: JPY', ''].join('\n');

const ITEMS = [
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: 領収書',
  '      - type: rect',
  '        box: { x: 0, y: 0, w: 100, h: 20 }',
  '',
].join('\n');

describe('Editor.create', () => {
  it('throws on malformed source', () => {
    expect(() => Editor.create('a: [1, 2\n')).toThrow(TemplateParseError);
  });
});

describe('apply / undo / redo', () => {
  it('applies an op and reports it can be undone', () => {
    const ed = Editor.create(FIXTURE);
    expect(ed.canUndo()).toBe(false);
    const result = ed.apply({
      op: 'setScalar',
      path: 'defaults',
      keys: ['currency'],
      value: 'USD',
    });
    expect(result.ok).toBe(true);
    expect(ed.text()).toContain('currency: USD');
    expect(ed.canUndo()).toBe(true);
    expect(ed.canRedo()).toBe(false);
  });

  it('leaves history untouched when an op fails', () => {
    const ed = Editor.create(FIXTURE);
    const result = ed.apply({ op: 'removeKey', path: 'defaults', keys: ['missing'] });
    expect(result.ok).toBe(false);
    expect(ed.canUndo()).toBe(false);
    expect(ed.text()).toBe(FIXTURE);
  });

  it('undoes and redoes a change byte-exactly', () => {
    const ed = Editor.create(FIXTURE);
    ed.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' });
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(FIXTURE);
    expect(ed.canRedo()).toBe(true);
    expect(ed.redo()).toBe(true);
    expect(ed.text()).toContain('currency: USD');
  });

  it('undoes an insertItem and a removeItem byte-exactly', () => {
    const ed = Editor.create(ITEMS);
    const inserted = ed.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: 2,
      value: { type: 'text', text: 'テキスト' },
    });
    expect(inserted.ok).toBe(true);
    expect(ed.text()).toContain('text: テキスト');
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
    const removed = ed.apply({ op: 'removeItem', path: 'sections.body.items', index: 0 });
    expect(removed.ok).toBe(true);
    expect(ed.text()).not.toContain('領収書');
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
  });

  it('clears the redo stack on a fresh edit', () => {
    const ed = Editor.create(FIXTURE);
    ed.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' });
    ed.undo();
    expect(ed.canRedo()).toBe(true);
    ed.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'EUR' });
    expect(ed.canRedo()).toBe(false);
  });

  it('returns false when there is nothing to undo or redo', () => {
    const ed = Editor.create(FIXTURE);
    expect(ed.undo()).toBe(false);
    expect(ed.redo()).toBe(false);
  });

  it('caps the undo history at MAX_HISTORY', () => {
    const ed = Editor.create(FIXTURE);
    for (let i = 0; i <= MAX_HISTORY; i += 1) {
      ed.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: `C${i}` });
    }
    let undone = 0;
    while (ed.undo()) {
      undone += 1;
    }
    expect(undone).toBe(MAX_HISTORY);
  });
});

describe('applyAll', () => {
  it('lands a successful batch as a single undo step', () => {
    const ed = Editor.create(ITEMS);
    const result = ed.applyAll([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'x'], value: 8 },
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'y'], value: 9 },
    ]);
    expect(result.ok).toBe(true);
    expect(ed.text()).toContain('x: 8');
    expect(ed.text()).toContain('y: 9');
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
    expect(ed.undo()).toBe(false);
  });

  it('switches a text item from text to data atomically', () => {
    const ed = Editor.create(ITEMS);
    const before = ed.text();
    const result = ed.applyAll([
      { op: 'removeKey', path: 'sections.body.items[0]', keys: ['text'] },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['data', 'key'], value: 'title' },
    ]);
    expect(result.ok).toBe(true);
    const item = Editor.create(ed.text());
    expect(item.read('sections.body.items[0]')).toEqual({ type: 'text', data: { key: 'title' } });
    // One undo reverts the whole switch, not half of it.
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(before);
  });

  it('rolls back byte-exact and reports the failing index on a mid-batch error', () => {
    const ed = Editor.create(ITEMS);
    const before = ed.text();
    const result = ed.applyAll([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['box', 'x'], value: 8 },
      { op: 'removeKey', path: 'sections.body.items[1]', keys: ['nope'] },
    ]);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'key_not_found' }),
      index: 1,
    });
    expect(ed.text()).toBe(before);
    expect(ed.canUndo()).toBe(false);
  });

  it('rolls back a renameKey+setStrings batch byte-exact when the later op fails', () => {
    // The styles-registry rename batch shape: renameKey succeeds, then a
    // reference rewrite hits a missing path — the whole batch reverts (the
    // registry key must NOT be left renamed with references un-rewritten).
    const styled = [
      'styles:',
      '  heading: { fontSize: 24 }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: hi',
      '        styleNames: [ heading ]',
      '',
    ].join('\n');
    const ed = Editor.create(styled);
    const result = ed.applyAll([
      { op: 'renameKey', keys: ['styles', 'heading'], to: 'title' },
      { op: 'setStrings', path: 'sections.body.items[9]', keys: ['styleNames'], values: ['title'] },
    ]);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'path_not_found' }),
      index: 1,
    });
    // Byte-exact: the registry key is still `heading`, no partial rename.
    expect(ed.text()).toBe(styled);
    expect(ed.canUndo()).toBe(false);
  });

  it('rolls back a batch whose insertItem succeeds before a later op fails', () => {
    const ed = Editor.create(ITEMS);
    const result = ed.applyAll([
      {
        op: 'insertItem',
        path: 'sections.body.items',
        index: 2,
        value: { type: 'text', text: 'テキスト' },
      },
      { op: 'removeItem', path: 'sections.body.items', index: 9 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'index_out_of_range' }),
      index: 1,
    });
    expect(ed.text()).toBe(ITEMS);
  });

  it('rejects a batch over the op cap without mutating', () => {
    const ed = Editor.create(ITEMS);
    const ops: Op[] = Array.from({ length: MAX_BATCH_OPS + 1 }, () => ({
      op: 'setScalar',
      path: 'sections.body.items[1]',
      keys: ['box', 'x'],
      value: 1,
    }));
    const result = ed.applyAll(ops);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_value' }),
      index: 0,
    });
    expect(ed.text()).toBe(ITEMS);
  });

  it('treats an empty batch as a no-op with no history entry', () => {
    const ed = Editor.create(ITEMS);
    expect(ed.applyAll([])).toEqual({ ok: true });
    expect(ed.canUndo()).toBe(false);
    expect(ed.text()).toBe(ITEMS);
  });
});

describe('read', () => {
  it('materializes the subtree at a path', () => {
    const ed = Editor.create(ITEMS);
    expect(ed.read('sections.body.items[1].box')).toEqual({ x: 0, y: 0, w: 100, h: 20 });
  });

  it('reads a missing node as undefined', () => {
    const ed = Editor.create(ITEMS);
    expect(ed.read('sections.body.items[0].box')).toBeUndefined();
  });

  it('caps an alias bomb instead of hanging', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]',
      'boom: [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]',
      '',
    ].join('\n');
    const ed = Editor.create(bomb);
    expect(() => ed.read('boom')).toThrow(TemplateParseError);
  });

  it('does not pollute Object.prototype when a __proto__ key is present', () => {
    const ed = Editor.create(['evil:', '  __proto__:', '    polluted: true', ''].join('\n'));
    ed.read('evil');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('reads a leaf back after setScalar replaced a COLLECTION value (raw-leaf read)', () => {
    // `map.set` stores the op's raw scalar when the key previously held a
    // collection (a `columns` track list rewritten to a count) — the read must
    // see the written value, not undefined.
    const ed = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: container',
        '        box: { type: grid, columns: ["30%", "70%"] }',
        '',
      ].join('\n'),
    );
    const path = 'sections.body.items[0]';
    expect(ed.apply({ op: 'setScalar', path, keys: ['box', 'columns'], value: 3 }).ok).toBe(true);
    expect(ed.read(`${path}.box.columns`)).toBe(3);
  });
});

describe('selection', () => {
  it('starts empty', () => {
    expect(Editor.create(FIXTURE).selection()).toBeNull();
  });

  it('canonicalizes a selected path', () => {
    const ed = Editor.create(FIXTURE);
    ed.select('sections.body.items[0]');
    expect(ed.selection()).toBe('sections.body.items[0]');
  });

  it('rejects a malformed path', () => {
    const ed = Editor.create(FIXTURE);
    expect(() => ed.select('sections.[0]')).toThrow(PathSyntaxError);
  });

  it('clears the selection', () => {
    const ed = Editor.create(FIXTURE);
    ed.select('defaults');
    ed.clearSelection();
    expect(ed.selection()).toBeNull();
  });
});

/** A valid template whose UTF-8 size exceeds `bytes` via one long comment. */
function templateOverBytes(bytes: number): string {
  return `#${'x'.repeat(bytes)}\n${ITEMS}`;
}

describe('configurable template-size cap', () => {
  it('rejects an over-default source without a raised cap, accepts it with one', () => {
    const big = templateOverBytes(MAX_TEMPLATE_BYTES);
    expect(() => Editor.create(big)).toThrow(TemplateParseError);
    const raised = MAX_TEMPLATE_BYTES * 2;
    const ed = Editor.create(big, { maxBytes: raised });
    expect(ed.text()).toBe(big);
    expect(ed.maxBytes()).toBe(raised);
  });

  it('re-parses undo and redo under the raised cap after a large insert', () => {
    const raised = MAX_TEMPLATE_BYTES * 2;
    // Start small, then insert an item carrying an over-default-size src so the
    // committed document only parses under the raised cap. Undo/redo re-parse
    // the snapshots — they must use the session cap, not the 2 MiB default.
    const ed = Editor.create(ITEMS, { maxBytes: raised });
    const big = 'data:image/png;base64,'.concat('A'.repeat(MAX_TEMPLATE_BYTES));
    const inserted = ed.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: { type: 'image', box: { w: 40, h: 40 }, src: big },
    });
    expect(inserted.ok).toBe(true);
    const grown = ed.text();
    expect(new TextEncoder().encode(grown).length).toBeGreaterThan(MAX_TEMPLATE_BYTES);
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
    expect(ed.redo()).toBe(true);
    expect(ed.text()).toBe(grown);
  });

  it('rolls back an over-default document byte-exact under the raised cap', () => {
    const raised = MAX_TEMPLATE_BYTES * 2;
    const big = 'data:image/png;base64,'.concat('A'.repeat(MAX_TEMPLATE_BYTES));
    const ed = Editor.create(ITEMS, { maxBytes: raised });
    ed.apply({
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: { type: 'image', box: { w: 40, h: 40 }, src: big },
    });
    const before = ed.text();
    // A batch whose second op fails rolls back by re-parsing `before` — which is
    // over the default cap, so the rollback parse must use the session cap.
    const result = ed.applyAll([
      { op: 'setScalar', path: 'sections.body.items[1]', keys: ['text'], value: 'ok' },
      { op: 'setScalar', path: 'nope[9]', keys: ['x'], value: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(ed.text()).toBe(before);
  });

  it('adopts a raised cap mid-session without discarding history', () => {
    const ed = Editor.create(ITEMS);
    ed.apply({ op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'X' });
    expect(ed.canUndo()).toBe(true);
    ed.setMaxBytes(MAX_TEMPLATE_BYTES * 3);
    expect(ed.maxBytes()).toBe(MAX_TEMPLATE_BYTES * 3);
    expect(ed.canUndo()).toBe(true);
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
  });

  it('clamps a hostile mid-session cap to the default floor', () => {
    const ed = Editor.create(ITEMS);
    ed.setMaxBytes(Number.NaN);
    expect(ed.maxBytes()).toBe(MAX_TEMPLATE_BYTES);
  });
});

describe('selection travels with undo/redo', () => {
  it('restores the pre-move selection on undo and the post-move selection on redo', () => {
    const ed = Editor.create(ITEMS);
    // The user is on the first item, then moves it to the end; the Designer
    // selects the destination after a reorder.
    ed.select('sections.body.items[0]');
    expect(ed.apply({ op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 }).ok).toBe(true);
    ed.select('sections.body.items[1]');
    expect(ed.undo()).toBe(true);
    // Undo restores the text AND the selection as it was before the move.
    expect(ed.selection()).toBe('sections.body.items[0]');
    expect(ed.redo()).toBe(true);
    expect(ed.selection()).toBe('sections.body.items[1]');
  });

  it('undoes a CROSS-SEQUENCE move byte-exactly, restoring BOTH sequences', () => {
    const source = [
      'sections:',
      '  body:',
      '    items:',
      '      - type: text',
      '        text: 領収書',
      '      - type: container',
      '        items:',
      '          - type: text',
      '            text: inner',
      '',
    ].join('\n');
    const ed = Editor.create(source);
    ed.select('sections.body.items[0]');
    expect(
      ed.apply({
        op: 'moveItem',
        path: 'sections.body.items',
        from: 0,
        to: 1,
        toPath: 'sections.body.items[1].items',
      }).ok,
    ).toBe(true);
    ed.select('sections.body.items[0].items[1]');
    expect(ed.text()).not.toBe(source);
    expect(ed.undo()).toBe(true);
    // Both the sequence it left and the one it joined are back, byte-exactly,
    // and the selection is where the user was before the move.
    expect(ed.text()).toBe(source);
    expect(ed.selection()).toBe('sections.body.items[0]');
    expect(ed.redo()).toBe(true);
    expect(ed.selection()).toBe('sections.body.items[0].items[1]');
  });

  it('re-selects an inserted item on redo of an undone insert', () => {
    const ed = Editor.create(ITEMS);
    ed.select('sections.body.items[0]');
    expect(
      ed.apply({
        op: 'insertItem',
        path: 'sections.body.items',
        index: 2,
        value: { type: 'text', text: 'x' },
      }).ok,
    ).toBe(true);
    // The Designer selects the newly inserted item.
    ed.select('sections.body.items[2]');
    expect(ed.undo()).toBe(true);
    expect(ed.selection()).toBe('sections.body.items[0]');
    expect(ed.redo()).toBe(true);
    // Redo re-creates the item AND re-selects it.
    expect(ed.selection()).toBe('sections.body.items[2]');
  });

  it('restores a null pre-edit selection on undo', () => {
    const ed = Editor.create(ITEMS);
    // No selection before the edit.
    expect(
      ed.apply({ op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'z' }).ok,
    ).toBe(true);
    ed.select('sections.body.items[0]');
    expect(ed.undo()).toBe(true);
    expect(ed.selection()).toBeNull();
  });

  it('records ONE entry with the pre-batch selection for an applyAll batch', () => {
    const ed = Editor.create(ITEMS);
    ed.select('sections.body.items[0]');
    const result = ed.applyAll([
      { op: 'removeKey', path: 'sections.body.items[0]', keys: ['text'] },
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['data', 'key'], value: 'name' },
    ]);
    expect(result.ok).toBe(true);
    ed.select('sections.body.items[1]');
    expect(ed.undo()).toBe(true);
    // One undo reverts the whole batch and restores the pre-batch selection.
    expect(ed.selection()).toBe('sections.body.items[0]');
    expect(ed.undo()).toBe(false);
  });

  it('does not push a history entry for a selection change alone', () => {
    const ed = Editor.create(ITEMS);
    ed.select('sections.body.items[0]');
    ed.clearSelection();
    ed.select('sections.body.items[1]');
    expect(ed.canUndo()).toBe(false);
  });

  it('restores the selection to the deleted item on undo of a removeItem', () => {
    const ed = Editor.create(ITEMS);
    // The Designer removes the SELECTED (last) item, then moves the selection to
    // the previous sibling — undo must bring back the item AND put the selection
    // on it (a path distinct from the sibling's, so this discriminates).
    ed.select('sections.body.items[1]');
    expect(ed.apply({ op: 'removeItem', path: 'sections.body.items', index: 1 }).ok).toBe(true);
    ed.select('sections.body.items[0]');
    expect(ed.undo()).toBe(true);
    expect(ed.text()).toBe(ITEMS);
    expect(ed.selection()).toBe('sections.body.items[1]');
    // Redo removes it again and returns the selection to the sibling.
    expect(ed.redo()).toBe(true);
    expect(ed.selection()).toBe('sections.body.items[0]');
  });
});

describe('subscribe', () => {
  const setText: Op = {
    op: 'setScalar',
    path: 'sections.body.items[0]',
    keys: ['text'],
    value: 'x',
  };

  it('reports a single apply with the op that landed', () => {
    const ed = Editor.create(ITEMS);
    const seen: EditorChange[] = [];
    ed.subscribe((change) => seen.push(change));
    expect(ed.apply(setText).ok).toBe(true);
    expect(seen).toEqual([{ ops: [setText], source: 'apply' }]);
  });

  it('reports a batch ONCE, carrying every op', () => {
    const ed = Editor.create(ITEMS);
    const seen: EditorChange[] = [];
    ed.subscribe((change) => seen.push(change));
    const ops: Op[] = [
      setText,
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['id'], value: 'a' },
    ];
    expect(ed.applyAll(ops).ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].source).toBe('batch');
    expect(seen[0].ops).toEqual(ops);
  });

  it('does not report a refused op', () => {
    const ed = Editor.create(ITEMS);
    const seen: EditorChange[] = [];
    ed.subscribe((change) => seen.push(change));
    // A move out of range is rejected, so nothing committed and nothing to report.
    expect(ed.apply({ op: 'moveItem', path: 'sections.body.items', from: 0, to: 9 }).ok).toBe(
      false,
    );
    expect(seen).toEqual([]);
  });

  it('does not report a rolled-back batch, nor an empty one', () => {
    const ed = Editor.create(ITEMS);
    const seen: EditorChange[] = [];
    ed.subscribe((change) => seen.push(change));
    const result = ed.applyAll([setText, { op: 'moveItem', path: 'nope.items', from: 0, to: 1 }]);
    expect(result.ok).toBe(false);
    expect(ed.applyAll([]).ok).toBe(true);
    expect(seen).toEqual([]);
  });

  it('reports history moves with no ops', () => {
    const ed = Editor.create(ITEMS);
    expect(ed.apply(setText).ok).toBe(true);
    const seen: EditorChange[] = [];
    ed.subscribe((change) => seen.push(change));
    expect(ed.undo()).toBe(true);
    expect(ed.redo()).toBe(true);
    // A no-op history move at the end of the stack reports nothing.
    expect(ed.redo()).toBe(false);
    expect(seen).toEqual([
      { ops: [], source: 'undo' },
      { ops: [], source: 'redo' },
    ]);
  });

  it('sees the POST-edit document from inside the listener', () => {
    const ed = Editor.create(ITEMS);
    let textAtNotify = '';
    ed.subscribe(() => {
      textAtNotify = ed.text();
    });
    expect(ed.apply(setText).ok).toBe(true);
    expect(textAtNotify).toBe(ed.text());
    expect(textAtNotify).toContain('text: x');
  });

  it('stops reporting after unsubscribe, leaving other listeners subscribed', () => {
    const ed = Editor.create(ITEMS);
    const a: EditorChange[] = [];
    const b: EditorChange[] = [];
    const off = ed.subscribe((change) => a.push(change));
    ed.subscribe((change) => b.push(change));
    expect(ed.apply(setText).ok).toBe(true);
    off();
    expect(ed.apply({ ...setText, value: 'y' }).ok).toBe(true);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });
});
