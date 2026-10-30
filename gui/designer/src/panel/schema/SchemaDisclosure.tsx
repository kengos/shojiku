// 「その他の設定」: the closed disclosure at the end of a surface holding the
// catalog keys no hand-made control there edits. Closed, it still says how
// many of them the target sets — a value in effect behind a closed door is
// the "why does it look like this?" a non-engineer cannot answer — and the
// count leaves the title once it is open and the values are in view. The open
// state is component state and never reaches the template; a surface with no
// field to list draws nothing.

import { useId, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { DisclosureToggle } from '../DisclosureToggle';
import { setCount } from './fieldEdit';
import { SchemaFields, type SchemaFieldsProps } from './SchemaFields';

export function SchemaDisclosure(props: SchemaFieldsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const { fields, values } = props;
  if (fields.length === 0) {
    return null;
  }
  const count = setCount(
    values,
    fields.map((field) => field.key),
  );
  return (
    <div className="mt-2">
      <DisclosureToggle
        open={open}
        bodyId={bodyId}
        title={
          open || count === 0 ? t('panel.schema.more') : t('panel.schema.moreSet', { n: count })
        }
        onToggle={() => setOpen(!open)}
      />
      {open ? (
        <div id={bodyId} className="mt-1">
          <SchemaFields {...props} />
        </div>
      ) : null}
    </div>
  );
}
