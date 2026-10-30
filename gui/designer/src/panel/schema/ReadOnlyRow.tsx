// A key whose value the section cannot show in a control: a per-side border
// map, a value in a shape its kind does not take, or any value of a kind the
// section has no control for (an entry map, an unread node). The row names the key
// and says where it can be edited; it writes nothing, so the value survives
// every edit made around it.

import { useI18n } from '../../i18n/context';
import { FIELD_LABEL } from '../../ui/chrome';

export function ReadOnlyRow({
  label,
  sides,
}: {
  readonly label: string;
  /** The value is a per-side map of a key that also takes one value. */
  readonly sides: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{label}</span>
      <p className="m-0 text-sm text-text">
        {t(sides ? 'panel.schema.readOnly.sides' : 'panel.schema.readOnly.value')}
      </p>
      <p className="m-0 text-xs text-muted">{t('panel.schema.readOnly.where')}</p>
    </div>
  );
}
