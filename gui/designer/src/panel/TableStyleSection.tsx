// The table's band styling, as the bodies of three decoration-tab sections: the
// table style itself (a live miniature, Excel's preset gallery, the zebra and
// hide-header switches, and the ineffective-fill banner beside them), and the header and body bands' own formatting. Ordered
// the way the engine layers the bands (grid → header → body base → zebra → the
// conditional rules `RowConditions` owns), which is also the order Excel's
// table-design tab reads in. `TableDecorationSections` wraps each body in its
// collapsible section.
//
// It takes a `TableStyleContext` of its own rather than the property panel's prop
// bundle, and assumes nothing about the panel's ~255px column. That is deliberate:
// appearance editing is expected to move into a modal sheet, and these bodies
// should then move by changing WHERE they are rendered and nothing else. A test
// mounts them standalone to keep that true.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { BTN_SM } from '../ui/chrome';
import { bandInk, headerFillOf, readBandCascades } from './bandCascade';
import { HiddenHeaderNote, HiddenHeaderToggle } from './HiddenHeaderField';
import { applyPanelOp } from './model';
import { TableBandFields } from './TableBandFields';
import { TableMiniature, TableStyleGallery } from './TableStyleGallery';
import { gridWidthOf, readTableStyle, TABLE_HEADER_FILL } from './tableStyleModel';
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

/** The banner for a `style.backgroundColor` the engine does not paint on a
 * table, with its one-click clear. Its own export because it must render
 * whether or not the engine declares `table.style` — it is the explanation of
 * the swatch the section keeps in both arms. Renders nothing without a fill. */
export function IneffectiveFillBanner({ context }: { readonly context: TableStyleContext }) {
  const { t } = useI18n();
  const { path, controller } = context;
  if (readTableStyle(controller.read(path)).ineffectiveFill === '') {
    return null;
  }
  return (
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
  );
}

/** The 「Table style」 section's body. The caller gates it on `table.style`. */
export function TableStyleBody({ context }: { readonly context: TableStyleContext }) {
  const { t } = useI18n();
  const { path, controller, capabilities, floor } = context;
  const raw = controller.read(path);
  const view = readTableStyle(raw);
  const gridWidth = gridWidthOf(raw);
  // The gallery reads the WIRE, not the cascade: a preset describes what it
  // AUTHORS, so a colour the table inherits must not make one read as active.
  const active = matchPreset(view, gridWidth);
  const bands = readBandCascades(controller.read, path, floor);
  const headerInk = bandInk(bands.header);
  const rowInk = bandInk(bands.row);
  return (
    <>
      <TableMiniature
        headerFill={headerFillOf(bands.header, TABLE_HEADER_FILL).value}
        headerColor={headerInk.color}
        headerBold={headerInk.bold}
        zebra={view.zebra}
        rowFill={rowInk.fill}
        rowColor={rowInk.color}
        gridless={gridWidth === '0'}
        hiddenHeader={view.hiddenHeader}
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
      {/* The peer of the zebra switch, not a detail of the header band: both
          are table-level decisions an author looks for without opening
          anything. */}
      <HiddenHeaderToggle
        path={path}
        hidden={view.hiddenHeader}
        capabilities={capabilities}
        onOp={(op) => controller.apply(op)}
      />
    </>
  );
}

/** One band section's body: the header band (with the note that its fields
 * paint nothing while the row is hidden) or the body band. */
export function TableBandBody({
  context,
  band,
}: {
  readonly context: TableStyleContext;
  readonly band: 'header' | 'row';
}) {
  const { path, controller, floor } = context;
  const bands = readBandCascades(controller.read, path, floor);
  const onOp = (op: Op | null) => applyPanelOp(controller, op);
  if (band === 'row') {
    return <TableBandFields ctx={bands.row} path={path} keys={ROW_KEYS} onOp={onOp} />;
  }
  return (
    <>
      <HiddenHeaderNote hidden={readTableStyle(controller.read(path)).hiddenHeader} />
      <TableBandFields
        ctx={bands.header}
        path={path}
        keys={HEADER_KEYS}
        headerFill={headerFillOf(bands.header, TABLE_HEADER_FILL)}
        onOp={onOp}
      />
    </>
  );
}
