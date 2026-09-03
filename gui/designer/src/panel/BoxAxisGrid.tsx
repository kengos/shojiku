// The four box fields and WHICH of them the item's placement makes read-only.
// Split out of `BoxSection.tsx`, which had grown past the per-file budget: the
// section composes parent card / placement mode / type-specific clusters, and
// this owns the one question of what the x/y/w/h grid shows.
//
// Two rules it carries, both stated where they are decided rather than inferred
// at each call site:
//
//   * an ENGINE-OWNED axis (a flow child's `y`, an auto container child's x and
//     y) displays read-only — but only when it resolves to a finite number.
//     With no render yet, or hostile geometry, it falls back to the plain
//     editable field, which is the state the mode segment is disabled in too.
//   * `noCoords` withholds x and y ENTIRELY. That is the anchored-ellipse case:
//     the engine reads neither, so an editable coordinate would be a control
//     with no effect, and a read-only one would display a number nothing uses.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BoxAxisDisplay, BoxAxisField } from './boxFields';
import { BOX_AXES, type BoxAxis, type ItemView } from './itemView';
import type { ResolvedPlacement } from './placementGeometry';
import type { Placement } from './placementModel';

export interface BoxAxisGridProps {
  readonly view: ItemView;
  readonly path: string;
  readonly controller: EditorController;
  readonly step: number;
  readonly placement: Placement;
  readonly resolved: ResolvedPlacement | null;
  /** Withhold x and y — the item's position is not its box. */
  readonly noCoords: boolean;
  /** Authored-only fields with no resolved seeding: sub-templates, `line`,
   * section roots, hostile documents. */
  readonly flat?: boolean;
}

export function BoxAxisGrid({
  view,
  path,
  controller,
  step,
  placement,
  resolved,
  noCoords,
  flat = false,
}: BoxAxisGridProps) {
  const { t } = useI18n();
  const editable = (axis: BoxAxis, seed: number | null | undefined) => (
    <BoxAxisField
      key={axis}
      label={t(`panel.box.${axis}`)}
      authored={view.box[axis]}
      seed={seed}
      step={step}
      axis={axis}
      path={path}
      controller={controller}
    />
  );
  const shown = (axis: BoxAxis, value: number | null) =>
    value === null ? (
      editable(axis, null)
    ) : (
      <BoxAxisDisplay key={axis} label={t(`panel.box.${axis}`)} value={value} />
    );
  const coords = noCoords
    ? null
    : flat
      ? [editable('x', undefined), editable('y', undefined)]
      : placement.kind === 'pinnable' && !placement.pinned
        ? [shown('x', resolved?.x ?? null), shown('y', resolved?.y ?? null)]
        : placement.kind === 'flow'
          ? [editable('x', undefined), shown('y', resolved?.y ?? null)]
          : [editable('x', undefined), editable('y', undefined)];
  const sized = BOX_AXES.filter((axis) => axis === 'w' || axis === 'h');
  return (
    <div className="grid grid-cols-2 gap-2">
      {coords}
      {flat
        ? sized.map((axis) => editable(axis, undefined))
        : [editable('w', resolved?.w ?? null), editable('h', resolved?.h ?? null)]}
    </div>
  );
}
