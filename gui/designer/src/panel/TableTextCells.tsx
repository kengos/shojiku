// The two free-text cells of the column sheet — the label and the width. Split
// out of `TableColumnCells` for the line budget, and they belong together: both
// are hand-rolled inputs (the sheet renders its own, so a sweep for the shared
// widgets cannot see them) and both carry their own reseed nonce.
//
// The nonce is what the CALLER's `key={`w<i>:<value>`}` cannot provide. A
// commit that NORMALISES leaves that value where it was — `lengthOp` runs
// `40.0` through `Number` and authors 40 — so without the nonce the typed
// entry would stay on screen over a document that never moved. The column
// FORM writes the same wire key through `TextField`, which reseeds; these
// cells have to agree with it.

import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { UnitBadge, unitIsImplicit } from './fields';
import { useReseedKey } from './useReseedKey';

export interface TextCellProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (next: string) => void;
}

/** The label cell: a plain text input committing on blur, only when changed. */
export function ColumnLabelCell({ label, value, onCommit }: TextCellProps) {
  const [inputKey, reseed] = useReseedKey(value);
  return (
    <input
      key={inputKey}
      type="text"
      className={INPUT}
      aria-label={label}
      defaultValue={value}
      onBlur={(event) => {
        if (event.currentTarget.value !== value) {
          onCommit(event.currentTarget.value);
          reseed();
        }
      }}
    />
  );
}

/** The width cell: the same commit-on-change input, plus the implicit-unit
 * badge. A column width is commonly a `%`; the badge shows only while the value
 * is bare, i.e. while the pt is the invisible one. */
export function ColumnWidthCell({ label, value, onCommit }: TextCellProps) {
  const { t } = useI18n();
  const implicit = unitIsImplicit(value);
  const [inputKey, reseed] = useReseedKey(value);
  return (
    // The strip's cell is the wrapper, so the badge can sit over the input
    // without leaving the grid.
    //
    // The SHEET writes the same wire key through the same builder as the
    // column FORM (`lengthOp(path, ['width'])`), so it takes a unit string
    // just as readily and carries the same invitation. It renders its own
    // input instead of going through `StepperField`/`TextField`, which is
    // exactly why a sweep for the `unit=` PROP cannot see this site.
    //
    // That shared builder is also why this cell needs its own reseed nonce.
    // The CALLER keys it by `column.width`, which cannot move when the commit
    // NORMALISES — `lengthOp` runs the entry through `Number`, so `40.0` over
    // a 40pt column authors 40 and leaves `40.0` on screen. The column form
    // writes the same key through `TextField` and takes it back; without this
    // the two surfaces would disagree about one wire key.
    <span className={`relative flex min-w-0${implicit ? ' group/tip' : ''}`}>
      <input
        key={inputKey}
        type="text"
        className={`${INPUT} w-full min-w-0 ${implicit ? 'pr-9' : ''}`}
        aria-label={label}
        defaultValue={value}
        onBlur={(event) => {
          if (event.currentTarget.value !== value) {
            onCommit(event.currentTarget.value);
            reseed();
          }
        }}
      />
      {implicit ? <UnitBadge text="pt" /> : null}
      {implicit ? <TipBubble text={t('stepper.unitHint')} /> : null}
    </span>
  );
}
