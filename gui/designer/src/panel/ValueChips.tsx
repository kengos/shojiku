// A labelled group of value chips — the pick-don't-type half of the value
// control (`ValueControl`): an enum's declared values, or the values the sample
// data carries for a free-entry field. The chip matching the current value is
// pressed (the format toolbar's pressed-button look), and pressing it again
// authors nothing. An enum's group leads with an UNSET chip, pressed while the
// wire carries no value: without it a value picked once could never be taken
// back, since the chips only ever replace one value with another.

/** A labelled group of value chips; the one matching `current` is pressed, and
 * pressing it again changes nothing. */
export function ValueChips({
  label,
  values,
  current,
  unset,
  onPick,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly current: string;
  /** The leading "not set" chip: its label, and whether the wire is unset now.
   * Picking it hands up `''`, which the value's op builders read as "remove". */
  readonly unset?: { readonly label: string; readonly active: boolean };
  readonly onPick: (value: string) => void;
}) {
  const chip = (key: string, text: string, pressed: boolean, pick: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={pressed}
      // `bg-surface` is not decoration: with no preflight a bare button keeps
      // the browser's grey face under the theme's text colour.
      className="max-w-full cursor-pointer truncate rounded-full border border-border bg-surface px-2 py-0.5 text-sm text-text aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
      onClick={() => {
        if (!pressed) {
          onPick(pick);
        }
      }}
    >
      {text}
    </button>
  );
  return (
    <fieldset className="m-0 mb-2 border-0 p-0">
      <legend className="mb-1 p-0 text-muted text-xs">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {unset === undefined ? null : chip('\u0000unset', unset.label, unset.active, '')}
        {values.map((value) => chip(value, value, !unset?.active && value === current, value))}
      </div>
    </fieldset>
  );
}
