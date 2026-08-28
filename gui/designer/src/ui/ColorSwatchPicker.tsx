// A curated-swatch + native-custom color popover, shared by the format toolbar
// (text color / fill) and the property panel's fill-and-border cluster and the border
// editor's pen. No hand-typed hex is ever required — every swatch and the native
// `<input type="color">` emit a valid `#rrggbb`; a document-derived color reaches
// the chip preview ONLY through `isHexColor`, so a hostile `url(…)`/`expression(…)`
// renders neutral. The caller owns the op an `onCommit` builds (a toolbar
// minimal-wire op vs a panel plainTextOp), so this widget carries no wire
// knowledge — it only presents the palette and reports the chosen value.

import { usePopover } from '../hooks/usePopover';
import { placementClasses, usePopoverPlacement } from '../hooks/usePopoverPlacement';
import { chipPaint, isHexColor } from './chipContrast';
import { SwatchGrid } from './SwatchGrid';
import { TipBubble } from './TipBubble';

export interface ColorSwatchPickerProps {
  /** The trigger's accessible name. */
  readonly label: string;
  /** The id of an element describing the trigger — a caller's hover hint that
   * belongs in the DESCRIPTION channel rather than in the name. */
  readonly describedBy?: string;
  /** The effective color (`''` = unset — the chip renders the paper token). */
  readonly value: string;
  /** Commit a chosen color; `''` clears (reverts to the cascade/default). */
  readonly onCommit: (value: string) => void;
  /** The trigger button's chrome (FMT_BTN in the toolbar, a panel button
   * elsewhere) — the swatch chip is rendered inside it. */
  readonly triggerClassName: string;
  /** When set, a hover TipBubble (shown while the popover is closed). */
  readonly tip?: string;
  readonly customLabel: string;
  readonly clearLabel: string;
}

export function ColorSwatchPicker({
  label,
  describedBy,
  value,
  onCommit,
  triggerClassName,
  tip,
  customLabel,
  clearLabel,
}: ColorSwatchPickerProps) {
  const { open, setOpen, rootRef } = usePopover();
  const { placement, placeRef } = usePopoverPlacement(rootRef);
  const chip = isHexColor(value) ? value : undefined;
  // The native picker seeds from the current color (or black) and commits only
  // on a change FROM that seed, so opening the popover and tabbing through the
  // input never writes a phantom `#000000`.
  const seed = chip ?? '#000000';
  const commit = (next: string) => {
    setOpen(false);
    onCommit(next);
  };
  return (
    <div className="group/tip relative" ref={rootRef}>
      {tip !== undefined && !open ? <TipBubble text={tip} /> : null}
      <button
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        // NOT-YET: the closed trigger renders only the chip, so it says which field
        // this is and nothing about what colour is in it — a reader who cannot tell
        // the swatch apart from its neighbour has to OPEN the popover to find out,
        // and closing it throws that answer away again. The approved mock puts
        // `name · #hex` beside the chip, and that belongs to the FIELD rather than
        // to this widget: the trigger chrome is caller-owned and ranges from a
        // toolbar icon button to a panel swatch, so there is no one place here to
        // put a line of text. Owed by the char_grid colour field in PR-C, and by
        // the seven existing fields after it. Deliberately NOT approximated with an
        // `aria-label` here — that would serve a screen reader while leaving the
        // sighted reader this was asked for with exactly what they have now.
        aria-label={label}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="sj-color-chip block size-3.5 rounded-[2px] border border-border"
          // `chipPaint` takes the RAW `value` and owns the not-a-colour case, so a
          // hostile string reaches no inline colour, and an UNSET field gets the
          // checkerboard rather than a token fill that vanishes on the dark surface.
          style={chipPaint(value)}
        />
      </button>
      {open ? (
        <div
          role="menu"
          ref={placeRef}
          className={`absolute ${placementClasses(placement)} z-10 w-max max-h-[calc(100vh-2rem)] overflow-y-auto rounded-md border border-border bg-surface p-2 shadow-[0_4px_12px_rgb(0_0_0/0.15)]`}
        >
          <SwatchGrid onPick={commit} value={value} />
          <label className="mt-2 flex items-center justify-between gap-2 text-sm text-muted">
            <span>{customLabel}</span>
            <input
              key={seed}
              type="color"
              defaultValue={seed}
              onBlur={(event) => {
                if (event.currentTarget.value !== seed) {
                  commit(event.currentTarget.value);
                }
              }}
            />
          </label>
          <button
            type="button"
            role="menuitem"
            className="mt-1 w-full cursor-pointer border-0 border-t border-border bg-transparent pt-1 text-left text-sm text-text"
            onClick={() => commit('')}
          >
            {clearLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
