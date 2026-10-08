// The BOUND arm of a mark's presence: which data field decides it, and the value
// that does. One component for every `MarkBinding` the panel edits — an
// `ellipse`'s / `checkbox`'s `data:` (`MarkSection`) and a text item's circle,
// `mark.data:` (`TextMarkSection`) — because the wire is one struct
// (`MarkBinding`, `engine/core/src/template/marks.rs`), so its picker, its value
// control and its stale-`equals` reconciliation are one too. `markPath` is the
// map that CARRIES `data:`: the item for a form mark, `<item>.mark` for the text.
//
// The predicate is the same `{ key, equals? }` `visible:` uses, so the field
// picker, the value control and the reconciliation are the shared ones — there
// is no second grammar to learn here or to keep in agreement.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { FieldPicker } from './FieldPicker';
import { type MarkRow, valueFormFor } from './markModel';
import { repointMarkOps, setMarkEqualsOp } from './markOps';
import { applyPanelOp } from './model';
import type { PickerOption } from './pickerModel';
import { ValueControl } from './ValueControl';

export interface MarkBindingFieldsProps {
  readonly controller: EditorController;
  /** The map whose `data:` this edits. */
  readonly markPath: string;
  readonly row: MarkRow;
  readonly options: readonly PickerOption[];
  /** The top-level rows, when the item sits in a row scope that can carry
   * `scope: document` (see `scopePickerProps`). */
  readonly documentOptions: readonly PickerOption[] | undefined;
  /** What the value decides — drawing, a tick, a circle. */
  readonly valueLabel: string;
}

export function MarkBindingFields({
  controller,
  markPath,
  row,
  options,
  documentOptions,
  valueLabel,
}: MarkBindingFieldsProps) {
  const { t } = useI18n();
  const all = [...options, ...(documentOptions ?? [])];
  const repoint = (key: string, documentScoped?: boolean) => {
    const option = all.find((o) => o.key === key);
    controller.applyAll(
      repointMarkOps(
        markPath,
        key,
        option?.type ?? '',
        option?.enumValues ?? [],
        row.hasEquals,
        row.equals,
        documentScoped,
        row.hasScope,
        row.boolEquals,
      ),
    );
  };
  const picked = all.find((o) => o.key === row.key);
  const form = valueFormFor(picked?.type ?? '', picked?.enumValues ?? []);
  return (
    <>
      <FieldPicker
        label={t('panel.mark.field')}
        value={row.key}
        options={options}
        documentOptions={documentOptions}
        scope={row.documentScope ? 'document' : ''}
        // Repointing can change which controls render (a boolean field's
        // yes/no cannot show a text `equals`), so a stale `equals` is
        // reconciled in the SAME batch — one transactional undo step.
        onCommit={(key) => repoint(key, undefined)}
        // A PICKED row commits with the scope it was offered at. Typing a
        // key never re-scopes: the file's `scope:` stays as authored.
        onPick={documentOptions === undefined ? undefined : repoint}
      />
      <ValueControl
        form={form}
        rule={row}
        options={picked?.enumValues ?? []}
        label={valueLabel}
        onChange={(value) =>
          applyPanelOp(controller, setMarkEqualsOp(markPath, value, picked?.type ?? ''))
        }
      />
      {row.documentScope ? (
        // The panel does not edit `scope:` — it is an authoring-level
        // choice — but silently not showing it would misdescribe the
        // document, so the row says what the wire holds.
        <p className="m-0 text-muted text-xs">{t('panel.mark.documentScope')}</p>
      ) : null}
    </>
  );
}
