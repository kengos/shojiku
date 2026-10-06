// The ratio cluster of the child-layout section (a row or a stack): one grow-weight
// input per child the engine lays out by flex (the caller passes only those), colon-separated like a ratio is written, with a fixed-size chip
// standing in for a child that authors its own size on the main axis (its width in
// a row, its height in a stack — outside the split). An unset weight is an EMPTY
// input whose placeholder says what the engine does with it: in a stack it is 0;
// in a row it depends on whether the child's content can be measured, which the
// document alone cannot always tell, so the placeholder says "auto" instead of a
// number that may be false. The inputs are uncontrolled and commit on blur with a
// changed-guard, keyed by VALUE PLUS A REFUSAL NONCE — the panel-wide free-text
// posture.
//
// These deliberately do NOT go through `StepperField`, the way most of the
// panel's numeric fields do. A ratio is READ as a row — `2 : 3 : 1` — so each
// weight is a bare `w-10` box between colons, with one label for the whole row;
// the stepper renders a labelled full-width block with a ▲▼ column beside it,
// and three of those would say the weights are three unrelated settings. The
// chrome here is a one-off by design, not drift.

import { Fragment } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import type { ChildSlot } from './layoutModel';
import { useReseedKey } from './useReseedKey';

/** One child's weight input. A component of its own, not an inline element:
 * the slot list is variable-length, so its reseed hook cannot be called from
 * the parent's map. */
function RatioInput({
  index,
  child,
  placeholder,
  onCommit,
}: {
  readonly index: number;
  readonly child: ChildSlot;
  readonly placeholder: string;
  readonly onCommit: (childPath: string, raw: string) => void;
}) {
  const { t } = useI18n();
  const [inputKey, reseed] = useReseedKey(child.ratio);
  return (
    <input
      key={inputKey}
      type="text"
      inputMode="decimal"
      aria-label={`${t('panel.layout.ratio')} ${index + 1}`}
      className="w-10 rounded-md border border-border bg-surface px-1 py-0.5 text-center text-sm text-text"
      defaultValue={child.ratio}
      placeholder={placeholder}
      onBlur={(event) => {
        if (event.currentTarget.value !== child.ratio) {
          onCommit(child.path, event.currentTarget.value);
          reseed();
        }
      }}
    />
  );
}

export function RatioRow({
  axis,
  slots,
  onCommit,
}: {
  /** The split's axis: a row shares width, a stack height. */
  readonly axis: 'row' | 'column';
  readonly slots: readonly ChildSlot[];
  readonly onCommit: (childPath: string, raw: string) => void;
}) {
  const { t } = useI18n();
  const row = axis === 'row';
  const placeholder = row ? t('panel.layout.ratio.auto') : '0';
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.layout.ratio')}</span>
      <div className="flex flex-wrap items-center gap-1">
        {slots.map((child, index) => (
          <Fragment key={child.path}>
            {index > 0 ? <span className="text-muted">:</span> : null}
            {(row ? child.fixedWidth : child.fixedHeight) ? (
              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
                {t(row ? 'panel.layout.fixedWidth' : 'panel.layout.fixedHeight')}
              </span>
            ) : (
              <RatioInput
                index={index}
                child={child}
                placeholder={placeholder}
                onCommit={onCommit}
              />
            )}
          </Fragment>
        ))}
      </div>
      <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
        {t(row ? 'panel.layout.ratioHint' : 'panel.layout.ratioHint.column')}
      </p>
    </div>
  );
}
