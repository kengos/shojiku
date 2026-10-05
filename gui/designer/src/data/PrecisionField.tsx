// A field's decimal places (`precision`) — read by a currency field (each
// currency has its own standard places) and a percentage field. A whole number
// from 0 to `MAX_PRECISION`; anything else is refused beside the entry before
// an op exists (the wire is a `u32`, so a bad value would stop the file
// parsing). Empty writes nothing and the standard places apply.

import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import type { DisplayKeyProps } from './DisplayKeyFields';
import { MAX_PRECISION, type PrecisionRefusal, precisionOp } from './displayRules';
import { RuleInput } from './RuleInput';

export function PrecisionField({
  keysPath,
  value,
  editable,
  onDefEdit,
  currency,
}: DisplayKeyProps & {
  /** A currency field (each currency has its standard places) or a percentage. */
  readonly currency: boolean;
}) {
  const { t } = useI18n();
  const label = t('data.display.precision');
  const refusal = (reason: PrecisionRefusal) =>
    reason === 'over_max'
      ? t('data.refusal.over_max', { max: MAX_PRECISION })
      : t(`data.refusal.${reason}`);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={FIELD_LABEL}>{label}</span>
      <RuleInput
        label={label}
        value={value}
        editable={editable}
        className="font-mono"
        placeholder={t(
          currency ? 'data.display.precisionCurrency' : 'data.display.precisionStandard',
        )}
        onCommit={(raw) => {
          const edit = precisionOp(keysPath, value, raw);
          if (!edit.ok) {
            return refusal(edit.refusal);
          }
          // A host refusal (its edit cap) is reported in the rail.
          onDefEdit(edit.op);
          return null;
        }}
      />
      <p className="m-0 text-sm text-muted">
        {t(currency ? 'data.display.precisionHintCurrency' : 'data.display.precisionHint', {
          max: MAX_PRECISION,
        })}
      </p>
    </div>
  );
}
