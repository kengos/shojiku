// Unit tests for hooks/useMultiSet.ts — when the canvas multi-set is still the
// one the user built: beside its own primary, over the structure it was built on.
import type { EditorChange, EditorListener } from '@shojiku/designer-core';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMultiSet } from './useMultiSet';

const NODES = new Set(['a', 'b', 'c', 'd']);
const read = (path: string): unknown => (NODES.has(path) ? { type: 'rect' } : undefined);

function setup(initial: string | null) {
  const listeners = new Set<EditorListener>();
  const subscribe = (listener: EditorListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const emit = (change: EditorChange) => {
    act(() => {
      for (const listener of listeners) {
        listener(change);
      }
    });
  };
  const hook = renderHook(
    ({ selection }: { selection: string | null }) => useMultiSet({ read, selection, subscribe }),
    { initialProps: { selection: initial } },
  );
  return { ...hook, emit, listeners };
}

const members = (set: ReadonlySet<string>) => [...set].sort();

describe('useMultiSet', () => {
  it('grows beside its primary and toggles a member back off', () => {
    const { result } = setup('a');
    act(() => result.current.toggle('b'));
    act(() => result.current.addAll(['c', 'd']));
    expect(members(result.current.paths)).toEqual(['b', 'c', 'd']);
    act(() => result.current.toggle('c'));
    expect(members(result.current.paths)).toEqual(['b', 'd']);
    act(() => result.current.clear());
    expect(result.current.paths.size).toBe(0);
  });

  it('is gone the moment the primary is a different node', () => {
    const { result, rerender } = setup('a');
    act(() => result.current.toggle('b'));
    rerender({ selection: 'c' });
    expect(result.current.paths.size).toBe(0);
    // …and does not come back when the old primary is selected again.
    rerender({ selection: 'a' });
    expect(result.current.paths.size).toBe(0);
  });

  it('is gone when there is no primary', () => {
    const { result, rerender } = setup('a');
    act(() => result.current.toggle('b'));
    rerender({ selection: null });
    expect(result.current.primary).toBeNull();
    expect(result.current.paths.size).toBe(0);
  });

  it('is gone when the primary no longer reads to a node', () => {
    const { result, rerender } = setup('a');
    act(() => result.current.toggle('b'));
    rerender({ selection: 'zz' });
    expect(result.current.primary).toBeNull();
    expect(result.current.paths.size).toBe(0);
  });

  it('starts a replacing set beside the primary it names', () => {
    // A plain sweep names the new primary and selects it in the same handler, so
    // both land in one render.
    const { result, rerender } = setup(null);
    act(() => {
      result.current.replace(['b', 'c'], 'a');
      rerender({ selection: 'a' });
    });
    expect(members(result.current.paths)).toEqual(['b', 'c']);
  });

  it('drops the set on an edit that shifts sequence paths', () => {
    for (const op of ['insertItem', 'removeItem', 'moveItem', 'duplicateItem']) {
      const { result, emit, unmount } = setup('a');
      act(() => result.current.toggle('b'));
      emit({ ops: [{ op } as unknown as EditorChange['ops'][number]], source: 'apply' });
      expect(result.current.paths.size).toBe(0);
      unmount();
    }
  });

  it('drops the set on undo and redo, which restore a document it was not built over', () => {
    for (const source of ['undo', 'redo'] as const) {
      const { result, emit, unmount } = setup('a');
      act(() => result.current.toggle('b'));
      emit({ ops: [], source });
      expect(result.current.paths.size).toBe(0);
      unmount();
    }
  });

  it('keeps the set through an edit that changes values but not structure', () => {
    const { result, emit } = setup('a');
    act(() => result.current.toggle('b'));
    emit({
      ops: [{ op: 'setScalar', path: 'b', keys: ['box', 'x'], value: 10 }],
      source: 'batch',
    });
    expect(members(result.current.paths)).toEqual(['b']);
  });

  it('unsubscribes when it unmounts', () => {
    const { unmount, listeners } = setup('a');
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
