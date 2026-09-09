// The canvas overlay editor: the shared `TextEditor` positioned over the box
// being edited (its content rect, in device px, inside the page div). Delibe-
// rately NOT WYSIWYG — the Designer never re-resolves fonts/styles, so this is a
// plain chrome-styled editing surface pinned to the box's place, not a mimic of
// the rendered glyphs. Opened by a double-click on a text item (Designer gates
// which items qualify); commit writes ONE `plainTextOp`, Escape cancels.

import type { BoxRect } from '../engine/types';
import type { ChipContext } from '../text/chipContext';
import type { PendingDecl } from '../text/declModel';
import type { SerializedRun } from '../text/runSerialize';
import { SpansFlowEditor } from '../text/SpansFlowEditor';
import type { RunView } from '../text/spanRuns';
import { TextEditor } from '../text/TextEditor';

export interface InlineTextEditorProps {
  /** The box's content rect in device px (already scaled to match the page). */
  readonly rect: BoxRect;
  readonly value: string;
  readonly onCommit: (value: string, declarations: readonly PendingDecl[]) => void;
  readonly onCancel: () => void;
  readonly ariaLabel: string;
  readonly chips?: ChipContext;
  /** Present when the item carries `spans:`. The two halves are ONE optional
   * field rather than two, because a surface with fragments to show and no way
   * to hand them back is not a state the host may express. */
  readonly flow?: {
    readonly runs: readonly RunView[];
    readonly onCommit: (
      runs: readonly SerializedRun[],
      declarations: readonly PendingDecl[],
    ) => void;
  };
}

export function InlineTextEditor({
  rect,
  value,
  onCommit,
  onCancel,
  ariaLabel,
  chips,
  flow,
}: InlineTextEditorProps) {
  return (
    <div
      className="sj-inline-editor"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        minHeight: rect.h,
      }}
    >
      {flow === undefined ? (
        <TextEditor
          value={value}
          onCommit={onCommit}
          onCancel={onCancel}
          ariaLabel={ariaLabel}
          autoFocus
          chips={chips}
        />
      ) : (
        <SpansFlowEditor
          runs={flow.runs}
          onCommit={flow.onCommit}
          onCancel={onCancel}
          ariaLabel={ariaLabel}
          chips={chips}
        />
      )}
    </div>
  );
}
