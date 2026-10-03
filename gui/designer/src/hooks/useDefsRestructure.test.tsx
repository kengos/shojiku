// Rename / delete as ONE action over the three live documents, through the real
// hooks that own them (the template editor, the sample set, the definitions
// edit list): one template undo step, every variant re-keyed, one definitions
// undo that reverts all three — re-applying the template half as a NEW forward
// batch so a template edit made since survives — a reverse that cannot apply
// refusing whole, the edit-list cap, and the template-only ⌘Z after a rename.

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAX_DEFS_EDITS } from '../data/defsPlan';
import { type DefsNode, readDefsTree } from '../data/defsTree';
import { SELECTION_SEP } from '../data/editorModel';
import { findNode } from '../data/treeModel';
import { useEditor } from '../editor/useEditor';
import type { SampleSet } from '../sample/variants';
import { useDefinitionsOwnership } from './useDefinitionsOwnership';
import { useDefsRestructure } from './useDefsRestructure';
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
  const editor = useEditor(TEMPLATE, maxBytes);
  const sample = useSampleData({
    initialParams: '',
    initialSampleSet: SET,
    onSampleSetChange: undefined,
    onParamsChange: undefined,
    definitions,
    sampleDataReadOnly,
  });
  const defs = useDefinitionsOwnership({
    definitions,
    stub: sample.stub,
    initialDefinitionsEdits: undefined,
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

describe('useDefsRestructure', () => {
  it('renames across the template (one undo step), every variant and the definitions', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(
        result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand'),
      ).toBeNull();
    });
    const { editor, sample, defs } = result.current;
    expect(editor.text).toContain('合計 {grand}');
    expect(sample.sampleSet.variants.map((variant) => keysOf(variant.text))).toEqual([
      ['grand', 'note'],
      ['grand', 'note'],
    ]);
    expect(defs.effectiveDefinitions).toContain('grand: { type: number }');
    act(() => result.current.editor.undo());
    expect(result.current.editor.text).toBe(TEMPLATE);
  });

  it('one definitions undo reverts all three, keeping a template edit made since', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand');
    });
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
    act(() => {
      expect(result.current.restructure.undo()).toEqual(['properties', 'total']);
    });
    const { editor, sample, defs } = result.current;
    expect(editor.text).toContain('合計 {total}');
    expect(editor.text).toContain('later');
    expect(sample.sampleSet.variants.map((variant) => keysOf(variant.text))).toEqual([
      ['total', 'note'],
      ['total', 'note'],
    ]);
    expect(defs.edits).toEqual([]);
    expect(defs.effectiveDefinitions).toBe(DEFS);
  });

  it('a template-only ⌘Z after a rename reverts only the template half', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand');
    });
    act(() => result.current.editor.undo());
    expect(result.current.editor.text).toContain('{total}');
    expect(result.current.defs.effectiveDefinitions).toContain('grand:');
  });

  it('refuses the whole undo when its reverse cannot apply, changing nothing', () => {
    const { result, rerender } = renderHook(({ cap }) => useAll(DEFS, cap), {
      initialProps: { cap: 1_048_576 },
    });
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 't');
    });
    const before = result.current.editor.text;
    rerender({ cap: new TextEncoder().encode(before).length });
    act(() => {
      expect(result.current.restructure.undo()).toBe(false);
    });
    expect(result.current.editor.text).toBe(before);
    expect(result.current.defs.edits).toHaveLength(1);
  });

  it('deletes from the definitions and every variant, leaving the template, and undoes it', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(result.current.restructure.remove(nodeOf(DEFS, 'properties', 'total'))).toBeNull();
    });
    expect(result.current.editor.text).toBe(TEMPLATE);
    expect(result.current.sample.sampleSet.variants.map((variant) => keysOf(variant.text))).toEqual(
      [['note'], ['note']],
    );
    expect(result.current.defs.effectiveDefinitions).not.toContain('total');
    act(() => {
      result.current.restructure.undo();
    });
    expect(result.current.sample.sampleSet.variants.map((variant) => keysOf(variant.text))).toEqual(
      [
        ['total', 'note'],
        ['total', 'note'],
      ],
    );
    expect(result.current.defs.effectiveDefinitions).toBe(DEFS);
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
  it('changes nothing else when the template half does not land (rename and undo)', () => {
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
    act(() => {
      result.current.restructure.rename(nodeOf(DEFS, 'properties', 'total'), 'grand');
    });
    act(() => {
      expect(result.current.refused.undo()).toBe(false);
    });
    expect(result.current.defs.edits).toHaveLength(1);
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

  it('has nothing to plan against with no definitions at all', () => {
    const { result } = renderHook(() => useAll(undefined, 1_048_576, vi.fn(), true));
    expect(result.current.defs.effectiveDefinitions).toBeUndefined();
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
    });
  });

  it('undoes a plain edit, and does nothing with nothing to undo', () => {
    const { result } = renderHook(() => useAll(DEFS, 1_048_576));
    act(() => {
      expect(result.current.restructure.undo()).toBe(true);
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
  it('renames, deletes and undoes without touching the sample set', () => {
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
    expect(result.current.sample.sampleSet).toBe(before);
    act(() => {
      expect(result.current.restructure.remove(nodeOf(DEFS, 'properties', 'note'))).toBeNull();
    });
    expect(result.current.sample.sampleSet).toBe(before);
  });
});
