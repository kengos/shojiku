// Inline text editing: a double-click (or Enter on the selected box) requests
// editing; only a static-text item opens (a data-bound item or a rect/qr is
// select-only in v1). Commit writes ONE batch (the text plus any declarations
// its chips staged); Escape cancels.
//
// A `spans:`-carrying item opens the same way but onto the FLOW surface, and
// its commit routes to `spanCommitOps` instead. Both are still ONE batch and
// therefore one undo step; what differs is only what the batch addresses —
// a `text:` key for the plain item, the `spans` sequence for the other.

import { useCallback, useMemo, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { PaletteGroup } from '../palette/model';
import { readItemView } from '../panel/itemView';
import { spanCommitOps } from '../panel/spanOps';
import type { ChipContext } from '../text/chipContext';
import { chipContextFor } from '../text/chipContext';
import { commitOps, declarationBatch } from '../text/declCommit';
import type { PendingDecl } from '../text/declModel';
import { otherSurfaceNames, readItem } from '../text/declModel';
import { planRuns } from '../text/runIdentity';
import type { SerializedRun } from '../text/runSerialize';
import { narrowRuns, type RunView } from '../text/spanRuns';

/** The flow surface's text as ONE string — what the declaration model reads a
 * surface's content as. A `data:` fragment contributes nothing: its binding is
 * not an interpolation and no declaration can be minted for it. */
function joinRuns(runs: readonly { readonly kind: string; readonly content: string }[]): string {
  return runs.map((run) => (run.kind === 'text' ? run.content : '')).join('');
}

export interface InlineEditOptions {
  readonly editor: EditorController;
  readonly paletteGroups: readonly PaletteGroup[] | null;
  readonly params: string;
  readonly capabilities: readonly string[] | undefined;
}

export interface InlineEdit {
  /** The box being edited inline, seeded once at open (the editor is
   * uncontrolled). `null` = not editing. `runs` is present only for a
   * `spans:`-carrying item, and is what the flow surface seeds from. */
  readonly editing: {
    readonly path: string;
    readonly value: string;
    readonly runs: readonly RunView[] | null;
  } | null;
  readonly requestEdit: (path: string) => void;
  readonly commitEdit: (value: string, declarations: readonly PendingDecl[]) => void;
  /** The flow surface's commit — the fragments as the reader left them. */
  readonly commitRuns: (
    runs: readonly SerializedRun[],
    declarations: readonly PendingDecl[],
  ) => void;
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
  const [editing, setEditing] = useState<InlineEdit['editing']>(null);

  const requestEdit = useCallback(
    (path: string) => {
      const view = readItemView(read(path));
      if (view === null || view.type !== 'text') {
        return;
      }
      // `spans` wins over `text`/`data` when non-empty, so a spans-carrying
      // item opens the flow surface WHATEVER its content mode says — the
      // `text:` the mode is derived from is a key the engine is ignoring.
      if (view.hasSpans) {
        select(path);
        setEditing({ path, value: view.text, runs: narrowRuns(readItem(read, path)?.spans) });
        return;
      }
      if (view.contentMode === 'text') {
        select(path);
        setEditing({ path, value: view.text, runs: null });
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
  const commitRuns = useCallback(
    (runs: readonly SerializedRun[], declarations: readonly PendingDecl[]) => {
      /* v8 ignore next 4 -- a commit only fires from the mounted editor, and
         unmounting is what clears `editing`; kept as a concurrent-render guard. */
      if (editing === null || editing.runs === null) {
        setEditing(null);
        return;
      }
      const plan = planRuns(editing.runs, runs);
      // The fragments and the declarations their chips staged land as ONE
      // batch: one undo step, and never a declaration without the text that
      // uses it.
      //
      // The prune is told `otherSurfaceNames`, which INCLUDES the spans — so a
      // name any fragment still references survives. That is deliberately
      // conservative: the set is read from the PRE-commit document, so a name
      // this very edit orphaned still looks used and is kept. An unused
      // declaration is a harmless leftover; a pruned one that another fragment
      // still names is a dangling reference, and only one of those is a bug.
      const ops = [
        ...spanCommitOps(read, editing.path, plan),
        ...declarationBatch({
          read,
          path: editing.path,
          oldText: joinRuns(editing.runs),
          newText: joinRuns(runs),
          pending: declarations,
          others: otherSurfaceNames(readItem(read, editing.path)),
        }),
      ];
      // An unchanged edit dispatches NOTHING: `applyAll([])` reports ok and
      // bumps the revision, which would put an empty step on the undo stack.
      //
      // A REFUSED batch leaves the editor OPEN. `MAX_BATCH_OPS` is 256 and
      // `MAX_SPANS` is also 256, and a fragment can carry five writes — so a
      // reformat of a large document really can exceed the cap, and clearing
      // `editing` there would unmount the surface and take the reader's typing
      // with it, silently. Staying open keeps the words on screen: the surface
      // is uncontrolled, so its DOM is still exactly what they typed.
      if (ops.length > 0 && !applyAll(ops).ok) {
        return;
      }
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

  return { editing, requestEdit, commitEdit, commitRuns, cancelEdit, editingChips };
}
