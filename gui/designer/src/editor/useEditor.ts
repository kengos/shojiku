// The React binding over designer-core's imperative `Editor`: the Editor is
// held in a STABLE ref (never rebuilt on re-render — a churning transport/editor
// identity is the effect-loop/OOM trap), and a monotonic `revision` state bumps
// on every successful mutation to drive re-renders. The mutation callbacks are
// stable (memoized on the stable editor), so passing them down never re-fires a
// child's effects. `text` is the serialized document the preview loop keys on;
// it re-serializes only when the revision changes.

import {
  type BatchResult,
  Editor,
  type EditorListener,
  type Op,
  type OpResult,
} from '@shojiku/designer-core';
import { useCallback, useRef, useState } from 'react';

export interface EditorController {
  /** The current document as canonical YAML text (the preview loop's input). */
  readonly text: string;
  /** Monotonic edit counter — a cheap "changed" signal for consumers. */
  readonly revision: number;
  readonly selection: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  apply(op: Op): OpResult;
  applyAll(ops: readonly Op[]): BatchResult;
  read(path: string): unknown;
  undo(): void;
  redo(): void;
  select(path: string): void;
  clearSelection(): void;
  /** Adopt a raised template-size cap mid-session (holding a larger image)
   * without discarding history. Clamped to the ceiling by the Editor. */
  setMaxBytes(bytes: number): void;
  /** Observe committed changes. STABLE across a `replaceDocument` swap: the
   * hook bridges its own listener set onto whichever Editor is current, so a
   * subscriber never has to re-subscribe (and never holds a dead Editor). */
  subscribe(listener: EditorListener): () => void;
  /** Replace the whole document with `text` — a fresh session over the same
   * size cap. The undo history does NOT cross the swap (the tutorial's
   * practice-document swap, whose exit restores the caller's own snapshot).
   * Throws `TemplateParseError` if `text` is malformed or over the cap. */
  replaceDocument(text: string): void;
}

/** Seed an editing session from template `source` (once — the Editor then owns
 * the document state; a host swapping templates remounts via `key`).
 * `maxBytes` seeds the template-size cap at that initial parse; later raises go
 * through `setMaxBytes`. */
export function useEditor(source: string, maxBytes?: number): EditorController {
  const editorRef = useRef<Editor | null>(null);
  // The hook's OWN listener set, bridged onto the current Editor at creation
  // (never in an effect — an edit committed before the effect ran would be
  // missed). A document swap re-bridges; subscribers keep their registration.
  const listenersRef = useRef<Set<EditorListener>>(new Set());
  const bridge = useCallback((ed: Editor) => {
    ed.subscribe((change) => {
      for (const listener of listenersRef.current) {
        listener(change);
      }
    });
    return ed;
  }, []);
  let editor = editorRef.current;
  if (editor === null) {
    editor = bridge(Editor.create(source, { maxBytes }));
    editorRef.current = editor;
  }
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const subscribe = useCallback((listener: EditorListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const replaceDocument = useCallback(
    (text: string) => {
      // Carry the session's current cap so a swap back into a legally-large
      // document (inline images) parses under the same limit it was made with.
      editorRef.current = bridge(Editor.create(text, { maxBytes: editor.maxBytes() }));
      bump();
    },
    [editor, bridge, bump],
  );

  const apply = useCallback(
    (op: Op) => {
      const result = editor.apply(op);
      if (result.ok) {
        bump();
      }
      return result;
    },
    [editor, bump],
  );

  const applyAll = useCallback(
    (ops: readonly Op[]) => {
      const result = editor.applyAll(ops);
      if (result.ok) {
        bump();
      }
      return result;
    },
    [editor, bump],
  );

  const read = useCallback((path: string) => editor.read(path), [editor]);

  const undo = useCallback(() => {
    if (editor.undo()) {
      bump();
    }
  }, [editor, bump]);

  const redo = useCallback(() => {
    if (editor.redo()) {
      bump();
    }
  }, [editor, bump]);

  const select = useCallback(
    (path: string) => {
      editor.select(path);
      bump();
    },
    [editor, bump],
  );

  const clearSelection = useCallback(() => {
    editor.clearSelection();
    bump();
  }, [editor, bump]);

  // A raised cap changes no text (only what future re-parses accept), so it
  // needs no revision bump — the caller re-renders for its own reasons.
  const setMaxBytes = useCallback((bytes: number) => editor.setMaxBytes(bytes), [editor]);

  // `editor` is a stable, mutable object, so the serialized text is recomputed
  // each render; a mutation bumps `revision` (state) to force that re-render.
  const text = editor.text();

  return {
    text,
    revision,
    selection: editor.selection(),
    canUndo: editor.canUndo(),
    canRedo: editor.canRedo(),
    apply,
    applyAll,
    read,
    undo,
    redo,
    select,
    clearSelection,
    setMaxBytes,
    subscribe,
    replaceDocument,
  };
}
