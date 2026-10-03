// One RANGE of a definitions node — 下限 〜 上限 with its unit — named by what it
// bounds: a number's value, a string's length, a table's rows, a list's values,
// or (inside a list's 「1 つ 1 つの値」) each value's length or value.
//
// Each bound is its own commit-on-blur entry (`RuleInput`); an empty entry
// clears the key, a hostile one is refused before any op exists (`rangeOp`).
// Under the pair: the shared consequence line (a warning, printing goes on) and,
// when the bounds contradict each other, the warning that every value warns.

import type { Op } from '@shojiku/designer-core';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, SECTION_TITLE } from '../ui/chrome';
import { RuleInput } from './RuleInput';
import { type NumberRefusal, type RangeKey, rangeConflict, rangeOp } from './valueRules';

export type RangeKind = 'bound' | 'length' | 'rows' | 'count' | 'elementLength' | 'elementBound';

const KEYS: Record<RangeKind, readonly [RangeKey, RangeKey]> = {
  bound: ['minimum', 'maximum'],
  elementBound: ['minimum', 'maximum'],
  length: ['minLength', 'maxLength'],
  elementLength: ['minLength', 'maxLength'],
  rows: ['minItems', 'maxItems'],
  count: ['minItems', 'maxItems'],
};

const UNIT: Record<RangeKind, string | null> = {
  bound: null,
  elementBound: null,
  length: 'data.range.unit.chars',
  elementLength: 'data.range.unit.chars',
  rows: 'data.range.unit.rows',
  count: 'data.range.unit.items',
};

/** The message for a refused number entry. */
export function useNumberRefusal(): (refusal: NumberRefusal) => string {
  const { t } = useI18n();
  return (refusal) => t(`data.refusal.${refusal}`);
}

export interface RangeFieldsProps {
  readonly kind: RangeKind;
  readonly keysPath: readonly string[];
  /** The authored values, as shown (`readValueRules(...).ranges`). */
  readonly ranges: Readonly<Record<RangeKey, string>>;
  readonly editable: boolean;
  readonly onDefEdit: (op: Op | null) => void;
}

export function RangeFields({ kind, keysPath, ranges, editable, onDefEdit }: RangeFieldsProps) {
  const { t } = useI18n();
  const refusalText = useNumberRefusal();
  const [minKey, maxKey] = KEYS[kind];
  const title = t(`data.range.${kind}`);
  const element = kind === 'elementLength' || kind === 'elementBound';
  const unit = UNIT[kind];
  const bound = (key: RangeKey, which: 'min' | 'max') => (
    <span className="w-28 shrink-0">
      <RuleInput
        label={t(`data.range.${which}`, { range: title })}
        value={ranges[key]}
        editable={editable}
        placeholder={t(`data.range.${which}None`)}
        className="tabular-nums"
        messageClassName="w-max max-w-[16rem]"
        onCommit={(raw) => {
          const edit = rangeOp(keysPath, key, ranges[key], raw);
          if (!edit.ok) {
            return refusalText(edit.refusal);
          }
          onDefEdit(edit.op);
          return null;
        }}
      />
    </span>
  );
  return (
    <section className="flex flex-col gap-1">
      {element ? (
        <span className={FIELD_LABEL}>{title}</span>
      ) : (
        <h3 className={SECTION_TITLE}>{title}</h3>
      )}
      <div className="flex flex-wrap items-start gap-2">
        {bound(minKey, 'min')}
        <span className="py-1 text-muted">〜</span>
        {bound(maxKey, 'max')}
        {unit === null ? null : <span className="py-1 text-sm text-muted">{t(unit)}</span>}
      </div>
      {rangeConflict(ranges[minKey], ranges[maxKey]) ? (
        <p className="m-0 rounded bg-warn-bg px-1.5 py-0.5 text-sm text-warn-text">
          {t('data.range.conflict')}
        </p>
      ) : null}
      {element ? null : <p className="m-0 text-sm text-muted">{t('data.range.hint')}</p>}
    </section>
  );
}
