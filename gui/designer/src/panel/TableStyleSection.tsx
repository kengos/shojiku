// The table's row-band styling section: a live miniature, Excel's preset gallery,
// the zebra checkbox, and — collapsed, because most tables never need it — the
// per-band detail. Ordered the way the engine layers the bands (grid → header →
// body base → zebra → the conditional rules the next section owns), which is also
// the order Excel's table-design tab reads in.
//
// It takes a `TableStyleContext` of its own rather than the property panel's prop
// bundle, and assumes nothing about the panel's ~255px column. That is deliberate:
// appearance editing is expected to move into a modal sheet, and this section
// should then move by changing WHERE it is rendered and nothing else. A test
// mounts it standalone to keep that true.

import type { Op } from '@shojiku/designer-core';
import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM, FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { IconChevronDown } from '../ui/icons';
import { bandInk, headerFillOf, readBandCascades } from './bandCascade';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp } from './model';
import { TableBandFields } from './TableBandFields';
import { TableMiniature, TableStyleGallery } from './TableStyleGallery';
import { readTableStyle, TABLE_HEADER_FILL } from './tableStyleModel';
import { clearIneffectiveFillOp, zebraToggleOp } from './tableStyleOps';
import { matchPreset, presetOps } from './tableStylePresets';

/** The key paths the two bands own under the table item. */
const HEADER_KEYS = ['header', 'style'] as const;
const ROW_KEYS = ['row', 'style'] as const;

/** Everything the section needs, and nothing about where it is hosted. */
export interface TableStyleContext {
  /** The table item's structural path. */
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities: readonly string[] | undefined;
  /** The engine-default floor, so an unset inherited band property resolves to
   * the value the page really carries. Optional: the section mounts standalone
   * in tests and the floor only changes an origin LABEL, never the shown value
   * or the op. */
  readonly floor?: Readonly<Record<string, unknown>>;
}

/** The authored grid width as a display string — the one owned key that lives on
 * the table's own `style` rather than on a band. A PER-SIDE map (which the border
 * editor authors when the four sides differ) is not "no width": reporting it as
 * unset would let the gallery mark `plain` active on a table that carries an
 * outer frame. It reports a sentinel no preset declares, so such a table reads as
 * hand-tuned. */
function gridWidthOf(raw: unknown): string {
  const style =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).style
      : undefined;
  const width =
    typeof style === 'object' && style !== null && !Array.isArray(style)
      ? (style as Record<string, unknown>).borderWidth
      : undefined;
  if (typeof width === 'number') {
    return Number.isFinite(width) ? String(width) : '';
  }
  return width === undefined ? '' : 'custom';
}

export function TableStyleSection({ context }: { readonly context: TableStyleContext }) {
  const { t } = useI18n();
  const { path, controller, capabilities, floor } = context;
  const [open, setOpen] = useState(false);
  if (!hasCapability(capabilities, 'table.style')) {
    return null;
  }
  const raw = controller.read(path);
  const view = readTableStyle(raw);
  const gridWidth = gridWidthOf(raw);
  // The gallery reads the WIRE, not the cascade: a preset describes what it
  // AUTHORS, so a colour the table inherits must not make one read as active.
  const active = matchPreset(view, gridWidth);
  const bands = readBandCascades(controller.read, path, floor);
  const headerInk = bandInk(bands.header);
  const rowInk = bandInk(bands.row);
  const headerFill = headerFillOf(bands.header, TABLE_HEADER_FILL);
  const onOp = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <section className="mb-3">
      <h4 className={SECTION_TITLE}>{t('panel.tableStyle.title')}</h4>
      {view.ineffectiveFill === '' ? null : (
        <div className="mb-2 rounded-sj bg-warn-bg px-2 py-1.5 text-sm text-warn-text">
          <p className="m-0">{t('panel.tableStyle.fillIgnored')}</p>
          <button
            type="button"
            className={`${BTN_SM} mt-1.5`}
            onClick={() => controller.apply(clearIneffectiveFillOp(path))}
          >
            {t('panel.tableStyle.fillClear')}
          </button>
        </div>
      )}
      <TableMiniature
        headerFill={headerFill.value}
        headerColor={headerInk.color}
        headerBold={headerInk.bold}
        zebra={view.zebra}
        rowFill={rowInk.fill}
        rowColor={rowInk.color}
        gridless={gridWidth === '0'}
      />
      <TableStyleGallery
        active={active}
        onPick={(id) => {
          const ops = presetOps(path, view, gridWidth, id);
          if (ops.length > 0) {
            controller.applyAll(ops);
          }
        }}
      />
      <label className="mb-2 flex items-center gap-1.5 text-sm text-text">
        <input
          type="checkbox"
          checked={view.zebra !== ''}
          onChange={() => controller.apply(zebraToggleOp(path, view.zebra))}
        />
        {t('panel.tableStyle.zebra')}
      </label>
      <button
        type="button"
        className="mb-1 flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-muted text-sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* One chevron, rotated a quarter turn when collapsed — the shipped
            disclosure pattern (the layer tree's rows). A text ▸ is banned
            chrome, and the convention guard enforces it. */}
        <IconChevronDown
          size={12}
          data-collapsed={open ? undefined : ''}
          className="transition-transform data-collapsed:-rotate-90"
        />
        {t('panel.tableStyle.detail')}
      </button>
      {open ? (
        <div className="border-border border-t pt-2">
          <p className={`${FIELD_LABEL} font-semibold text-text`}>
            {t('panel.tableStyle.headerBand')}
          </p>
          <TableBandFields
            ctx={bands.header}
            path={path}
            keys={HEADER_KEYS}
            headerFill={headerFill}
            onOp={onOp}
          />
          <p className={`${FIELD_LABEL} mt-3 font-semibold text-text`}>
            {t('panel.tableStyle.bodyBand')}
          </p>
          <TableBandFields ctx={bands.row} path={path} keys={ROW_KEYS} onOp={onOp} />
        </div>
      ) : null}
    </section>
  );
}
