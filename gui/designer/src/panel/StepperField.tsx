// The property panel's ▲▼ stepper field: a commit-on-blur length/number input
// with one-step-per-click buttons. Split out of `fields.tsx`, which keeps the
// base widgets and the shared badge helper this file renders through.

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { badgeText } from './fields';

export interface StepperFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  /** Step the value by one increment in `dir` (+1 up, −1 down). */
  readonly onStep: (dir: 1 | -1) => void;
  /** Whether the current value is a steppable length/number; the ▲▼ buttons
   * are disabled otherwise (a relative unit / empty / garbage value), while the
   * text input stays editable so the user can type a fresh value. */
  readonly canStep: boolean;
  /** A small suffix badge inside the input (e.g. an auto tag when the shown
   * value is an engine-resolved seed, not an authored one). Omit for none. */
  readonly tag?: string;
  /** The unit a BARE value carries (`'pt'` for every engine length). Shown in
   * the suffix badge only while the value is a bare numeral — a `12mm` /
   * `50%` value states its unit itself. Omit on a unitless number (a ratio
   * like lineHeight or flexGrow). */
  readonly unit?: string;
  /** Placeholder for an empty field whose unset meaning is a known value
   * (an unauthored coordinate means 0). Omit for none. */
  readonly placeholder?: string;
}

/** A numeric/length field with ▲▼ steppers. The input keeps the plain
 * commit-on-blur semantics (unit-preserving, unchanged from `TextField`); each
 * ▲▼ click dispatches ONE step op = one undo step (mirroring the canvas grid
 * nudge). The buttons only step the last COMMITTED value; there is no
 * arrow-key/hold-to-repeat in this first wave (an op remounts the panel body,
 * which would drop input focus). */
export function StepperField({
  label,
  value,
  onCommit,
  onStep,
  canStep,
  tag,
  unit,
  placeholder,
}: StepperFieldProps) {
  // An empty field shows its placeholder, so the unit belongs to THAT text.
  const badge = badgeText(unit, value === '' ? (placeholder ?? '') : value, tag);
  const { t } = useI18n();
  // Explicit htmlFor/id association (not a wrapping label): the optional tag
  // badge sits inside the input wrapper, and inside a WRAPPING label its text
  // would join the computed label ("Width" would read "WidthAuto", breaking
  // by-name queries and screen-reader output).
  const id = useId();
  // Each button fills half the input's height (items-stretch + flex-1), so the
  // ▲▼ column always lines up with the input box exactly.
  const stepBtn =
    'flex flex-1 cursor-pointer items-center justify-center border border-border bg-chrome px-1.5 text-[9px] leading-none text-text disabled:cursor-default disabled:opacity-40';
  return (
    <span className="mb-2 block">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <span className="flex items-stretch gap-1">
        <span className="relative flex min-w-0 flex-1">
          <input
            key={value}
            id={id}
            type="text"
            className={`${INPUT} w-full min-w-0 ${badge === undefined ? '' : 'pr-11'} ${
              tag === undefined ? '' : 'text-muted'
            }`}
            defaultValue={value}
            placeholder={placeholder}
            onBlur={(event) => {
              if (event.currentTarget.value !== value) {
                onCommit(event.currentTarget.value);
              }
            }}
          />
          {badge === undefined ? null : (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-border px-1 text-[10px] leading-tight text-muted"
            >
              {badge}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col">
          <button
            type="button"
            className={`${stepBtn} rounded-t-md`}
            aria-label={t('stepper.increment')}
            disabled={!canStep}
            onClick={() => onStep(1)}
          >
            ▲
          </button>
          <button
            type="button"
            className={`${stepBtn} -mt-px rounded-b-md`}
            aria-label={t('stepper.decrement')}
            disabled={!canStep}
            onClick={() => onStep(-1)}
          >
            ▼
          </button>
        </span>
      </span>
    </span>
  );
}
