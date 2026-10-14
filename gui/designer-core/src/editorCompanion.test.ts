// The Editor's companion channel: a host document kept beside the template
// (the Designer's definitions edits) that every history entry snapshots, a
// step that changes it with or without template ops — one undo/redo either
// way — and the effect a step records, reported by the undo/redo that crosses
// it in both directions and readable before undoing.
import { describe, expect, it } from 'vitest';
import { Editor, type EditorChange } from './editor';

const SOURCE = 'defaults:\n  locale: ja-JP\n';
type Effect = { readonly kind: string };

function editor() {
  return Editor.create<readonly string[], Effect>(SOURCE, { companion: ['seed'] });
}

describe('Editor companion', () => {
  it('defaults to undefined and seeds from the options', () => {
    expect(Editor.create(SOURCE).companion()).toBeUndefined();
    expect(editor().companion()).toEqual(['seed']);
  });

  it('a companion-only step is one undo step, with its effect reported both ways', () => {
    const ed = editor();
    const seen: EditorChange<Effect>[] = [];
    ed.subscribe((change) => seen.push(change));
    expect(ed.applyAll([], { companion: ['next'], effect: { kind: 'edit' } })).toEqual({
      ok: true,
    });
    expect(ed.companion()).toEqual(['next']);
    expect(ed.text()).toBe(SOURCE);
    expect(ed.undoEffect()).toEqual({ kind: 'edit' });
    expect(ed.undo()).toBe(true);
    expect(ed.companion()).toEqual(['seed']);
    expect(ed.undoEffect()).toBeUndefined();
    expect(ed.redo()).toBe(true);
    expect(ed.companion()).toEqual(['next']);
    expect(seen).toEqual([
      { ops: [], source: 'batch', effect: { kind: 'edit' } },
      { ops: [], source: 'undo', effect: { kind: 'edit' } },
      { ops: [], source: 'redo', effect: { kind: 'edit' } },
    ]);
  });

  it('template ops and a companion change land together and revert together', () => {
    const ed = editor();
    const ops = [{ op: 'setScalar', path: 'defaults', keys: ['locale'], value: 'en-US' }] as const;
    expect(ed.applyAll(ops, { companion: ['renamed'], effect: { kind: 'rename' } }).ok).toBe(true);
    // A plain template edit afterwards keeps the companion and records no effect.
    ed.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'JPY' });
    expect(ed.undoEffect()).toBeUndefined();
    expect(ed.companion()).toEqual(['renamed']);
    ed.undo();
    expect(ed.companion()).toEqual(['renamed']);
    expect(ed.undoEffect()).toEqual({ kind: 'rename' });
    ed.undo();
    expect(ed.text()).toBe(SOURCE);
    expect(ed.companion()).toEqual(['seed']);
    ed.redo();
    expect(ed.text()).toContain('en-US');
    expect(ed.companion()).toEqual(['renamed']);
  });

  it('a step without an effect reports none, and an empty stack has no effect', () => {
    const ed = editor();
    expect(ed.undoEffect()).toBeUndefined();
    const seen: EditorChange<Effect>[] = [];
    ed.subscribe((change) => seen.push(change));
    ed.applyAll([], { companion: ['quiet'] });
    expect(seen).toEqual([{ ops: [], source: 'batch' }]);
    expect(ed.canUndo()).toBe(true);
  });
});
