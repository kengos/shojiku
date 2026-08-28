// The palette laid out so it can be USED without distinguishing the colours: hue
// names across the top, darkness steps down the side, and a readout line that names
// whatever the pointer or the keyboard is currently on. A reader who cannot tell
// `#b91c1c` from `#15803d` reaches "the darkest red" by counting to a column and a
// row, and confirms it by reading the line rather than by looking at the square.
//
// The readout follows FOCUS as well as hover, so the keyboard path is not the
// degraded one: tabbing across the grid narrates it exactly as sweeping the mouse
// does. It reports the currently-committed colour when nothing is hovered, so the
// line is never blank while a colour is selected.
//
// This renders the grid only. The popover shell, the custom-colour input and the
// clear row stay with `ColorSwatchPicker`, which owns the commit.

import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { chipPaint } from './chipContrast';
import { swatchName } from './swatchNames';
import { HUE_COLUMNS, NEUTRALS, SHADE_STEPS } from './swatchPalette';

/** A grid cell's own chrome. The ring `chipPaint` supplies is what keeps each end of
 * the palette visible against the popover's surface. */
const SWATCH = 'size-5 cursor-pointer rounded-[2px] border border-border';

/** Column-header / row-label chrome: small, muted, and never the only way to tell
 * two swatches apart. */
const AXIS_LABEL = 'text-center text-muted text-xs';

/** The readout echoes the CURRENT value, and a value outside the palette is named
 * by itself — a string a template authored, with no length bound anywhere on the
 * way here (`display()` passes any string through verbatim). The popover is sized
 * to its widest child and that width then decides which way it flips, so an absurd
 * value would both stretch the popover off the screen and defeat the placement
 * that exists to keep it on. Clipped for DISPLAY only; the accessible name on each
 * swatch is unaffected. */
const MAX_READOUT_CHARS = 40;

function clipForReadout(value: string): string {
  return value.length <= MAX_READOUT_CHARS ? value : `${value.slice(0, MAX_READOUT_CHARS - 1)}…`;
}

const GRID_ROW = 'grid items-center justify-items-center gap-1';

/** A label gutter, then one column per hue sized to its HEADER rather than to the
 * 20px swatch: a name like `オレンジ` or `琥珀色` pinned to the swatch width wraps to
 * one character per line, and that label is exactly what a reader who cannot tell the
 * colours apart navigates by. The swatches keep their own size and centre in the
 * wider column.
 *
 * Written as an inline style, not a Tailwind arbitrary value: `minmax()` nested
 * inside `repeat()` generates no rule, so the class silently produced nothing and the
 * columns stayed at the swatch width — visible only by reading the computed
 * `grid-template-columns` back out of the running app. */
const GRID_COLUMNS = { gridTemplateColumns: '2.5rem repeat(6, minmax(1.25rem, auto))' } as const;

export interface SwatchGridProps {
  /** Commit a chosen colour. */
  readonly onPick: (value: string) => void;
  /** The currently-committed colour, named in the readout when nothing is hovered.
   * `''` when the field is unset. */
  readonly value: string;
}

export function SwatchGrid({ onPick, value }: SwatchGridProps) {
  const { t } = useI18n();
  // What the readout is currently naming. `null` = nothing under the pointer or
  // focus, so it falls back to the committed value.
  const [previewed, setPreviewed] = useState<string | null>(null);
  const shown = previewed ?? (value === '' ? null : value);

  // The readout clears on the way OUT of a swatch as well as filling on the way in,
  // so leaving the grid returns the line to the committed colour. Both handlers live
  // on the swatch itself: a wrapper carrying them would be a static element with
  // mouse handlers, which is the shape the a11y rule rejects — and rightly, since a
  // reader on the keyboard would get nothing from it.
  const cell = (hex: string) => (
    <button
      key={hex}
      type="button"
      role="menuitem"
      className={SWATCH}
      aria-label={swatchName(hex, t)}
      style={chipPaint(hex)}
      onClick={() => onPick(hex)}
      onMouseEnter={() => setPreviewed(hex)}
      onMouseLeave={() => setPreviewed(null)}
      onFocus={() => setPreviewed(hex)}
      onBlur={() => setPreviewed(null)}
    />
  );

  // Rows are built from the palette rather than from a counter so each one is keyed
  // by a colour it actually contains.
  const shadeRows = Array.from({ length: SHADE_STEPS }, (_, index) => ({
    step: index + 1,
    hexes: HUE_COLUMNS.map((column) => column.shades[index]),
  }));

  return (
    <div>
      <div className={GRID_ROW} style={GRID_COLUMNS}>
        <span className={`${AXIS_LABEL} justify-self-start`}>{t('color.axis.shade')}</span>
        {HUE_COLUMNS.map((column) => (
          <span key={column.nameKey} className={AXIS_LABEL}>
            {t(column.nameKey)}
          </span>
        ))}
      </div>
      {shadeRows.map((row) => (
        <div key={row.hexes[0]} className={GRID_ROW} style={GRID_COLUMNS}>
          <span className={`${AXIS_LABEL} justify-self-start tabular-nums`}>
            {t('color.axis.step', { step: row.step, of: SHADE_STEPS })}
          </span>
          {row.hexes.map((hex) => cell(hex))}
        </div>
      ))}
      <div className={`${GRID_ROW} mt-1`} style={GRID_COLUMNS}>
        <span className={`${AXIS_LABEL} justify-self-start`}>{t('color.axis.neutral')}</span>
        {NEUTRALS.map((column) => cell(column.shades[0]))}
      </div>
      {/* The readout is a live region so a screen reader hears the same narration a
          sighted reader gets from sweeping the grid. `<output>` carries that role
          natively — a `<p role="status">` would be the hand-rolled spelling. */}
      <output className="mt-2 flex min-h-8 items-center gap-2 rounded-md border border-border bg-chrome px-2 py-1 text-sm">
        {shown === null ? (
          <span className="text-muted">{t('color.readout.idle')}</span>
        ) : (
          <>
            <span className="size-4 shrink-0 rounded-[2px]" style={chipPaint(shown)} />
            <span className="text-text">{clipForReadout(swatchName(shown, t))}</span>
            <span className="text-muted text-xs tabular-nums">{clipForReadout(shown)}</span>
          </>
        )}
      </output>
    </div>
  );
}
