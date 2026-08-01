// The `enum` select of the sample-value editor: a field declaring a closed set
// is PICKED from, never typed into — the machine value the document carries
// (`backorder`) is spelled out beside the words it prints (`（入荷待ち）`), so a
// non-engineer chooses safely and an engineer can still read the produced file.

import { useI18n } from '../i18n/context';
import { MAX_ENUM_OPTIONS } from '../palette/caps';
import type { EnumOption } from '../palette/fieldDisplay';
import { Field } from '../panel/fields';
import { INPUT } from '../ui/chrome';

/** Whether the declared set is offerable as a choice at all. A list that
 * reaches the display cap is SATURATED, not merely long: the options shown
 * would silently omit declared values the user then could not pick, so the
 * field stands down to free entry rather than offering a truncated set. */
export function offerable(options: readonly EnumOption[]): boolean {
  return options.length > 0 && options.length < MAX_ENUM_OPTIONS;
}

/** The options to render: the declared members, plus the CURRENT value when
 * the document carries one the set does not declare. An externally-authored
 * params file may hold anything, and hiding it would silently rewrite the
 * document on the next commit — it stays visible and pickable-away-from. */
function optionsWith(options: readonly EnumOption[], value: string): readonly EnumOption[] {
  return options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: '' }];
}

/** The enum select: values labeled with the words the document prints, with
 * the machine value shown beneath so the produced file stays legible. */
export function EnumValueField({
  label,
  value,
  options,
  compact,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly EnumOption[];
  readonly compact?: boolean;
  readonly onCommit: (raw: string) => void;
}) {
  const { t } = useI18n();
  const shown = optionsWith(options, value);
  const declared = options.some((option) => option.value === value);
  const labeled = shown.some((option) => option.label !== '');
  return (
    <>
      <Field label={label}>
        {/* Committed on change: a select has no half-entered state to protect,
            so waiting for blur would only delay the preview. */}
        <select
          className={INPUT}
          defaultValue={value}
          onChange={(event) => {
            if (event.currentTarget.value !== value) {
              onCommit(event.currentTarget.value);
            }
          }}
        >
          {shown.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label === '' ? option.value : option.label}
            </option>
          ))}
        </select>
      </Field>
      {!declared ? (
        <p className="mb-2 inline-block rounded bg-warn-bg px-1.5 py-0.5 text-sm text-warn-text">
          {t('sample.enumUndeclared')}
        </p>
      ) : null}
      {/* Only a LABELED set hides the machine value, so only it needs the
          caption; a bare set already shows the value on the trigger. */}
      {declared && labeled && compact !== true ? (
        <p className="mb-2 font-mono text-sm text-muted">{t('sample.enumRawValue', { value })}</p>
      ) : null}
    </>
  );
}
