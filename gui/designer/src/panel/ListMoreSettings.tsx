// The two closed disclosures under a list's data-source section, drawn from
// the catalog's `list` keys less the one the section edits itself (its
// per-entry text, `listSourceOwnedKeys`) and less what the engine cannot read:
// 「差し込みの設定」 for the `bindings:` declarations (`BindingsDisclosure`),
// then 「その他の設定」 for every other listed key (today `overflowText`, which
// shows its initial `+{count}` as the placeholder and a note on what it does).
// Both are live: one op per edit, at the list itself.

import { useI18n } from '../i18n/context';
import { BindingsDisclosure } from './BindingsDisclosure';
import { entryFields } from './bindingsModel';
import { listSourceOwnedKeys } from './IterableSourceSection';
import type { ItemPanelProps } from './itemPanelProps';
import { applyPanelOp } from './model';
import { type FieldValues, fieldEditOp, valueAt } from './schema/fieldEdit';
import { capableFields, listedFields } from './schema/listedFields';
import { SchemaDisclosure } from './schema/SchemaDisclosure';

/** The list keys no field of the data-source section edits, before the
 * capability filter. */
const LISTED = listedFields({ kind: 'item', type: 'list' }, listSourceOwnedKeys());

/** The key the declaration cards edit rather than 「その他の設定」. */
const BINDINGS_KEY = 'bindings';

export function ListMoreSettings(props: ItemPanelProps) {
  const { t } = useI18n();
  const { controller, path, view, capabilities } = props;
  // The panel draws only for a path that reads as an item map (`readItemView`).
  const item = controller.read(path) as FieldValues;
  const fields = capableFields(LISTED, capabilities);
  const bindings = fields.find((field) => field.key === BINDINGS_KEY);
  const rest = fields.filter((field) => field !== bindings);
  return (
    <>
      {bindings === undefined ? null : (
        <BindingsDisclosure
          props={props}
          fields={capableFields(entryFields(bindings), capabilities)}
          bindings={valueAt(item, BINDINGS_KEY)}
          text={view.text}
        />
      )}
      <SchemaDisclosure
        fields={rest}
        values={item}
        context={{ unset: 'initial', capabilities }}
        onEdit={(edit) => applyPanelOp(controller, fieldEditOp(path, [], edit))}
        // The only other listed key is overflowText (pinned at two in
        // `listedFields.test.ts`), so the note is its own.
        footer={<p className="m-0 mt-1 text-xs text-muted">{t('panel.overflowText.note')}</p>}
      />
    </>
  );
}
