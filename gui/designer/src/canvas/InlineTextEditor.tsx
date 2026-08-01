// The canvas overlay editor: the shared `TextEditor` positioned over the box
// being edited (its content rect, in device px, inside the page div). Delibe-
// rately NOT WYSIWYG — the Designer never re-resolves fonts/styles, so this is a
// plain chrome-styled editing surface pinned to the box's place, not a mimic of
// the rendered glyphs. Opened by a double-click on a text item (Designer gates
// which items qualify); commit writes ONE `plainTextOp`, Escape cancels.

import type { BoxRect } from '../engine/types';
import type { ChipContext } from '../text/chipContext';
import type { PendingDecl } from '../text/declModel';
import { TextEditor } from '../text/TextEditor';

export interface InlineTextEditorProps {
  /** The box's content rect in device px (already scaled to match the page). */
  readonly rect: BoxRect;
  readonly value: string;
  readonly onCommit: (value: string, declarations: readonly PendingDecl[]) => void;
  readonly onCancel: () => void;
  readonly ariaLabel: string;
  readonly chips?: ChipContext;
}

export function InlineTextEditor({
  rect,
  value,
  onCommit,
  onCancel,
  ariaLabel,
  chips,
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
      <TextEditor
        value={value}
        onCommit={onCommit}
        onCancel={onCancel}
        ariaLabel={ariaLabel}
        autoFocus
        chips={chips}
      />
    </div>
  );
}
