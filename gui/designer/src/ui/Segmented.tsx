// A segmented control (gdoc/Figma-style pill of mutually-exclusive options) —
// a shared primitive so a two-state toggle reads as one control, not two loose
// buttons. Semantically a NATIVE radio group (fieldset + sr-only legend +
// visually-hidden radio inputs, the CheckboxList precedent), so "1 of 2" comes
// free for assistive tech and Biome's semantic-element rule is satisfied
// without suppressions; the label styles its checked/disabled state off the
// input via `has-*` variants. The active segment fills with the accent (the
// established toolbar idiom); an individual option may be disabled with its own
// tooltip (e.g. a fixed-mode option whose geometry is not yet resolved). The placement
// tab's auto⇄fixed toggle is the first consumer; the container-direction
// segment is the next.

import { type ReactNode, useId } from 'react';
import { TipBubble } from './TipBubble';

export interface SegmentedOption {
  readonly value: string;
  readonly label: string;
  /** Decorative leading icon (a real SVG glyph; the accessible name stays the
   * label text). Omit for a text-only segment. */
  readonly icon?: ReactNode;
  /** Instant-tooltip text (the gdoc-parity ~300ms bubble); omit for none. */
  readonly tip?: string;
  /** Disable this one option (it stays visible, greyed, non-selectable). */
  readonly disabled?: boolean;
}

export interface SegmentedProps {
  /** The currently-selected value (matches one option's `value`). */
  readonly value: string;
  readonly options: readonly SegmentedOption[];
  readonly onChange: (value: string) => void;
  /** The group's accessible name (the sr-only legend). */
  readonly ariaLabel: string;
  /** The id of an element describing the group — where a caller has a hint
   * that belongs in the DESCRIPTION channel rather than in the name. It rides
   * the fieldset AND every radio: the focusable elements here are the sr-only
   * inputs, and a description on a `role="group"` container alone is announced
   * far less reliably than one on the control that has focus. */
  readonly describedBy?: string;
}

const SEG_LABEL =
  'group/tip relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-border border-l px-2 py-1.5 text-muted text-sm font-medium first-of-type:border-l-0 hover:text-text has-checked:bg-accent has-checked:font-semibold has-checked:text-on-accent has-disabled:cursor-default has-disabled:opacity-40 has-disabled:hover:text-muted';

/** A full-width segmented radio group. One `onChange` per pick; a native radio
 * fires no change for a re-pick of the checked option or a disabled one. */
export function Segmented({ value, options, onChange, ariaLabel, describedBy }: SegmentedProps) {
  const name = useId();
  return (
    <fieldset
      aria-describedby={describedBy}
      className="mb-2 flex overflow-hidden rounded-md border border-border p-0"
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => (
        <label key={option.value} className={SEG_LABEL}>
          <input
            type="radio"
            name={name}
            aria-describedby={describedBy}
            className="sr-only"
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => {
              // Re-guard on disabled: a real browser never delivers the click,
              // but a synthetic one (jsdom, dispatched events) can.
              if (option.disabled !== true) {
                onChange(option.value);
              }
            }}
          />
          {option.icon}
          {option.label}
          {option.tip !== undefined ? <TipBubble text={option.tip} /> : null}
        </label>
      ))}
    </fieldset>
  );
}
