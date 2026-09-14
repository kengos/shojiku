// The canvas multi-set, held BESIDE one primary selection. Split out of
// `useMultiSelect`, which owns the gestures that grow it and the align /
// distribute subject that reads it; this file owns when the set is still the
// one the user built.
//
// It is only ever beside the primary it was built next to. Most selections in
// the Designer do not pass through the canvas — a tree row, the breadcrumb, a
// diagnostic jump, an insert's auto-select, undo restoring a selection — and a
// set that outlived a primary changed by any of them had the toolbar offering to
// align items with one the user never picked. So the set remembers its primary,
// and the moment the selection is a different node, or none, it is gone: dropped
// during render (React's adjust-state-while-rendering form) and never painted
// meanwhile.
//
// A set can also go stale with the SAME primary: its members are paths, and an
// insert, removal, move or duplicate shifts the paths after it, while undo and
// redo put back a document the set was not built over. Those drop it too. An
// edit that changes values but not structure — an align, a style change — keeps
// it, which is what lets align then distribute run on one set.

import type { EditorListener } from '@shojiku/designer-core';
import { useCallback, useEffect, useState } from 'react';
import { readSubject } from '../editor/subject';
import type { EditorController } from '../editor/useEditor';

const EMPTY_PATH_SET: ReadonlySet<string> = new Set();

/** Ops that change which node a sequence path names. */
const STRUCTURAL_OPS: ReadonlySet<string> = new Set([
  'insertItem',
  'removeItem',
  'moveItem',
  'duplicateItem',
]);

interface Held {
  readonly paths: ReadonlySet<string>;
  /** The primary the set was built beside; `null` = no set. */
  readonly beside: string | null;
}

const NONE: Held = { paths: EMPTY_PATH_SET, beside: null };

export interface MultiSetOptions {
  readonly read: EditorController['read'];
  readonly selection: string | null;
  readonly subscribe: EditorController['subscribe'];
}

export interface MultiSet {
  /** The live set — empty unless it was built beside the current primary. */
  readonly paths: ReadonlySet<string>;
  /** The current primary when it still reads to a node, else `null`. */
  readonly primary: string | null;
  readonly clear: () => void;
  readonly toggle: (path: string) => void;
  readonly addAll: (paths: readonly string[]) => void;
  /** Start a new set beside `beside` (a plain rubber-band sweep). */
  readonly replace: (paths: readonly string[], beside: string) => void;
}

/** The set as it stands beside `primary`: kept when built there, else empty. */
function beside(held: Held, primary: string | null): Set<string> {
  return new Set(held.beside !== null && held.beside === primary ? held.paths : EMPTY_PATH_SET);
}

export function useMultiSet({ read, selection, subscribe }: MultiSetOptions): MultiSet {
  const [held, setHeld] = useState<Held>(NONE);
  const primary = readSubject(read, selection)?.path ?? null;
  const live = primary !== null && held.beside === primary;
  if (!live && held.paths.size > 0) {
    setHeld(NONE);
  }

  useEffect(() => {
    const onChange: EditorListener = (change) => {
      if (
        change.source === 'undo' ||
        change.source === 'redo' ||
        change.ops.some((op) => STRUCTURAL_OPS.has(op.op))
      ) {
        setHeld(NONE);
      }
    };
    return subscribe(onChange);
  }, [subscribe]);

  const clear = useCallback(() => setHeld(NONE), []);
  const toggle = useCallback(
    (path: string) =>
      setHeld((prev) => {
        const next = beside(prev, primary);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return { paths: next, beside: primary };
      }),
    [primary],
  );
  const addAll = useCallback(
    (paths: readonly string[]) =>
      setHeld((prev) => {
        const next = beside(prev, primary);
        for (const path of paths) {
          next.add(path);
        }
        return { paths: next, beside: primary };
      }),
    [primary],
  );
  const replace = useCallback(
    (paths: readonly string[], at: string) => setHeld({ paths: new Set(paths), beside: at }),
    [],
  );

  return { paths: live ? held.paths : EMPTY_PATH_SET, primary, clear, toggle, addAll, replace };
}
