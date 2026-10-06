// A grid's column widths or row heights: how the axis is sized as a whole, then —
// for a per-track list — one `GridTrackRow` per track. Columns are either all the
// same width (a COUNT) or set per column (a LIST); rows are additionally "fit the
// content" (no `rows` key — every row as tall as its tallest cell, the engine
// default). Switching form keeps the track count and, for columns, the look: a
// count becomes that many equal shares. A form or a kind the engine cannot read
// is offered disabled with the reason (a form) or left out (a kind). Shares and
// equal heights need a definite height on the ROW axis, which a container with
// no `h` of its own may not have — the note says so instead of hiding them.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { GridTrackRow } from './GridTrackRow';
import {
  type TrackAxis,
  type TrackKind,
  type TrackSpec,
  trackFormOp,
  trackKindOps,
  trackValueOps,
} from './gridTracks';
import { applyPanelOp } from './model';

/** The engine reads `fr` / `auto` tracks (`grid.fr` / `grid.auto`). */
export interface TrackSupport {
  readonly fr: boolean;
  readonly auto: boolean;
}

function applyBatch(controller: EditorController, ops: Op[] | null) {
  if (ops !== null) {
    controller.applyAll(ops);
  }
}

export function GridTrackEditor({
  controller,
  path,
  axis,
  spec,
  count,
  support,
  hasHeight,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly axis: TrackAxis;
  readonly spec: TrackSpec;
  /** How many tracks the grid shows on this axis now (a form switch keeps it). */
  readonly count: number;
  readonly support: TrackSupport;
  /** The container authors its own `h` (rows only: shares need a height). */
  readonly hasHeight: boolean;
}) {
  const { t } = useI18n();
  // A columns list starts as equal shares, a rows list as content-sized rows.
  const listKind: TrackKind = axis === 'columns' ? 'fr' : 'auto';
  const forms: readonly TrackSpec['form'][] =
    axis === 'columns' ? ['count', 'list'] : ['unset', 'count', 'list'];
  // Why a form cannot be picked, if it cannot: the engine cannot read the list
  // form's starting kind, or equal ROWS have no height to divide (the engine
  // would drop them with a warning about `%`).
  const reason = (form: TrackSpec['form']): string | undefined => {
    if (form === 'list' && !support[listKind]) {
      return t('panel.layout.tracks.unsupported');
    }
    return axis === 'rows' && form === 'count' && !hasHeight
      ? t('panel.layout.tracks.rows.countNeedsHeight', {
          tab: t('panel.tab.box'),
          height: t('panel.box.h'),
        })
      : undefined;
  };
  const options = forms.map((form) => {
    const tip = reason(form);
    return {
      value: form,
      label: t(`panel.layout.tracks.${axis}.${form}`),
      disabled: tip !== undefined,
      tip,
    };
  });
  const offered = new Set<TrackKind>(['fixed']);
  if (support.fr) {
    offered.add('fr');
  }
  if (support.auto) {
    offered.add('auto');
  }
  const needsHeight =
    axis === 'rows' &&
    !hasHeight &&
    (spec.form === 'count' ||
      (spec.form === 'list' && spec.tracks.some((track) => track.kind === 'fr')));
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t(`panel.layout.tracks.${axis}`)}</span>
      <Segmented
        ariaLabel={t(`panel.layout.tracks.${axis}`)}
        value={spec.form}
        options={options}
        onChange={(form) =>
          applyPanelOp(controller, trackFormOp(path, axis, form as TrackSpec['form'], count))
        }
      />
      {spec.form === 'list'
        ? spec.tracks.map((track, index) => (
            <GridTrackRow
              // A track has no identity but its position.
              // biome-ignore lint/suspicious/noArrayIndexKey: the list is positional
              key={index}
              axis={axis}
              index={index}
              track={track}
              offered={offered}
              onKind={(kind) => applyBatch(controller, trackKindOps(path, axis, index, kind))}
              onValue={(raw) =>
                applyBatch(controller, trackValueOps(path, axis, index, track.kind, raw))
              }
            />
          ))
        : null}
      {needsHeight ? (
        <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
          {t('panel.layout.tracks.rows.needsHeight')}
        </p>
      ) : null}
    </div>
  );
}
