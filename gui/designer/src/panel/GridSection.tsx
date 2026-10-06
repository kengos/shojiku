// The grid half of the child-layout section: the column/row count steppers, the
// column widths and row heights (`GridTrackEditor`), the per-axis spacing and the
// fill order (`GridGapFields`). Everything is read from the container's own
// `box` as the layout view carries it — the same document read the arrangement
// switch uses — so a hostile `columns`/`rows` value simply gets no controls.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { GridGapFields } from './GridGapFields';
import { GridSteppers } from './GridSteppers';
import { GridTrackEditor, type TrackSupport } from './GridTrackEditor';
import { readTracks, trackCount } from './gridTracks';
import type { ContainerLayout } from './layoutModel';

export function GridSection({
  controller,
  path,
  layout,
  support,
}: {
  readonly controller: EditorController;
  readonly path: string;
  readonly layout: ContainerLayout;
  readonly support: TrackSupport;
}) {
  const { box } = layout;
  const columnSpec = readTracks(box.columns);
  // A grid always has columns: absent is one (the engine default) and an
  // unreadable value gets no column controls at all.
  const columns = columnSpec === null ? 1 : trackCount(columnSpec);
  const { t } = useI18n();
  const cellSlots = layout.children.filter((child) => child.flexItem);
  const cells = cellSlots.length;
  const spanning = cellSlots.some((child) => child.spanning);
  const rows = Math.max(1, Math.ceil(cells / columns));
  const rowSpec = readTracks(box.rows);
  return (
    <>
      {columnSpec !== null ? (
        <>
          {spanning ? (
            // A spanning child breaks the one-cell-per-slot mapping the steppers
            // re-chunk by, so they step aside rather than move the wrong cells.
            <p className="mt-0 mb-2 text-[11px] text-muted leading-relaxed">
              {t('panel.layout.spanNoCount', {
                columns: t('panel.layout.columns'),
                rows: t('panel.layout.rows'),
                across: t('panel.layout.span.columns'),
                down: t('panel.layout.span.rows'),
              })}
            </p>
          ) : (
            <GridSteppers controller={controller} path={path} columns={columns} rows={rows} />
          )}
          <GridTrackEditor
            controller={controller}
            path={path}
            axis="columns"
            spec={columnSpec.form === 'unset' ? { form: 'count', count: 1 } : columnSpec}
            count={columns}
            support={support}
            hasHeight={layout.hasHeight}
          />
        </>
      ) : null}
      {rowSpec !== null ? (
        <GridTrackEditor
          controller={controller}
          path={path}
          axis="rows"
          spec={rowSpec}
          count={rows}
          support={support}
          hasHeight={layout.hasHeight}
        />
      ) : null}
      <GridGapFields controller={controller} path={path} box={box} />
    </>
  );
}
