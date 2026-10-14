// Rename / delete as ONE action over the three live documents, through the real
// hooks that own them (the template editor whose history carries the
// definitions edit list, the sample set): one step on the ONE undo stack, so a
// single toolbar Undo reverts template, definitions and samples together and
// Redo re-applies all three; the data-item editor's undo walks the same stack
// but only takes back a definitions step; the edit-list cap; a refused batch.

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_DEFS_EDITS } from '../data/defsPlan';
import type { DefsEdits, DefsEffect } from '../data/defsStep';
import { type DefsNode, readDefsTree } from '../data/defsTree';
import { SELECTION_SEP } from '../data/editorModel';
import { findNode } from '../data/treeModel';
import { useEditor } from '../editor/useEditor';
import type { SampleSet } from '../sample/variants';
import { useDefinitionsOwnership } from './useDefinitionsOwnership';
import { useDefsRestructure } from './useDefsRestructure';
import { useDefsStepSamples } from './useDefsStepSamples';
import { useSampleData } from './useSampleData';

const DEFS = 'type: object\nproperties:\n  total: { type: number }\n  note: { type: string }\n';
const TEMPLATE =
  'sections:\n  body:\n    type: flow\n    items:\n      - { type: text, text: "合計 {total}" }\n';
const SET: SampleSet = {
  active: 'default',
  variants: [
    { id: 'default', text: '{"total": 1, "note": "a"}', origin: 'preset' },
    { id: 'other', text: '{"total": 2, "note": "b"}', origin: 'user', name: 'other' },
  ],
};

function useAll(
  definitions: string | undefined,
  maxBytes: number,
  onDefinitionsChange = vi.fn(),
  sampleDataReadOnly = false,
) {
  const editor = useEditor<DefsEdits, DefsEffect>(TEMPLATE, maxBytes, []);
  const sample = useSampleData({
    initialParams: '',
    initialSampleSet: SET,
    onSampleSetChange: undefined,
    onParamsChange: undefined,
    definitions,
    sampleDataReadOnly,
  });
  useDefsStepSamples(editor, sample, sampleDataReadOnly);
  const defs = useDefinitionsOwnership({
    definitions,
    stub: sample.stub,
    editor,
    onDefinitionsChange,
  });
  const restructure = useDefsRestructure({
    editor,
    sample,
    defs,
    maxBytes,
    sampleReadOnly: sampleDataReadOnly,
  });
  return { editor, sample, defs, restructure };
}

function nodeOf(text: string | undefined, ...keys: string[]): DefsNode {
  const tree = readDefsTree(text ?? '');
  const found = tree === null ? null : findNode(tree, keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

const keysOf = (text: string) => Object.keys(JSON.parse(text) as object);
const sampleKeys = (set: SampleSet) => set.variants.map((variant) => keysOf(variant.text));

describe('useDefsRestructure', () => {
  it('one toolbar Undo reverts a rename in all three documents, and Redo re-applies it', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(
        result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand'),
      ).toBeNull();
    });
    expect(result.current.editor.text).toContain('合計 {grand}');
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['grand', 'note'],
      ['grand', 'note'],
    ]);
    expect(result.current.defs.effectiveDefinitions).toContain('grand: { type: number }');
    act(() => result.current.editor.undo());
    // The template's key and the definitions agree again: no undefined data key.
    expect(result.current.editor.text).toBe(TEMPLATE);
    expect(result.current.defs.edits).toEqual([]);
    expect(result.current.defs.effectiveDefinitions).toBe(DEFS);
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['total', 'note'],
      ['total', 'note'],
    ]);
    expect(result.current.editor.canUndo).toBe(false);
    act(() => result.current.editor.redo());
    expect(result.current.editor.text).toContain('合計 {grand}');
    expect(result.current.defs.effectiveDefinitions).toContain('grand: { type: number }');
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['grand', 'note'],
      ['grand', 'note'],
    ]);
  });

  it('an undone rename keeps a sample value edited since, under the old name', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand');
    });
    act(() => result.current.sample.applyParamsEdit('{"grand": 9, "note": "a"}'));
    act(() => result.current.editor.undo());
    expect(JSON.parse(result.current.sample.params)).toEqual({ total: 9, note: 'a' });
  });

  it('the data-item editor undo takes back only a definitions step, newest first', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand');
    });
    act(() => {
      result.current.defs.editDefinition({
        op: 'setScalar',
        keys: ['properties', 'grand', 'title'],
        value: '合計',
      });
    });
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
    });
    expect(result.current.defs.effectiveDefinitions).not.toContain('合計');
    act(() => {
      result.current.editor.applyAll([
        {
          op: 'insertItem',
          path: 'sections.body.items',
          index: 1,
          value: { type: 'text', text: 'later' },
        },
      ]);
    });
    // The newest step is a template edit: the definitions undo leaves it alone.
    act(() => {
      expect(result.current.restructure.undo()).toBe(false);
    });
    expect(result.current.editor.text).toContain('later');
    act(() => result.current.editor.undo());
    act(() => {
      expect(result.current.restructure.undo()).toEqual(['properties', 'total']);
    });
    expect(result.current.editor.text).toBe(TEMPLATE);
    expect(result.current.defs.effectiveDefinitions).toBe(DEFS);
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['total', 'note'],
      ['total', 'note'],
    ]);
  });

  it('deletes from the definitions and every variant, leaving the template, and undoes/redoes it', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(result.current.restructure.remove(nodeOf(DEFS, 'properties', 'total'))).toBeNull();
    });
    expect(result.current.editor.text).toBe(TEMPLATE);
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([['note'], ['note']]);
    expect(result.current.defs.effectiveDefinitions).not.toContain('total');
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
    });
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['total', 'note'],
      ['total', 'note'],
    ]);
    expect(result.current.defs.effectiveDefinitions).toBe(DEFS);
    act(() => result.current.editor.redo());
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([['note'], ['note']]);
    expect(result.current.defs.effectiveDefinitions).not.toContain('total');
  });

  it('a workshop rename keeps the edits on the re-inferred field', () => {
    const { result } = renderHook(() => useAll(undefined, 1_048_576));
    const stub = result.current.defs.effectiveDefinitions;
    act(() => {
      result.current.defs.editDefinition({
        op: 'setScalar',
        keys: ['properties', 'total', 'title'],
        value: '合計',
      });
    });
    act(() => {
      result.current.restructure.rename(nodeOf(stub, 'properties', 'total'), 'grand');
    });
    const tree = readDefsTree(result.current.defs.effectiveDefinitions ?? '');
    expect(tree?.children.map((child) => [child.name, child.label])).toEqual([
      ['grand', '合計'],
      ['note', ''],
    ]);
  });

  it('refuses a plain edit past the edit-list cap, and a plan refusal changes nothing', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      for (let i = 0; i < MAX_DEFS_EDITS; i++) {
        expect(
          result.current.defs.editDefinition({
            op: 'setScalar',
            keys: ['properties', `f${i}`, 'title'],
            value: 'x',
          }),
        ).toBe(true);
      }
    });
    act(() => {
      expect(
        result.current.defs.editDefinition({
          op: 'setScalar',
          keys: ['properties', 'over', 'title'],
          value: 'x',
        }),
      ).toBe(false);
    });
    expect(result.current.defs.edits).toHaveLength(MAX_DEFS_EDITS);
    act(() => {
      expect(result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand')).toBe(
        'edit_cap',
      );
    });
    expect(result.current.editor.text).toBe(TEMPLATE);
  });
});

describe('useDefsRestructure — a template batch the editor refuses', () => {
  it('changes nothing else when the template half does not land', () => {
    const { result } = renderHook(() => {
      const all = useAll(DEFS, 1_048_576);
      const refusing = {
        ...all.editor,
        applyAll: () => ({
          ok: false as const,
          error: { code: 'invalid_value' as const, message: 'x' },
          index: 0,
        }),
      };
      return {
        ...all,
        refused: useDefsRestructure({
          ...all,
          editor: refusing,
          maxBytes: 1_048_576,
          sampleReadOnly: false,
        }),
      };
    });
    act(() => {
      expect(result.current.refused.rename(nodeOf(DEFS, 'properties', 'total'), 'grand')).toBe(
        'too_large',
      );
    });
    expect(result.current.defs.edits).toEqual([]);
    expect(sampleKeys(result.current.sample.sampleSet)).toEqual([
      ['total', 'note'],
      ['total', 'note'],
    ]);
  });
});

describe('useDefsRestructure — the quiet arms', () => {
  it('a node the samples lack moves the definitions alone, both ways', () => {
    const defs = `${DEFS}  extra: { type: string }\n`;
    const { result } = renderHook(() => useAll(defs, 1_048_576));
    const before = result.current.sample.sampleSet;
    act(() => {
      expect(result.current.restructure.remove(nodeOf(defs, 'properties', 'extra'))).toBeNull();
    });
    expect(result.current.sample.sampleSet).toBe(before);
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
    });
    expect(result.current.sample.sampleSet).toBe(before);
    expect(result.current.defs.effectiveDefinitions).toBe(defs);
  });

  it('plans against empty definitions when there are none at all', () => {
    const { result } = renderHook(() => useAll(undefined, 1_048_576, vi.fn(), true));
    expect(result.current.defs.effectiveDefinitions).toBeUndefined();
    act(() => {
      expect(result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), '')).toBe(
        'empty_name',
      );
    });
  });

  it('has nothing to undo on a fresh document, and undoes a plain edit', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(result.current.restructure.undo()).toBe(false);
    });
    act(() => {
      result.current.defs.editDefinition({
        op: 'setScalar',
        keys: ['properties', 'total', 'title'],
        value: 'T',
      });
    });
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
    });
    expect(result.current.defs.edits).toEqual([]);
  });
});

describe('useDefsRestructure — a host that manages its own sample data', () => {
  it('renames, deletes and undoes/redoes without touching the sample set', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576, vi.fn(), true));
    const before = result.current.sample.sampleSet;
    act(() => {
      expect(
        result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand'),
      ).toBeNull();
    });
    expect(result.current.editor.text).toContain('{grand}');
    expect(result.current.sample.sampleSet).toBe(before);
    act(() => {
      result.current.restructure.undo();
    });
    act(() => result.current.editor.redo());
    expect(result.current.sample.sampleSet).toBe(before);
    act(() => {
      expect(result.current.restructure.remove(nodeOf(DEFS, 'properties', 'note'))).toBeNull();
    });
    expect(result.current.sample.sampleSet).toBe(before);
  });
});
