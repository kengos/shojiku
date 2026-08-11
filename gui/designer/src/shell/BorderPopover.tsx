// The border editor at the pointer: what the right-click menu's border row
// opens. It hosts the SAME `panel/BorderEditor` the decoration tab and the
// format toolbar render — this is its third host and there is no second border
// implementation — over `ui/AnchoredSurface`, which owns the anchoring and the
// dismiss rules.
//
// It re-derives its target every render and renders NOTHING once that target is
// gone or no longer borderable: an undo while the popover is open must not feed
// the editor a ghost path (the rule `FormatToolbar` applies to an undone
// selection).

import type { EditorController } from '../editor/useEditor';
import { BorderEditor } from '../panel/BorderEditor';
import { formatContext } from '../toolbar/model';
import { AnchoredSurface } from '../ui/AnchoredSurface';
import type { AnchorPoint } from '../ui/anchorPosition';
import { borderableView, readNodeAt } from './contextMenuRows';

export interface BorderPopoverProps {
  readonly at: AnchorPoint;
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities: readonly string[] | undefined;
  readonly onClose: () => void;
}

export function BorderPopover({ at, path, controller, capabilities, onClose }: BorderPopoverProps) {
  const node = readNodeAt(controller.read, path);
  const view = borderableView(node, capabilities);
  if (view === null) {
    return null;
  }
  const ctx = formatContext({ read: controller.read, path, view, raw: node, capabilities });
  return (
    <AnchoredSurface
      at={at}
      onClose={onClose}
      className="w-72 rounded-md border border-border bg-surface p-3 text-sm text-text shadow-lg"
    >
      <BorderEditor
        key={path}
        view={ctx.border}
        radius={ctx.radius}
        path={path}
        controller={controller}
        capabilities={capabilities}
        isTable={view.type === 'table'}
      />
    </AnchoredSurface>
  );
}
