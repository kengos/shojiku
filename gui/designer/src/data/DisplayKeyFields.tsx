// Two plain display keys of a field — its currency code (a currency field) and
// its quantity unit (a quantity field); the decimal places are `PrecisionField`. Each is a commit-on-blur entry (`RuleInput`); an empty
// one writes nothing, and the line under it says what then applies.
//
// The currency and unit entries suggest the codes / keys the shipped locale
// packs carry display data for and still take anything typed (the engine prints
// an unknown one as written and warns). A unit the packs do not declare says so
// beside the entry: it prints verbatim, Diagnostics warns, printing goes on.

import type { Op } from '@shojiku/designer-core';
import { type ReactNode, useId } from 'react';
import { useI18n } from '../i18n/context';
import { clip } from '../palette/fieldDisplay';
import { CURRENCY_SUGGESTIONS } from '../panel/defaultsModel';
import { FIELD_LABEL } from '../ui/chrome';
import { currencyOp, unitOp } from './displayRules';
import { RuleInput } from './RuleInput';

/** The unit keys every shipped locale pack declares (drift-pinned). */
export const UNIT_SUGGESTIONS: readonly string[] = ['item'];

export interface DisplayKeyProps {
  readonly keysPath: readonly string[];
  /** The authored value, as shown. */
  readonly value: string;
  readonly editable: boolean;
  /** `false` = the host refused the edit (its edit-list cap; the rail says so). */
  readonly onDefEdit: (op: Op | null) => boolean;
}

function Suggested({
  label,
  hint,
  options,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly options: readonly string[];
  readonly children: (list: string) => ReactNode;
}) {
  const list = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={FIELD_LABEL}>{label}</span>
      {children(list)}
      <datalist id={list}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p className="m-0 text-sm text-muted">{hint}</p>
    </div>
  );
}

export function CurrencyField({ keysPath, value, editable, onDefEdit }: DisplayKeyProps) {
  const { t } = useI18n();
  const label = t('data.display.currency');
  return (
    <Suggested
      label={label}
      hint={t('data.display.currencyHint', { section: t('panel.doc.localeCurrency') })}
      options={CURRENCY_SUGGESTIONS}
    >
      {(list) => (
        <RuleInput
          label={label}
          value={value}
          editable={editable}
          list={list}
          className="font-mono"
          placeholder={t('data.display.currencyPlaceholder')}
          onCommit={(raw) => {
            onDefEdit(currencyOp(keysPath, value, raw));
            return null;
          }}
        />
      )}
    </Suggested>
  );
}

export function UnitField({
  keysPath,
  value,
  editable,
  onDefEdit,
  samples,
}: DisplayKeyProps & {
  /** What the default unit renders (the engine's quantity samples). */
  readonly samples: readonly string[];
}) {
  const { t } = useI18n();
  const label = t('data.display.unit');
  const fallback = UNIT_SUGGESTIONS[0];
  const hint =
    samples.length > 0
      ? t('data.display.unitHintSamples', { unit: fallback, samples: samples.join(' / ') })
      : t('data.display.unitHint', { unit: fallback });
  return (
    <Suggested label={label} hint={hint} options={UNIT_SUGGESTIONS}>
      {(list) => (
        <>
          <RuleInput
            label={label}
            value={value}
            editable={editable}
            list={list}
            className="font-mono"
            placeholder={fallback}
            onCommit={(raw) => {
              onDefEdit(unitOp(keysPath, value, raw));
              return null;
            }}
          />
          {value !== '' && !UNIT_SUGGESTIONS.includes(value) ? (
            <p className="m-0 rounded bg-chrome px-1.5 py-0.5 text-sm text-muted">
              {t('data.display.unitUnknown', { unit: clip(value) })}
            </p>
          ) : null}
        </>
      )}
    </Suggested>
  );
}
