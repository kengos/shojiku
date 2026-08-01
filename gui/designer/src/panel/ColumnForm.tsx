// The single-column form a canvas column selection (`…columns[n]`) opens:
// label, binding, format, width — the column identity the user just clicked,
// without hunting the parent table in the tree.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { INPUT, PANEL, SECTION_TITLE } from '../ui/chrome';
import { ColumnBindingFields } from './ColumnBindingFields';
import type { ColumnRow } from './columnsModel';
import { Field, TextField } from './fields';
import { registryNames } from './itemView';
import { lengthOp, plainTextOp } from './model';
import { bindingScopeFor, pickerOptions, scopeAuthorable } from './pickerModel';

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
}

export function ColumnForm({
  controller,
  path,
  column,
  groups,
  params,
  capabilities,
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
      </div>
    </aside>
  );
}
