// The single-column form a canvas column selection (`…columns[n]`) opens:
// label, binding, format, width, and the column's own cell styling — the column
// identity the user just clicked, without hunting the parent table in the tree.
//
// The styling half is the SAME four controls the table's header and body bands
// carry (`TableBandFields`), pointed at `columns[n].style` instead. That is the
// per-cell layer a business form actually needs: a money column right-aligned,
// a quantity column centred.
//
// A column HAS a structural path, so its cascade needs no composing: the shared
// `cascadeContext` already puts the row band and the table under it
// (`toolbar/cascade` § columnLayers), which is what makes a bold row band show
// a checked Bold box here instead of an unchecked one.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { cascadeContext } from '../toolbar/cascade';
import { INPUT, PANEL, SECTION_TITLE } from '../ui/chrome';
import { ColumnBindingFields } from './ColumnBindingFields';
import type { ColumnRow } from './columnsModel';
import { Field, TextField } from './fields';
import { registryNames } from './itemView';
import { applyPanelOp, lengthOp, plainTextOp } from './model';
import { bindingScopeFor, pickerOptions, scopeAuthorable } from './pickerModel';
import { TableBandFields } from './TableBandFields';

/** A column's own cell style sits at `style.*` under the column itself. */
const COLUMN_STYLE_KEYS = ['style'] as const;

export interface ColumnFormProps {
  readonly controller: EditorController;
  /** The selected column's structural path (`…columns[n]`). */
  readonly path: string;
  readonly column: ColumnRow;
  readonly groups: readonly PaletteGroup[] | null;
  readonly params: string;
  /** The engine capability keys — gates the number-field currency variants
   * in the format suggestions (undefined = show). */
  readonly capabilities?: readonly string[];
  /** The engine's format catalog — what each pickable spelling RENDERS. */
  readonly formatCatalog?: FormatCatalog | null;
  /** The engine-default floor for the cell-style cascade (unset inherited
   * property → its real engine default). */
  readonly floor?: Readonly<Record<string, unknown>>;
}

export function ColumnForm({
  controller,
  path,
  column,
  groups,
  params,
  capabilities,
  formatCatalog = null,
  floor,
}: ColumnFormProps) {
  const { t } = useI18n();
  const scope = bindingScopeFor(controller.read, path);
  const options = pickerOptions(groups, scope, params);
  // A column of a BOUND table resolves against its row, so it gets the same
  // document-scope escape the panel's column list offers.
  const rowScoped = scope !== null;
  const documentOptions =
    rowScoped && scopeAuthorable(capabilities) ? pickerOptions(groups, null, params) : undefined;
  const dispatch = (op: Op) => {
    controller.apply(op);
  };
  return (
    <aside className={PANEL} aria-label={t('panel.title')}>
      <div>
        <section className="mb-4">
          <h3 className={SECTION_TITLE}>{t('panel.section.column')}</h3>
          <Field label={t('panel.column.label')}>
            <input
              key={column.label}
              type="text"
              className={INPUT}
              defaultValue={column.label}
              onBlur={(event) => {
                if (event.currentTarget.value !== column.label) {
                  dispatch(plainTextOp(path, ['label'], event.currentTarget.value));
                }
              }}
            />
          </Field>
          <ColumnBindingFields
            controller={controller}
            path={path}
            column={column}
            options={options}
            documentOptions={documentOptions}
            rowScoped={rowScoped}
            formatRegistry={registryNames(controller.read('formats'))}
            capabilities={capabilities}
            formatCatalog={formatCatalog}
          />
          {/* `TextField` (explicit htmlFor/id) rather than the wrapping-label
              `Field`: the unit badge's text would otherwise fold into the
              computed label — the bare label would read as word+"pt" run together to a screen reader. A
              column width is commonly a `%`, and the badge shows only while
              the value is bare, i.e. while the pt is the invisible one. */}
          <TextField
            label={t('panel.column.width')}
            value={column.width}
            unit="pt"
            onCommit={(value) => {
              if (value !== column.width) {
                dispatch(lengthOp(path, ['width'], value));
              }
            }}
          />
        </section>
        <section className="mb-4">
          <h3 className={SECTION_TITLE}>{t('panel.column.style')}</h3>
          <TableBandFields
            ctx={cascadeContext(controller.read, path, floor)}
            path={path}
            keys={COLUMN_STYLE_KEYS}
            onOp={(op) => applyPanelOp(controller, op)}
          />
          {/* Not decoration trivia: a column's own alignment also wins for its
              header LABEL over whatever the header row sets
              (docs/engine/table.md), so the control reaches two places and the
              panel has to say which. */}
          <p className="m-0 mt-1 text-muted text-sm">{t('panel.column.styleHint')}</p>
        </section>
      </div>
    </aside>
  );
}
