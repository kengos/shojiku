// The property panel's ▲▼ stepper field: a commit-on-blur length/number input
// with one-step-per-click buttons. Split out of `fields.tsx`, which keeps the
// base widgets and the shared badge helper this file renders through.

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { badgeText, showsUnitHint, UnitBadge } from './fields';
import { useReseedKey } from './useReseedKey';

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
  /** What ELSE this field's key accepts (`mm`, `cm`, `in`, `em`, `rem`), shown
   * as the badge's hover bubble while the implicit `pt` is on screen. Opt-in:
   * the WIRE decides, and not every field wearing a `pt` badge takes a length
   * string — see `showsUnitHint`. */
  readonly unitHint?: string;
  /** Placeholder for an empty field whose unset meaning is a known value
   * (an unauthored coordinate means 0). Omit for none. */
  readonly placeholder?: string;
  /** Why the ▲▼ are unavailable, shown as their hover bubble while `canStep`
   * is false. The CALLER owns this string because only it knows which of the
   * several unsteppable states this field is in — a message naming percent and
   * em would be a lie over an empty or garbage value. Omit for no bubble. */
  readonly stepHint?: string;
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
  unitHint,
  placeholder,
  stepHint,
}: StepperFieldProps) {
  // An empty field shows its placeholder, so the unit belongs to THAT text.
  const shown = value === '' ? (placeholder ?? '') : value;
  const badge = badgeText(unit, shown, tag);
  const hint = showsUnitHint(unit, shown, unitHint) ? unitHint : undefined;
  const { t } = useI18n();
  // Explicit htmlFor/id association (not a wrapping label): the optional tag
  // badge sits inside the input wrapper, and inside a WRAPPING label its text
  // would join the computed label ("Width" would read "WidthAuto", breaking
  // by-name queries and screen-reader output).
  const id = useId();
  // Value-keyed as before, PLUS a nonce for the case the value cannot express:
  // a refused commit leaves the value untouched, so only the nonce moves. It
  // rides the inner input, never this component — see `useReseedKey`.
  const [inputKey, reseed] = useReseedKey(value);
  // Each button fills half the input's height (items-stretch + flex-1), so the
  // ▲▼ column always lines up with the input box exactly. Only the OUTER corners
  // are rounded: the column is flush against the input, so its left edge is the
  // input's right edge and must stay square.
  const stepBtn =
    'flex flex-1 cursor-pointer items-center justify-center border border-border bg-chrome px-1.5 text-[9px] leading-none text-text disabled:cursor-default disabled:opacity-40';
  return (
    <span className="mb-2 block">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      {/* No gap: a stepper reads as ONE control, so the ▲▼ column sits flush
        against the input (macOS/HIG, and the gdoc numeric field) rather than
        floating 4px off it. The seam is one shared border — the input squares
        its right corners, the column squares its left ones and pulls back a
        pixel. */}
      <span className="flex items-stretch">
        <span className={`relative flex min-w-0 flex-1${hint === undefined ? '' : ' group/tip'}`}>
          <input
            key={inputKey}
            id={id}
            type="text"
            className={`${INPUT} w-full min-w-0 rounded-r-none ${badge === undefined ? '' : 'pr-11'} ${
              tag === undefined ? '' : 'text-muted'
            }`}
            defaultValue={value}
            placeholder={placeholder}
            onBlur={(event) => {
              // Reseed after ANY committing blur, not only a refused one. The
              // field's job is to show what the document holds, and asking the
              // caller "did it land?" answers a different question: a commit
              // that CLAMPS to the value already committed lands, changes
              // nothing, and would leave the rejected text on screen.
              if (event.currentTarget.value !== value) {
                onCommit(event.currentTarget.value);
                reseed();
              }
            }}
          />
          {/* The SHARED badge primitive, not a second copy of its classes:
            the two drifted apart once already, and the hover bubble below has
            to sit on the same element in both fields. */}
          {badge === undefined ? null : <UnitBadge text={badge} />}
          {hint === undefined ? null : <TipBubble text={hint} />}
        </span>
        {/* The bubble rides the COLUMN, not the buttons: a disabled button is
          an unreliable hover target, and the explanation is about the pair. */}
        <span
          className={`-ml-px flex shrink-0 flex-col${
            !canStep && stepHint !== undefined ? ' group/tip relative' : ''
          }`}
        >
          <button
            type="button"
            className={`${stepBtn} rounded-tr-md`}
            aria-label={t('stepper.increment')}
            disabled={!canStep}
            onClick={() => onStep(1)}
          >
            ▲
          </button>
          <button
            type="button"
            className={`${stepBtn} -mt-px rounded-br-md`}
            aria-label={t('stepper.decrement')}
            disabled={!canStep}
            onClick={() => onStep(-1)}
          >
            ▼
          </button>
          {!canStep && stepHint !== undefined ? <TipBubble text={stepHint} /> : null}
        </span>
      </span>
    </span>
  );
}
