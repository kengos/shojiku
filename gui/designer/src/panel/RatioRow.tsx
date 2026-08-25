// The ratio cluster of the child-layout section (row mode only): one grow-weight
// input per child, colon-separated like a ratio is written, with a fixed-width chip
// standing in for a child that authors its own width (outside the split). The
// inputs are uncontrolled and commit on blur with a changed-guard, keyed by
// VALUE PLUS A REFUSAL NONCE — the panel-wide free-text posture.

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
  onCommit,
}: {
  readonly index: number;
  readonly child: ChildSlot;
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
  slots,
  onCommit,
}: {
  readonly slots: readonly ChildSlot[];
  readonly onCommit: (childPath: string, raw: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2">
      <span className={FIELD_LABEL}>{t('panel.layout.ratio')}</span>
      <div className="flex flex-wrap items-center gap-1">
        {slots.map((child, index) => (
          <Fragment key={child.path}>
            {index > 0 ? <span className="text-muted">:</span> : null}
            {child.fixedWidth ? (
              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
                {t('panel.layout.fixedWidth')}
              </span>
            ) : (
              <RatioInput index={index} child={child} onCommit={onCommit} />
            )}
          </Fragment>
        ))}
      </div>
      <p className="mt-1 mb-0 text-[11px] text-muted leading-relaxed">
        {t('panel.layout.ratioHint')}
      </p>
    </div>
  );
}
