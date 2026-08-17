// The placement tab, composed PARENT-FIRST: the parent-container card (when the
// DIRECT parent is a container), then the item's own placement, then — for a
// container — its own child-layout section. Exactly one parent level (the card's
// select-parent jumps further up). The per-axis widgets and the auto⇄fixed segment
// live in `boxFields.tsx`.

import { useI18n } from '../i18n/context';
import { BTN_SM, SECTION_TITLE } from '../ui/chrome';
import { BoxAxisDisplay, BoxAxisField, BoxHint, PlacementSegment } from './boxFields';
import type { ItemPanelProps } from './itemPanelProps';
import { BOX_AXES, type BoxAxis } from './itemView';
import { LayoutSection } from './LayoutSection';
import { containerLayoutFor, parentContainerOf } from './layoutModel';
import { ParentContainerCard } from './ParentContainerCard';
import { HelpfulHeading } from './panelHelpers';
import { resolvePlacement } from './placementGeometry';
import { placementFor } from './placementModel';

/** The box steppers' fallback increment when the canvas grid is off. */
const FALLBACK_STEP_PT = 1;

export function BoxSection(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, gridStep, geometry } = props;
  const step = gridStep > 0 ? gridStep : FALLBACK_STEP_PT;
  const placement = placementFor(controller.read, path);
  const resolved = resolvePlacement(geometry ?? null, controller.read, path, placement);
  const parentPath = parentContainerOf(controller.read, path);
  const parentLayout = parentPath === null ? null : containerLayoutFor(controller.read, parentPath);
  const ownLayout = containerLayoutFor(controller.read, path);
  // The mock's self-explaining titles: a container's own coordinates are
  // "the container's own placement" / a container child's "this element's placement" —
  // the plain "placement" heading stays for everything else.
  const sectionTitle =
    ownLayout !== null
      ? t('panel.layout.ownPlacement')
      : parentLayout !== null
        ? t('panel.layout.itemPlacement')
        : t('panel.section.box');
  // The `?` on this tab, and WHICH frame it names. `x`/`y` are an offset from the
  // PARENT BOX ORIGIN (docs/engine/box.md), which is the margin box only for a
  // band or absolute-body child (`coordinate`) and for a flow child's x — there
  // the canvas guide IS the rectangle the numbers start from, and the sheet is
  // what warns. A container child (`pinnable`) and a sub-template item (`plain`)
  // measure from their container instead, and `child_overflow` warns against it,
  // so telling them the margin rectangle is their origin would re-create this
  // cycle's own misconception one nesting level down — with a drawn rectangle
  // now reinforcing it.
  const pageFramed = placement.kind === 'coordinate' || placement.kind === 'flow';
  const heading = (
    <HelpfulHeading
      title={sectionTitle}
      topic={pageFramed ? 'placement' : 'placementChild'}
      onOpenGlossary={props.onOpenGlossary}
    />
  );
  const parentCard =
    parentPath !== null && parentLayout !== null ? (
      <ParentContainerCard
        controller={controller}
        path={parentPath}
        layout={parentLayout}
        onSelectParent={props.onSelectPath}
        onHighlight={props.onHighlight}
      />
    ) : null;
  const childLayout =
    ownLayout !== null ? (
      <section className="mt-3">
        <h3 className={SECTION_TITLE}>{t('panel.layout.children')}</h3>
        <LayoutSection controller={controller} path={path} layout={ownLayout} />
      </section>
    ) : null;
  // The keyboard-reachable wrap-in-container (the canvas/tree right-click's
  // companion): wrap this item in a new container. Present only when the
  // Designer passed the handler (a wrappable, item-list selection).
  const wrapAction =
    props.onWrap !== undefined ? (
      <button type="button" className={`${BTN_SM} mt-3`} onClick={() => props.onWrap?.(path)}>
        {t('contextMenu.wrap')}
      </button>
    ) : null;

  const editableAxis = (axis: BoxAxis, seed: number | null | undefined) => (
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
  // A read-only display for an engine-owned axis, but only when it resolves to
  // a finite number; otherwise (no render yet, hostile geometry) fall back to
  // the plain editable field — the segment is disabled in the same state.
  const displayAxis = (axis: BoxAxis, value: number | null) =>
    value === null ? (
      editableAxis(axis, null)
    ) : (
      <BoxAxisDisplay key={axis} label={t(`panel.box.${axis}`)} value={value} />
    );

  // Plain items (sub-templates, `line`, section roots, hostile docs) keep the
  // flat authored-only fields — no mode, no resolved seeding.
  if (placement.kind === 'plain') {
    return (
      <div>
        {parentCard}
        <section>
          {heading}
          <div className="grid grid-cols-2 gap-2">
            {BOX_AXES.map((axis) => editableAxis(axis, undefined))}
          </div>
        </section>
        {childLayout}
        {wrapAction}
      </div>
    );
  }

  return (
    <div>
      {parentCard}
      <section>
        {heading}
        {placement.kind === 'pinnable' ? (
          <PlacementSegment
            placement={placement}
            resolved={resolved}
            fresh={geometry?.fresh === true}
            controller={controller}
            path={path}
          />
        ) : null}
        {placement.kind === 'coordinate' ? (
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            {t('panel.placement.caption.coordinate')}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {/* x/y: read-only for an engine-owned axis (auto container child, flow
            y), editable otherwise; w/h: always editable, seeded when unset. */}
          {placement.kind === 'pinnable' && !placement.pinned
            ? [displayAxis('x', resolved?.x ?? null), displayAxis('y', resolved?.y ?? null)]
            : placement.kind === 'flow'
              ? [editableAxis('x', undefined), displayAxis('y', resolved?.y ?? null)]
              : [editableAxis('x', undefined), editableAxis('y', undefined)]}
          {editableAxis('w', resolved?.w ?? null)}
          {editableAxis('h', resolved?.h ?? null)}
        </div>
        <BoxHint placement={placement} />
      </section>
      {childLayout}
      {wrapAction}
    </div>
  );
}
