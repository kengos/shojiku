import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditor } from './useEditor';

const SOURCE = [
  'defaults:',
  '  currency: JPY',
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: hello',
  '',
].join('\n');

describe('useEditor', () => {
  it('applies an op and updates text + revision', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    expect(result.current.revision).toBe(0);
    act(() => {
      const r = result.current.apply({
        op: 'setScalar',
        path: 'defaults',
        keys: ['currency'],
        value: 'USD',
      });
      expect(r.ok).toBe(true);
    });
    expect(result.current.text).toContain('currency: USD');
    expect(result.current.revision).toBe(1);
    expect(result.current.canUndo).toBe(true);
  });

  it('does not bump revision when an op fails', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    act(() => {
      const r = result.current.apply({ op: 'removeKey', path: 'defaults', keys: ['nope'] });
      expect(r.ok).toBe(false);
    });
    expect(result.current.revision).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it('applies a batch and undoes/redoes it', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    act(() => {
      result.current.applyAll([
        { op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' },
        { op: 'setScalar', path: 'defaults', keys: ['locale'], value: 'en-US' },
      ]);
    });
    expect(result.current.text).toContain('locale: en-US');
    act(() => result.current.undo());
    expect(result.current.text).not.toContain('locale: en-US');
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.text).toContain('locale: en-US');
  });

  it('ignores a failed batch (no revision bump)', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    act(() => {
      const r = result.current.applyAll([{ op: 'removeKey', path: 'defaults', keys: ['nope'] }]);
      expect(r.ok).toBe(false);
    });
    expect(result.current.revision).toBe(0);
  });

  it('is a no-op when undo/redo has nothing to do', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.revision).toBe(0);
  });

  it('reads a subtree and tracks selection', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    expect(result.current.read('sections.body.items[0]')).toEqual({ type: 'text', text: 'hello' });
    act(() => result.current.select('sections.body.items[0]'));
    expect(result.current.selection).toBe('sections.body.items[0]');
    act(() => result.current.clearSelection());
    expect(result.current.selection).toBeNull();
  });

  it('keeps mutation callback identities stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useEditor(SOURCE));
    const first = result.current;
    rerender();
    expect(result.current.apply).toBe(first.apply);
    expect(result.current.applyAll).toBe(first.applyAll);
    expect(result.current.undo).toBe(first.undo);
    expect(result.current.select).toBe(first.select);
    // A mutation still re-renders and keeps the same callback identity.
    act(() =>
      result.current.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' }),
    );
    expect(result.current.apply).toBe(first.apply);
  });
});

describe('subscribe / replaceDocument', () => {
  it('reports committed changes to a subscriber', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    const seen: string[] = [];
    act(() => {
      result.current.subscribe((change) => seen.push(change.source));
    });
    act(() => {
      result.current.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' });
    });
    act(() => {
      result.current.undo();
    });
    expect(seen).toEqual(['apply', 'undo']);
  });

  it('stops reporting after unsubscribe', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    const seen: string[] = [];
    let off = () => {};
    act(() => {
      off = result.current.subscribe((change) => seen.push(change.source));
    });
    act(() => {
      off();
      result.current.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' });
    });
    expect(seen).toEqual([]);
  });

  it('replaces the whole document and keeps reporting from the NEW session', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    const seen: string[] = [];
    act(() => {
      result.current.subscribe((change) => seen.push(change.source));
    });
    act(() => {
      result.current.replaceDocument('defaults:\n  currency: EUR\n');
    });
    expect(result.current.text).toContain('currency: EUR');
    expect(result.current.text).not.toContain('hello');
    // The subscription survives the swap — the subscriber never held the
    // Editor, only the hook.
    act(() => {
      result.current.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'GBP' });
    });
    expect(seen).toEqual(['apply']);
    expect(result.current.text).toContain('currency: GBP');
  });

  it('starts the replacement with a clean history and no selection', () => {
    const { result } = renderHook(() => useEditor(SOURCE));
    act(() => {
      result.current.select('sections.body.items[0]');
      result.current.apply({ op: 'setScalar', path: 'defaults', keys: ['currency'], value: 'USD' });
    });
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.replaceDocument('defaults:\n  currency: EUR\n');
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.selection).toBeNull();
  });

  it('carries the session’s raised size cap into the replacement', () => {
    const { result } = renderHook(() => useEditor(SOURCE, 4 * 1024 * 1024));
    const before = result.current;
    act(() => {
      before.replaceDocument('defaults:\n  currency: EUR\n');
    });
    expect(result.current.text).toContain('currency: EUR');
  });
});
