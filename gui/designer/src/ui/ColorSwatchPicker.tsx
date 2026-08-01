// A curated-swatch + native-custom color popover, shared by the format toolbar
// (text color / fill) and the property panel's fill-and-border cluster and the border
// editor's pen. No hand-typed hex is ever required — every swatch and the native
// `<input type="color">` emit a valid `#rrggbb`; a document-derived color reaches
// the chip preview ONLY through `isHexColor`, so a hostile `url(…)`/`expression(…)`
// renders neutral. The caller owns the op an `onCommit` builds (a toolbar
// minimal-wire op vs a panel plainTextOp), so this widget carries no wire
// knowledge — it only presents the palette and reports the chosen value.

import { usePopover } from '../hooks/usePopover';
import { TipBubble } from './TipBubble';

/** A curated `#rrggbb` swatch palette (neutral business colors). The custom
 * picker covers everything else. Every entry is a valid 6-digit hex (pinned by
 * a unit test). */
export const SWATCHES: readonly string[] = [
  '#000000',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#ffffff',
  '#b91c1c',
  '#c2410c',
  '#b45309',
  '#15803d',
  '#1d4ed8',
  '#6d28d9',
];

/** A strict 6-digit `#rrggbb` guard: a document-derived color reaches a swatch
 * preview's inline style ONLY through this. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export interface ColorSwatchPickerProps {
  /** The trigger's accessible name. */
  readonly label: string;
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
  value,
  onCommit,
  triggerClassName,
  tip,
  customLabel,
  clearLabel,
}: ColorSwatchPickerProps) {
  const { open, setOpen, rootRef } = usePopover();
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
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="sj-color-chip block size-3.5 rounded-[2px] border border-border bg-bg"
          style={chip === undefined ? undefined : { backgroundColor: chip }}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+var(--sj-space-1))] z-10 rounded-md border border-border bg-surface p-2 shadow-[0_4px_12px_rgb(0_0_0/0.15)]"
        >
          <div className="grid grid-cols-[repeat(6,20px)] gap-1">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                role="menuitem"
                className="size-5 cursor-pointer rounded-[2px] border border-border"
                aria-label={swatch}
                style={{ backgroundColor: swatch }}
                onClick={() => commit(swatch)}
              />
            ))}
          </div>
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
