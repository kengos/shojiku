// A numeric field that can be driven entirely by the mouse: type any value, or open
// the ▼ and pick a common one. The word-processor font-size box, and the same shape
// `FormatPicker` already uses — a `SideButtonField` input beside a `PICKER_TOGGLE`,
// with a popover of rows.
//
// It is NOT a `StepperField` with a menu bolted on. Stepping and jumping-to-a-preset
// are different affordances: ▲▼ walk a value the author already has, while this is
// for reaching a value without knowing how to spell it — which is the whole point
// for a reader who would rather not type. A field can have either; none has both.
//
// Each row carries a SAMPLE of what the value does, the way the format picker shows
// an engine-rendered example: for a ruling width, a rule drawn at that width; for a
// ruby size, text at that size. A row can also carry a short NOTE — `default`, or
// `no ruling` — which is how a value whose meaning is not its number becomes
// discoverable at all.
//
// Typing and picking commit through ONE callback: commit-on-blur for the input,
// commit-on-click for a row. The caller decides what an empty field means, because
// that differs per key — clearing a ruling width returns it to the engine's
// default, while clearing a required count would break the document.

import { type ReactNode, useState } from 'react';
import { usePopover } from '../hooks/usePopover';
import { placementClasses, usePopoverPlacement } from '../hooks/usePopoverPlacement';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL, INPUT, PICKER_ROW, PICKER_TOGGLE } from '../ui/chrome';

/** One offered value. */
export interface ComboPreset {
  /** The value committed when the row is picked. `''` clears. */
  readonly value: string;
  /** What the row is called. Falls back to the value itself. */
  readonly label?: string;
  /** A short pill — for a value whose meaning is not its number. */
  readonly note?: string;
  /** A rendering of what this value DOES. */
  readonly sample?: ReactNode;
}

export interface NumericComboFieldProps {
  readonly label: string;
  /** The authored value as a display string; `''` = unset. */
  readonly value: string;
  /** Shown when the field is empty — what the unset value means. */
  readonly placeholder?: string;
  /** The unit pill inside the input. */
  readonly unit?: string;
  readonly presets: readonly ComboPreset[];
  /** Commit a typed or picked value. Called only when the value CHANGED. */
  readonly onCommit: (raw: string) => void;
  /** An optional line under the field — an origin, or what unset means. */
  readonly hint?: string;
  /** An optional `?` beside the label, for a field whose NAME does not let a
   * reader infer what it does. */
  readonly help?: ReactNode;
}

export function NumericComboField({
  label,
  value,
  placeholder,
  unit,
  presets,
  onCommit,
  hint,
  help,
}: NumericComboFieldProps) {
  const { t } = useI18n();
  const { open, setOpen, rootRef } = usePopover();
  const { placement, placeRef } = usePopoverPlacement(rootRef);
  // A nonce beside the value so the input RESEEDS after a commit the model refused
  // or normalised: without it a rejected value stays on screen as though it had
  // been accepted, and the next blur sees no change and commits nothing.
  const [nonce, setNonce] = useState(0);

  const write = (raw: string) => {
    setNonce((n) => n + 1);
    if (raw !== value) {
      onCommit(raw);
    }
  };
  // Blur must NOT close the popover. Pressing a row focuses it, which blurs the
  // input FIRST — so a handler that closed on blur would unmount the row before its
  // `click` could fire, and the typed text would be committed in place of the value
  // the reader actually picked. `FormatPicker`, the shape this mirrors, keeps the
  // two apart for the same reason. jsdom fires no blur on click, so no test here can
  // see it; the row's own mousedown guard is what makes it safe in a browser.
  const commitTyped = (raw: string) => write(raw);
  const commitPick = (raw: string) => {
    setOpen(false);
    write(raw);
  };

  return (
    <div className="mb-2">
      {/* The input carries in-field chrome (the unit pill), so the label is
          associated by id rather than by wrapping — a wrapping label folds any
          suffix chrome into the control's accessible name. */}
      {/* The `?` is a SIBLING of the label, never inside it: a `<label>`'s text
          content becomes the input's accessible name, so a nested help button
          would both rename the field and hand its own clicks to the input. */}
      <div className="flex items-center gap-1">
        <label className={FIELD_LABEL} htmlFor={`combo-${label}`}>
          {label}
        </label>
        {help}
      </div>
      <div className="relative flex" ref={rootRef}>
        <div className="relative flex-1">
          <input
            id={`combo-${label}`}
            key={`${value}:${nonce}`}
            className={`${INPUT} rounded-r-none ${unit === undefined ? '' : 'pr-8'}`}
            defaultValue={value}
            placeholder={placeholder}
            onBlur={(event) => commitTyped(event.currentTarget.value)}
            onKeyDown={(event) => {
              // An IME confirming a conversion sends Enter too. Committing on it
              // would write a half-composed value, and nothing in jsdom or an
              // ASCII smoke would ever show it.
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.currentTarget.blur();
              }
            }}
          />
          {unit === undefined ? null : (
            <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2 rounded border border-border px-1 text-[10px] text-muted">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`${PICKER_TOGGLE} rounded-l-none border-l-0`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('combo.open', { field: label })}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true" className="text-[9px] leading-none">
            ▼
          </span>
        </button>
        {open ? (
          <div
            role="menu"
            ref={placeRef}
            className={`absolute ${placementClasses(placement)} z-10 w-max max-h-80 min-w-full overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-[0_4px_12px_rgb(0_0_0/0.15)]`}
          >
            {presets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                role="menuitem"
                className={PICKER_ROW}
                // Keep the focus where it is: without this the press blurs the
                // input, which commits the typed text, and the pick is lost.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitPick(preset.value)}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold text-sm tabular-nums">
                    {preset.label ?? preset.value}
                  </span>
                  {preset.note === undefined ? null : (
                    <span className="rounded-full border border-border px-1.5 text-[10px] text-muted">
                      {preset.note}
                    </span>
                  )}
                </span>
                {preset.sample === undefined ? null : (
                  <span className="flex min-h-3 items-center">{preset.sample}</span>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hint === undefined ? null : <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
