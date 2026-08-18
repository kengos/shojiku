// Pure model for a table's ROW-BAND styling as the WIRE carries it, read from the
// materialized table node. Authored values only — what a band RESOLVES to is
// `panel/bandCascade`'s job, and the preset gallery needs the wire precisely
// because a preset describes what it AUTHORS. Read from the header row (`header.style`), the body rows (`row.style`), the zebra
// overlay (`row.alternateStyle`), and the item's own `style.backgroundColor` —
// which a table DOES NOT PAINT (the engine asserts it: an authored table fill
// produces no rect), so the panel reports it as ineffective rather than offering
// a control that does nothing.
//
// The document is untrusted: a `header` that is a string, a `style` that is a
// sequence, a `row` that is a number all degrade to an empty band rather than
// throwing — the panel-wide posture. Colours are reported VERBATIM (so an
// externally-authored hostile value stays visible and clearable); whether one may
// reach an inline style is `isHexColor`'s decision at the render site.

/** The engine's header fill when no header style sets one
 * (`engine/layout/src/engine/table.rs` `TABLE_HEADER_FILL`). Mirrored here so an
 * unset header swatch shows the colour the page will actually carry; pinned
 * against the engine constant by a drift-guard test. */
export const TABLE_HEADER_FILL = '#ededed';

/** The four properties a band editor owns. Module-local: it exists to derive the
 * type, and nothing outside needs the list itself. */
const BAND_PROPERTIES = ['textAlign', 'backgroundColor', 'color', 'fontWeight'] as const;
export type BandProperty = (typeof BAND_PROPERTIES)[number];

/** One band's authored values, `''` for anything unset or not a string. */
export type BandView = Readonly<Record<BandProperty, string>>;

export interface TableStyleView {
  readonly header: BandView;
  readonly row: BandView;
  /** `row.alternateStyle.backgroundColor` — `''` = zebra off. */
  readonly zebra: string;
  /** The table's own `style.backgroundColor`, which paints nothing. `''` = none
   * authored, which is the case where the panel shows no fill control at all. */
  readonly ineffectiveFill: string;
}

const EMPTY_BAND: BandView = { textAlign: '', backgroundColor: '', color: '', fontWeight: '' };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** One band's four properties out of whatever sits at `<owner>.style`. */
export function readBand(owner: unknown): BandView {
  const style = record(record(owner)?.style);
  if (style === undefined) {
    return EMPTY_BAND;
  }
  return {
    textAlign: text(style.textAlign),
    backgroundColor: text(style.backgroundColor),
    color: text(style.color),
    fontWeight: text(style.fontWeight),
  };
}

/** The whole section's view of one table node. */
export function readTableStyle(tableNode: unknown): TableStyleView {
  const table = record(tableNode);
  const rowSpec = record(table?.row);
  return {
    header: readBand(table?.header),
    row: readBand(rowSpec),
    zebra: text(record(rowSpec?.alternateStyle)?.backgroundColor),
    ineffectiveFill: text(record(table?.style)?.backgroundColor),
  };
}
