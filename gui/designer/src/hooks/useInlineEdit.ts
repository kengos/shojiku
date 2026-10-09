// Inline text editing: a double-click (or Enter on the selected box) requests
// editing; only a static-text item opens (a data-bound item or a rect/qr is
// select-only in v1). Commit writes ONE batch (the text plus any declarations
// its chips staged); Escape cancels.
//
// A `spans:`-carrying item opens the same way but onto the FLOW surface, and
// its commit routes to `spanCommitOps` instead. Both are still ONE batch and
// therefore one undo step; what differs is only what the batch addresses —
// a `text:` key for the plain item, the `spans` sequence for the other.
//
// A PLAIN static text opens the flow surface too, on an engine that renders
// spans: selecting a word and pressing B is how a reader makes one bold, and
// the plain editor offers no way to. Its commit (`plainFlowCommitOps`) writes
// `text:` exactly as before while nothing is marked, and creates `spans:` only
// once something is. An engine without spans keeps the plain editor.

import { useCallback, useMemo, useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { PaletteGroup } from '../palette/model';
import { readItemView } from '../panel/itemView';
import {
  type ConversionCause,
  combineOffered,
  conversionCauses,
  flowSeed,
} from '../panel/spanConversion';
import type { ChipContext } from '../text/chipContext';
import { chipContextFor } from '../text/chipContext';
import { commitOps } from '../text/declCommit';
import type { PendingDecl } from '../text/declModel';
import { flowCommitOps } from '../text/flowCommit';
import type { SerializedRun } from '../text/runSerialize';
import type { RunView } from '../text/spanRuns';

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
    /** `plain` — the flow surface over a `text:` item, whose first mark
     * creates `spans:`; `spans` — over an item that already has them. */
    readonly origin: 'plain' | 'spans';
    readonly vertical: boolean;
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
  /** The flow surface's inputs while a `spans:` item is being edited (its
   * runs, its commit, and whether it may author both decoration lines at once
   * — `style.textDecoration.combined`, an absent list being the bundled
   * engine); `undefined` otherwise. */
  readonly editingFlow:
    | {
        readonly runs: readonly RunView[];
        readonly onCommit: InlineEdit['commitRuns'];
        readonly combinedDecoration: boolean;
        /** Offer the per-fragment tate-chu-yoko toggle. */
        readonly combineUpright: boolean;
        /** Read the surface verbatim: over a plain item with text, so an
         * authored U+00A0 / U+200B is not normalized into a write. (An EMPTY
         * plain item is seeded with the U+200B placeholder, which must go.) */
        readonly verbatim: boolean;
        /** Over a PLAIN item: what the engine treats differently once the
         * item holds spans — the reader is told before the first mark. */
        readonly causes: readonly ConversionCause[];
      }
    | undefined;
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
      const seed = flowSeed(read, path, view, capabilities);
      if (seed !== null) {
        select(path);
        setEditing({ path, value: view.text, ...seed });
      }
    },
    [read, select, capabilities],
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
      const ops = flowCommitOps({
        read,
        path: editing.path,
        origin: editing.origin,
        oldText: editing.value,
        seeded: editing.runs,
        runs,
        pending: declarations,
      });
      // An unchanged edit dispatches NOTHING: `applyAll([])` reports ok and
      // bumps the revision, which would put an empty step on the undo stack.
      //
      // A REFUSED batch leaves the editor OPEN. `MAX_BATCH_OPS` is 256 and
      // `MAX_SPANS` is also 256, and a fragment can carry several writes — so a
      // reformat of a large document really can exceed the cap, and clearing
      // `editing` there would unmount the surface and take the reader's typing
      // with it, silently. Staying open keeps the words on screen: the surface
      // is uncontrolled, so its DOM is still exactly what they typed. A `null`
      // batch is the same answer reached before any batch was built (a plain
      // item converted into more fragments than the engine draws).
      if (ops === null || (ops.length > 0 && !applyAll(ops).ok)) {
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

  const combinedDecoration =
    capabilities === undefined || capabilities.includes('style.textDecoration.combined');
  const editingFlow = useMemo(
    () =>
      editing === null || editing.runs === null
        ? undefined
        : {
            runs: editing.runs,
            onCommit: commitRuns,
            combinedDecoration,
            combineUpright: combineOffered(capabilities, editing.vertical, editing.runs),
            verbatim: editing.origin === 'plain' && editing.value !== '',
            causes: editing.origin === 'plain' ? conversionCauses(read, editing.path) : [],
          },
    [editing, commitRuns, combinedDecoration, capabilities, read],
  );
  return {
    editing,
    requestEdit,
    commitEdit,
    commitRuns,
    cancelEdit,
    editingChips,
    editingFlow,
  };
}
