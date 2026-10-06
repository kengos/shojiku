// How many columns and rows a grid child covers (`box.columnSpan` /
// `box.rowSpan`) — the Excel merge-cells analog, on the CHILD's own placement tab
// because a span is the child's property. Shown only for a child the grid lays
// out (a positioned child or a `line` occupies no cell) and only against an
// engine that reads spans. 1 is the default and removes the key; a column span
// is capped at the grid's column count (the engine clamps past it with
// `grid_span_clamped`), a row span at the engine's track cap.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { boxOf, isFlexItem } from './flexParticipants';
import { hasCapability } from './itemPanelProps';
import { display } from './itemView';
import { type ContainerLayout, MAX_GRID_TRACKS } from './layoutModel';
import { applyPanelOp } from './model';
import { readItem } from './placementModel';
import { StepperField } from './StepperField';

/** The engine capability that admits the span keys. */
export const SPAN_CAPABILITY = 'grid.span';

export type SpanKey = 'columnSpan' | 'rowSpan';

/** A span commit: the typed count clamped to `max` first, then 1 removes the key
 * (when present) and anything above authors it; `null` when nothing would change
 * (the value is already there, or 1 with no key) or the text is not a whole
 * number of at least 1. `''` means 1. */
export function spanOp(
  path: string,
  key: SpanKey,
  raw: string,
  max: number,
  /** The authored value (`undefined` = no key). */
  current: unknown,
): Op | null {
  const present = current !== undefined;
  const keys = ['box', key];
  const text = raw.trim();
  const n = text === '' ? 1 : Number(text);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  const value = Math.min(max, n);
  if (value === 1) {
    return present ? { op: 'removeKey', path, keys } : null;
  }
  return value === current ? null : { op: 'setScalar', path, keys, value };
}

export function GridSpanFields({
  controller,
  path,
  child,
  columns,
}: {
  readonly controller: EditorController;
  /** The grid CHILD's path. */
  readonly path: string;
  /** The child node as authored. */
  readonly child: unknown;
  /** The parent grid's column count (the column span's ceiling). */
  readonly columns: number;
}) {
  const { t } = useI18n();
  const box = boxOf(child);
  const field = (key: SpanKey, label: string, max: number) => {
    const value = display(box[key]);
    const current = value === '' ? 1 : Number(value);
    const commit = (raw: string) => applyPanelOp(controller, spanOp(path, key, raw, max, box[key]));
    return (
      <StepperField
        label={label}
        value={value}
        placeholder="1"
        canStep={Number.isInteger(current)}
        onCommit={commit}
        onStep={(dir) => commit(String(Math.max(1, current + dir)))}
      />
    );
  };
  return (
    <section className="mt-3">
      <h3 className={SECTION_TITLE}>{t('panel.layout.span')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {field('columnSpan', t('panel.layout.span.columns'), columns)}
        {field('rowSpan', t('panel.layout.span.rows'), MAX_GRID_TRACKS)}
      </div>
    </section>
  );
}

/** The span fields where they apply: a child the grid lays out, in a grid
 * parent, against an engine that reads spans — otherwise nothing. */
export function GridSpanSection({
  controller,
  path,
  parent,
  capabilities,
}: {
  readonly controller: EditorController;
  readonly path: string;
  /** The direct parent container's layout. */
  readonly parent: ContainerLayout;
  readonly capabilities: readonly string[] | undefined;
}) {
  const node = readItem(controller.read, path);
  if (
    parent.mode !== 'grid' ||
    !isFlexItem(node) ||
    !hasCapability(capabilities, SPAN_CAPABILITY)
  ) {
    return null;
  }
  return (
    <GridSpanFields
      controller={controller}
      path={path}
      child={node}
      columns={parent.columns ?? 1}
    />
  );
}
