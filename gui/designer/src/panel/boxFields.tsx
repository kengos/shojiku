// The placement tab's per-axis widgets and mode chrome: an editable axis, a
// read-only engine-owned axis, the auto⇄fixed segment, and the mode hint line.
// `BoxSection.tsx` beside this file composes them with the parent-container card
// and a container's own child-layout section.

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import type { BoxAxis } from './itemView';
import { applyPanelOp, lengthOp, stepValueOp } from './model';
import type { ResolvedPlacement } from './placementGeometry';
import { type Placement, pinOps, unpinOps } from './placementModel';
import { StepperField } from './StepperField';

/** One editable box axis: the shipped StepperField, but seeded with the engine-
 * RESOLVED value (dimmed + auto tag) when the key is unset — so an auto-sized
 * w/h shows its real number instead of a blank field. Commits only on a CHANGE
 * (a tab-through of the seeded value authors nothing — StepperField's guard);
 * typing/stepping authors the shown value. `seed` null/undefined = a plain
 * empty field (today's behavior, used for authored x/y). */
export function BoxAxisField({
  label,
  authored,
  seed,
  step,
  axis,
  path,
  controller,
}: {
  readonly label: string;
  readonly authored: string;
  readonly seed: number | null | undefined;
  readonly step: number;
  readonly axis: BoxAxis;
  readonly path: string;
  readonly controller: EditorController;
}) {
  const { t } = useI18n();
  const seeded = authored === '' && seed !== null && seed !== undefined;
  const value = authored !== '' ? authored : seeded ? String(seed) : '';
  // A RELATIVE length (`100%`, `2em`) is a legal box value the engine resolves
  // at layout, but it is not one the panel can step by points — and
  // `canvas/lengths` deliberately refuses to read it, because rewriting it into
  // points would throw away the authoring intent the canvas drag also honours.
  // So the ▲▼ go quiet; without this they went quiet SILENTLY, which is what
  // made a width edit feel broken.
  const relative = value !== '' && readLength(value) === null;
  const keys = ['box', axis];
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <StepperField
      label={label}
      value={value}
      canStep={readLength(value) !== null}
      tag={seeded ? t('panel.placement.autoTag') : undefined}
      unit="pt"
      // An empty editable COORDINATE means 0 to the engine (w/h mean auto-size,
      // so they stay placeholder-less) — state it instead of a blank box.
      placeholder={value === '' && (axis === 'x' || axis === 'y') ? '0' : undefined}
      stepHint={relative ? t('stepper.relativeUnit') : undefined}
      onCommit={(v) => dispatch(lengthOp(path, keys, v))}
      onStep={(dir) => dispatch(stepValueOp(path, keys, value, dir, step, 'length'))}
    />
  );
}

/** One read-only box axis (the mock's `.fbox.auto`): the engine-resolved value
 * with an auto tag, for a coordinate the engine — not the author — owns (an
 * auto container child's x/y, a flow child's y). */
export function BoxAxisDisplay({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex items-center justify-between gap-1 rounded-md border border-border bg-bg px-2 py-1 text-sm text-muted">
        <span>{value}</span>
        <span className="shrink-0 rounded border border-border px-1 text-[10px] leading-tight text-muted">
          {t('panel.placement.autoTag')}
        </span>
      </div>
    </div>
  );
}

/** The auto⇄fixed segment for a container child: auto releases the pin
 * (removeKey both coords), fixed writes the resolved coordinate so the item does
 * not move. Fixed is disabled — with a why-tooltip — while its target is
 * unresolvable OR the shown geometry is not fresh (a render is in flight):
 * the displays stay stable on last-good values, but a pin must never write
 * geometry the current document has moved past. */
export function PlacementSegment({
  placement,
  resolved,
  fresh,
  controller,
  path,
}: {
  readonly placement: Placement;
  readonly resolved: ResolvedPlacement | null;
  readonly fresh: boolean;
  readonly controller: EditorController;
  readonly path: string;
}) {
  const { t } = useI18n();
  const pinX = resolved?.x ?? null;
  const pinY = resolved?.y ?? null;
  const canPin = fresh && pinX !== null && pinY !== null;
  return (
    <Segmented
      ariaLabel={t('panel.placement.label')}
      value={placement.pinned ? 'pin' : 'auto'}
      options={[
        {
          value: 'auto',
          label: t('panel.placement.mode.auto'),
          tip: t('panel.placement.tip.auto'),
        },
        {
          value: 'pin',
          label: t('panel.placement.mode.pinned'),
          tip:
            placement.pinned || canPin
              ? t('panel.placement.tip.pinned')
              : t('panel.placement.tip.pinDisabled'),
          disabled: !placement.pinned && !canPin,
        },
      ]}
      onChange={() => {
        // Segmented fires only on an enabled state CHANGE, so this always
        // crosses auto⇄fixed: pinned releases, unpinned pins.
        if (placement.pinned) {
          controller.applyAll(unpinOps(controller.read, path));
          return;
        }
        /* v8 ignore next 3 -- the pin radio is disabled (and Segmented re-guards it) while the coordinate is unresolved or stale; kept for a synthetic-dispatch race */
        if (!canPin || pinX === null || pinY === null) {
          return;
        }
        controller.applyAll(pinOps(path, pinX, pinY));
      }}
    />
  );
}

/** The mode-dependent explanatory line under the box fields (plain-language for
 * the nontech-pm; no wire keys). `coordinate` shows its caption above the
 * fields, so it adds nothing here. */
export function BoxHint({ placement }: { readonly placement: Placement }) {
  const { t } = useI18n();
  const key =
    placement.kind === 'pinnable'
      ? placement.pinned
        ? 'panel.placement.hint.pinned'
        : 'panel.placement.hint.auto'
      : placement.kind === 'flow'
        ? placement.ignoredY
          ? 'panel.placement.hint.flowIgnoredY'
          : 'panel.placement.hint.flowY'
        : null;
  return key === null ? null : (
    <p className="mt-1 text-[11px] leading-relaxed text-muted">{t(key)}</p>
  );
}
