// The rows inside a format picker's popover, shared by the binding-level
// picker (`FormatPicker`) and the document-defaults rows. Its one job beyond
// rendering is the ORIGIN GROUPING: a run of options sharing an origin gets a
// heading above it, so a document's own `formats:` entry is visibly a different
// KIND of thing from a locale variant — only the former breaks when the
// registry is renamed, and the reader cannot tell them apart from the spelling.
//
// Headings appear only when the engine answered (`origin` is undefined without
// a catalog) and only where the origin CHANGES, so a single-origin list reads
// as the flat list it already was. Every document-derived value — a registry
// name, a rendered sample — reaches the DOM as escaped React text.

import { useI18n } from '../i18n/context';
import { PICKER_ROW } from '../ui/chrome';
import { ORIGIN_HEADING_KEY } from './formatLabels';
import type { FormatOption } from './formatModel';

export interface FormatOptionListProps {
  readonly options: readonly FormatOption[];
  readonly onPick: (spelling: string) => void;
  /** The row shown above every option — the "no pick" entry the defaults rows
   * carry (clearing the key back to the locale default). Absent on pickers
   * whose empty state is the free-text input instead. */
  readonly leading?: {
    readonly label: string;
    readonly samples: readonly string[];
    readonly onPick: () => void;
  };
}

const HEADING = 'px-2 pt-1.5 pb-0.5 text-sm font-semibold text-muted';
// The panel's existing NEUTRAL annotation chip, which is `PickerPopover`'s
// scope badge minus its `ml-auto` — this one sits inline beside the label
// rather than trailing its row. (`FieldPicker`'s chip is the ACCENT variant
// and is not the model here.) `shrink-0` is kept from both: the row is a
// baseline flex of label + wire spelling + this chip inside a popover as wide
// as the property-panel column, and 「時刻なし」 beside a long spelling like
// `wareki-compact` is exactly where it would otherwise be squeezed.
const NOTE =
  'rounded-full border px-1.5 text-xs whitespace-nowrap shrink-0 border-border text-muted';

export function FormatOptionList({ options, onPick, leading }: FormatOptionListProps) {
  const { t } = useI18n();
  if (options.length === 0 && leading === undefined) {
    return <p className="m-0 px-2 py-1 text-sm text-muted">{t('format.empty')}</p>;
  }
  let previous: string | undefined;
  return (
    <>
      {leading === undefined ? null : (
        <Row label={leading.label} samples={leading.samples} onPick={leading.onPick} muted />
      )}
      {options.map((option) => {
        const heading =
          option.origin !== undefined && option.origin !== previous ? option.origin : null;
        previous = option.origin;
        return (
          <div key={option.spelling}>
            {heading === null ? null : <p className={HEADING}>{t(ORIGIN_HEADING_KEY[heading])}</p>}
            <Row
              label={option.labelKey !== undefined ? t(option.labelKey) : option.spelling}
              spelling={option.spelling}
              samples={option.samples}
              note={option.dropsTime ? t('format.dropsTime') : undefined}
              onPick={() => onPick(option.spelling)}
            />
          </div>
        );
      })}
    </>
  );
}

/** One pickable row: the human label, the wire spelling beside it (the expert
 * path — the spelling is what actually lands in the document), what the ENGINE
 * renders for it, and a `note` for what the sample alone cannot say.
 *
 * Today the note is the date-only mark. A datetime slot resolves the pack's
 * DATE table after its own, so a date-only variant is offered there, honoured,
 * and warns about nothing — the time simply stops being shown. The sample
 * shows the result but not that anything was LOST, and the picker is where
 * that has to be read, because after the pick there is nothing left to see. */
function Row({
  label,
  spelling,
  samples,
  note,
  onPick,
  muted = false,
}: {
  readonly label: string;
  readonly spelling?: string;
  readonly samples: readonly string[];
  readonly note?: string;
  readonly onPick: () => void;
  readonly muted?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className={PICKER_ROW} onClick={onPick}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate ${muted ? 'text-muted' : 'font-semibold'}`}>{label}</span>
        {spelling === undefined ? null : (
          <code className="truncate text-sm text-muted">{spelling}</code>
        )}
        {note === undefined ? null : <span className={NOTE}>{note}</span>}
      </span>
      {samples.length > 0 ? (
        <span className="text-sm text-muted italic [overflow-wrap:anywhere]">
          {samples.join(' / ')}
        </span>
      ) : null}
    </button>
  );
}
