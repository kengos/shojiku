// The split-by-ratio checkbox under a row's ratio inputs: whether the children
// without a width of their own start from NOTHING (`flexBasis: 0`, so the ratio
// divides the whole row — CSS's `flex: 1`) or from their content width (the engine
// default, the ratio then sharing only what is left). One checkbox for the row,
// because the case it exists for is "equal shares regardless of content", which is
// a statement about the row; a row whose children disagree reads as the mixed
// state, and ticking it makes them agree. Absent — not disabled — against an
// engine that would reject the key; disabled, with nothing to say, when every
// child has its own width.

import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';
import type { BasisState } from './layoutModel';

/** The engine capability that admits `flexBasis` (older engines reject it). */
export const BASIS_CAPABILITY = 'box.flexBasis';

export function BasisCheck({
  basis,
  onToggle,
}: {
  /** `empty` = no child is in the split (every one has its own width or
   * position). */
  readonly basis: BasisState;
  /** `true` = tick (start every slot from zero), `false` = untick. */
  readonly onToggle: (on: boolean) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  // `indeterminate` is a DOM property with no attribute, so it is set after
  // render rather than passed as a prop.
  useEffect(() => {
    (ref.current as HTMLInputElement).indeterminate = basis === 'mixed';
  }, [basis]);
  return (
    // A disabled box greys its words too (the Segmented precedent) — a
    // full-strength label over a dead box reads as clickable.
    <label className="mb-2 flex items-center gap-1.5 text-sm text-text has-disabled:opacity-40">
      <input
        ref={ref}
        type="checkbox"
        checked={basis === 'all'}
        disabled={basis === 'empty'}
        // A mixed row ticks: the checkbox's job is making the row agree.
        onChange={() => onToggle(basis !== 'all')}
      />
      {t('panel.layout.basisZero')}
    </label>
  );
}
