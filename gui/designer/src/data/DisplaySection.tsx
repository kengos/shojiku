// How a field SHOWS on the page, beyond its type: for now the blank-form
// placeholder (`placeholder`), drawn verbatim when a binding to the field
// resolves to nothing. `PlaceholderField` is also the list element section's.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { RuleInput } from './RuleInput';
import { placeholderOp } from './valueRules';

export interface PlaceholderFieldProps {
  readonly keysPath: readonly string[];
  readonly placeholder: string;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
  /** The line under the field (a list element's differs: nothing prints it). */
  readonly hint?: string;
}

export function PlaceholderField({
  keysPath,
  placeholder,
  editable,
  onDefEdit,
  hint,
}: PlaceholderFieldProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-0.5">
      <span className={FIELD_LABEL}>{t('data.placeholder')}</span>
      <RuleInput
        label={t('data.placeholder')}
        value={placeholder}
        editable={editable}
        placeholder={t('data.none')}
        onCommit={(raw) => {
          onDefEdit(placeholderOp(keysPath, placeholder, raw));
          return null;
        }}
      />
      <p className="m-0 text-sm text-muted">{hint ?? t('data.placeholderHint')}</p>
    </div>
  );
}

export function DisplaySection(props: PlaceholderFieldProps) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-1">
      <h3 className={SECTION_TITLE}>{t('data.display')}</h3>
      <PlaceholderField {...props} />
    </section>
  );
}
