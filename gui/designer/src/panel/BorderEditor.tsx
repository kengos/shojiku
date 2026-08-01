// The border cluster's interactive editor (Excel-style): a paper diagram whose
// four edges are click targets, plus a "pen" (width / color / line style) that a
// click or a preset applies. It reads the cascade-effective per-side state from
// `borderModel` (which the diagram shows) and dispatches ONE transactional
// `applyAll` per action (one undo step), authoring the item's own border keys in
// the simplest wire form. Shared by the decoration tab and the toolbar popover — keyed
// by the item path at each host so the pen resets on a selection change.
//
// This file is the SHELL: it owns the pen state, the capability gates that
// decide which clusters exist at all, the single dispatch, and the all-sides/none
// presets. Each cluster below it owns its own controls.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BorderDiagram } from './BorderDiagram';
import { BorderPen } from './BorderPen';
import { BorderRadiusField } from './BorderRadiusField';
import { edgeOps, presetOps } from './borderOps';
import type { BorderView, Pen, RadiusView } from './borderTypes';
import { hasCapability } from './itemPanelProps';

export interface BorderEditorProps {
  readonly view: BorderView;
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities?: readonly string[];
  /** The item's `borderRadius`, resolved through the same cascade as the
   * per-side properties. */
  readonly radius: RadiusView;
  /** A `table` draws the map form as its OUTER frame only (inner ruling is the
   * table's own spec) — the editor notes this so the per-side controls don't
   * read as inner-cell borders. */
  readonly isTable: boolean;
}

export function BorderEditor({
  view,
  radius,
  path,
  controller,
  capabilities,
  isTable,
}: BorderEditorProps) {
  const { t } = useI18n();
  const [pen, setPen] = useState<Pen>({ width: 1, color: '', style: 'solid' });
  const perSide = hasCapability(capabilities, 'style.border.sides');
  const radiusControl = hasCapability(capabilities, 'style.borderRadius');

  const dispatch = (ops: Op[]) => {
    if (ops.length > 0) {
      controller.applyAll(ops);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {perSide ? (
        <BorderDiagram
          view={view}
          isTable={isTable}
          onEdge={(side) => dispatch(edgeOps(path, view, side, pen))}
        />
      ) : null}

      <BorderPen pen={pen} setPen={setPen} capabilities={capabilities} />

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm text-text hover:border-muted"
          onClick={() => dispatch(presetOps(path, view, 'all', pen))}
        >
          {t('border.preset.all')}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-border bg-surface px-2 py-1 text-sm text-text hover:border-muted"
          onClick={() => dispatch(presetOps(path, view, 'none', pen))}
        >
          {t('border.preset.none')}
        </button>
      </div>

      {radiusControl ? <BorderRadiusField radius={radius} path={path} dispatch={dispatch} /> : null}
    </div>
  );
}
