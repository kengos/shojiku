// The table's row heights: the body rows' auto⇄fixed mode with the one height
// field that mode uses, and the header row's own height. Split from
// `TableSettingsSection`, which mounts it behind `table.row.height`. That gate
// is deliberately coarse: the key names only the FIXED heights, but
// `row.minHeight` and `header.height` arrived in the same engine release, so no
// engine declares `table` without it and splitting the gate would buy nothing.
//
// The mode IS the presence of `row.height` — the engine lets a fixed height win
// over the auto rows' floor — so the field the other mode would show is not
// merely hidden: `rowModeOps` drops its key in the same edit.

import { isRelativeLength, readLength } from '../canvas/lengths';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { Segmented } from '../ui/Segmented';
import { applyPanelOp } from './model';
import { StepperField } from './StepperField';
import { DEFAULT_ROW_MIN_HEIGHT, type TableSettingsView } from './tableSettingsModel';
import { type HeightFloor, rowLengthOp, rowLengthStepOp, rowModeOps } from './tableSettingsOps';

interface HeightContext {
  readonly path: string;
  readonly controller: EditorController;
}

/** One height field: the entry and its ▲▼ share one key and one floor. An
 * authored `%`/`em` value stays on screen verbatim with the ▲▼ disabled and
 * saying why; nothing rewrites it until the reader types a new value. */
function HeightField({
  label,
  ...props
}: {
  /** Catalog text — it names the ▲▼ buttons too (`stepper.increment`). */
  readonly label: string;
  readonly value: string;
  readonly keys: readonly string[];
  /** What an empty field steps from. */
  readonly base: number;
  readonly floor: HeightFloor;
  readonly placeholder?: string;
  readonly context: HeightContext;
}) {
  const { t } = useI18n();
  const { path, controller } = props.context;
  const relative = isRelativeLength(props.value);
  return (
    <StepperField
      label={label}
      value={props.value}
      unit="pt"
      unitHint={t('stepper.unitHint')}
      placeholder={props.placeholder}
      canStep={props.value === '' || readLength(props.value) !== null}
      // Not the shared `stepper.relativeUnit`, which tells the reader to type
      // the value instead — this field refuses a typed percent too.
      stepHint={relative ? t('panel.tableSettings.relativeHeight') : undefined}
      onCommit={(raw) => applyPanelOp(controller, rowLengthOp(path, props.keys, raw, props.floor))}
      onStep={(dir) =>
        applyPanelOp(
          controller,
          rowLengthStepOp(path, props.keys, props.value, props.base, dir, props.floor),
        )
      }
    />
  );
}

/** Apply a mode pick as ONE batch. A re-pick of the mode on screen authors
 * nothing — which a native radio never sends anyway, so this is exported to be
 * pinned below the UI rather than left as a guard no click can reach. */
export function applyRowMode(
  controller: Pick<EditorController, 'applyAll'>,
  path: string,
  view: TableSettingsView,
  mode: string,
): void {
  const ops = rowModeOps(path, view, mode === 'fixed' ? 'fixed' : 'auto');
  if (ops !== null) {
    controller.applyAll(ops);
  }
}

export function TableRowHeights({
  context,
  view,
}: {
  readonly context: HeightContext;
  readonly view: TableSettingsView;
}) {
  const { t } = useI18n();
  const { path, controller } = context;
  // The header row is never shorter than the body rows' floor, so an unset
  // header height steps from there.
  const floor = readLength(view.minHeight);
  const rowFloor = floor !== null && floor.pt > 0 ? floor.pt : DEFAULT_ROW_MIN_HEIGHT;
  return (
    <>
      <p className="mb-1 text-sm text-muted">{t('panel.tableSettings.rowHeight')}</p>
      <Segmented
        ariaLabel={t('panel.tableSettings.rowHeight')}
        value={view.rowMode}
        options={[
          { value: 'auto', label: t('panel.tableSettings.rowAuto') },
          { value: 'fixed', label: t('panel.tableSettings.rowFixed') },
        ]}
        onChange={(mode) => applyRowMode(controller, path, view, mode)}
      />
      <div className="mt-2">
        {view.rowMode === 'fixed' ? (
          <HeightField
            label={t('panel.tableSettings.fixedHeight')}
            value={view.rowHeight}
            keys={['row', 'height']}
            base={DEFAULT_ROW_MIN_HEIGHT}
            floor="positive"
            context={context}
          />
        ) : (
          <HeightField
            label={t('panel.tableSettings.minHeight')}
            value={view.minHeight}
            keys={['row', 'minHeight']}
            base={DEFAULT_ROW_MIN_HEIGHT}
            floor="zero"
            placeholder={String(DEFAULT_ROW_MIN_HEIGHT)}
            context={context}
          />
        )}
        <HeightField
          label={t('panel.tableSettings.headerHeight')}
          value={view.headerHeight}
          keys={['header', 'height']}
          base={rowFloor}
          floor="positive"
          placeholder={t('panel.tableSettings.auto')}
          context={context}
        />
      </div>
    </>
  );
}
