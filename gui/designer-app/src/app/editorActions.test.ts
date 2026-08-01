import { describe, expect, it, vi } from 'vitest';
import { buildEditorActions, type EditorActionsContext } from './editorActions';

/** The context the actions close over, with every collaborator spied. Only the
 * fields the asserted handlers touch are populated — the rest stay absent, so
 * a handler that starts reading something new fails loudly here. */
function ctxOf(
  over: {
    readonly saveTarget?: string;
    readonly documentName?: string;
    readonly customName?: string;
  } = {},
) {
  const doc = {
    customName: over.customName,
    currentText: 'version: 1\n',
    defsEdits: undefined,
    setCustomName: vi.fn(),
    setCurrentText: vi.fn(),
    setSampleSet: vi.fn(),
    setStubDefinitions: vi.fn(),
    setDefsEdits: vi.fn(),
  };
  const save = { noteEdit: vi.fn(), saveToHost: vi.fn() };
  const persistDraft = vi.fn();
  const ctx = {
    props: { saveTarget: over.saveTarget, documentName: over.documentName, files: {} },
    doc,
    save,
    fonts: { restoreFonts: vi.fn() },
    listFonts: () => [],
    persistDraft,
    effectiveName: over.documentName,
  } as unknown as EditorActionsContext;
  return { actions: buildEditorActions(ctx), doc, save, persistDraft };
}

describe('handleChange', () => {
  it('notes the edit, updates the working copy AND persists the draft', () => {
    // All three, every time: a regression that drops the persist loses the
    // user's work on reload while every other symptom looks normal.
    const c = ctxOf();
    c.actions.handleChange('version: 1\nsections: {}\n');
    expect(c.save.noteEdit).toHaveBeenCalledTimes(1);
    expect(c.doc.setCurrentText).toHaveBeenCalledWith('version: 1\nsections: {}\n');
    expect(c.persistDraft).toHaveBeenCalledWith({ text: 'version: 1\nsections: {}\n' });
  });
});

describe('handleDefinitionsChange', () => {
  it('persists the effective text AND the ops behind it', () => {
    // A restored session re-applies the OPS over the live base; persisting only
    // the derived text would make it read as an authored source document.
    const c = ctxOf();
    const edits = [{ op: 'setScalar' }] as never;
    c.actions.handleDefinitionsChange('fields: {}\n', edits);
    expect(c.doc.setStubDefinitions).toHaveBeenCalledWith('fields: {}\n');
    expect(c.doc.setDefsEdits).toHaveBeenCalledWith(edits);
    expect(c.persistDraft).toHaveBeenCalledWith({
      definitions: 'fields: {}\n',
      definitionsEdits: edits,
    });
  });

  it('reports a FULL revert (edits back to empty), not just a shorter list', () => {
    // The append-only era let a `length > 0` gate swallow this transition; the
    // host must hear it or its dirty-tracking stays true.
    const c = ctxOf();
    c.actions.handleDefinitionsChange('fields: {}\n', [] as never);
    expect(c.doc.setDefsEdits).toHaveBeenCalledWith([]);
  });
});

describe('handleRename standalone (no save target)', () => {
  it('clears an existing override when renamed BACK to the default', () => {
    // Standalone: the title then keeps following the UI locale again. Needs a
    // real override in place — with none, `next` and `customName` are both
    // undefined and the guard below correctly makes it a no-op.
    const c = ctxOf({ documentName: '無題', customName: '見積書' });
    c.actions.handleRename('無題');
    expect(c.doc.setCustomName).toHaveBeenCalledWith(undefined);
    expect(c.persistDraft).toHaveBeenCalledWith({ name: undefined });
  });

  it('is a no-op when the default is committed and no override exists', () => {
    const c = ctxOf({ documentName: '無題' });
    c.actions.handleRename('無題');
    expect(c.doc.setCustomName).not.toHaveBeenCalled();
    expect(c.persistDraft).not.toHaveBeenCalled();
  });

  it('keeps a genuinely different name as an override', () => {
    const c = ctxOf({ documentName: '無題' });
    c.actions.handleRename('見積書');
    expect(c.doc.setCustomName).toHaveBeenCalledWith('見積書');
  });

  it('does nothing when the committed name is already the current one', () => {
    // A mere blur must not mint an undo step or a host save.
    const c = ctxOf({ documentName: '無題', customName: '見積書' });
    c.actions.handleRename('見積書');
    expect(c.doc.setCustomName).not.toHaveBeenCalled();
    expect(c.persistDraft).not.toHaveBeenCalled();
  });
});

describe('handleRename mounted (host save target)', () => {
  it('keeps the name EXPLICIT even when it equals the default', () => {
    // Mounted hosts treat entry names as host strings — a rename back to the
    // opened name must stay authored, not collapse to undefined.
    const c = ctxOf({ saveTarget: 'entry-1', documentName: '無題' });
    c.actions.handleRename('無題');
    expect(c.doc.setCustomName).toHaveBeenCalledWith('無題');
  });

  it('writes the rename through to the host', () => {
    const c = ctxOf({ saveTarget: 'entry-1', documentName: '無題' });
    c.actions.handleRename('見積書');
    expect(c.save.saveToHost).toHaveBeenCalledWith('entry-1', 'version: 1\n', '見積書');
  });

  it('does not reach the host when the name did not change', () => {
    const c = ctxOf({ saveTarget: 'entry-1', documentName: '無題', customName: '見積書' });
    c.actions.handleRename('見積書');
    expect(c.save.saveToHost).not.toHaveBeenCalled();
  });
});
