// Inline text editing: a double-click (or Enter on the selected box) requests
// editing; only a static-text item opens (a data-bound item or a rect/qr is
// select-only in v1). Commit writes ONE batch (the text plus any declarations
// its chips staged); Escape cancels.

import { useCallback, useMemo, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { PaletteGroup } from '../palette/model';
import { readItemView } from '../panel/itemView';
import type { ChipContext } from '../text/chipContext';
import { chipContextFor } from '../text/chipContext';
import { commitOps } from '../text/declCommit';
import type { PendingDecl } from '../text/declModel';

export interface InlineEditOptions {
  readonly editor: EditorController;
  readonly paletteGroups: readonly PaletteGroup[] | null;
  readonly params: string;
  readonly capabilities: readonly string[] | undefined;
}

export interface InlineEdit {
  /** The box being edited inline, seeded once at open (the editor is
   * uncontrolled). `null` = not editing. */
  readonly editing: { readonly path: string; readonly value: string } | null;
  readonly requestEdit: (path: string) => void;
  readonly commitEdit: (value: string, declarations: readonly PendingDecl[]) => void;
  readonly cancelEdit: () => void;
  /** The overlay editor's chip options: the same binding-picker rows the panel
   * offers for the edited item (row-relative inside an array scope). */
  readonly editingChips: ChipContext | undefined;
}

export function useInlineEdit({
  editor,
  paletteGroups,
  params,
  capabilities,
}: InlineEditOptions): InlineEdit {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo deps below must be these stable fields, never `editor` itself.
  const { read, select, applyAll } = editor;
  const [editing, setEditing] = useState<{ readonly path: string; readonly value: string } | null>(
    null,
  );

  const requestEdit = useCallback(
    (path: string) => {
      const view = readItemView(read(path));
      if (view !== null && view.type === 'text' && view.contentMode === 'text') {
        select(path);
        setEditing({ path, value: view.text });
      }
    },
    [read, select],
  );
  const commitEdit = useCallback(
    (value: string, declarations: readonly PendingDecl[]) => {
      /* v8 ignore next 4 -- a commit only fires from the mounted editor, and unmounting is what clears `editing`; kept as a concurrent-render race guard. */
      if (editing === null) {
        setEditing(null);
        return;
      }
      // The text and the declarations its chips reference land as ONE batch:
      // one undo step, and never a declaration without the text that uses it.
      applyAll(
        commitOps({
          read,
          path: editing.path,
          oldText: editing.value,
          newText: value,
          pending: declarations,
        }),
      );
      setEditing(null);
    },
    [editing, applyAll, read],
  );
  const cancelEdit = useCallback(() => setEditing(null), []);
  const editingChips = useMemo(
    () =>
      editing === null
        ? undefined
        : chipContextFor(read, editing.path, paletteGroups, params, capabilities),
    [editing, paletteGroups, read, params, capabilities],
  );

  return { editing, requestEdit, commitEdit, cancelEdit, editingChips };
}
