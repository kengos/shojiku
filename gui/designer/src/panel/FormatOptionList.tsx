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
              onPick={() => onPick(option.spelling)}
            />
          </div>
        );
      })}
    </>
  );
}

/** One pickable row: the human label, the wire spelling beside it (the expert
 * path — the spelling is what actually lands in the document), and what the
 * ENGINE renders for it. */
function Row({
  label,
  spelling,
  samples,
  onPick,
  muted = false,
}: {
  readonly label: string;
  readonly spelling?: string;
  readonly samples: readonly string[];
  readonly onPick: () => void;
  readonly muted?: boolean;
}) {
  return (
    <button type="button" role="menuitem" className={PICKER_ROW} onClick={onPick}>
      <span className="flex items-baseline gap-2">
        <span className={muted ? 'text-muted' : 'font-semibold'}>{label}</span>
        {spelling === undefined ? null : <code className="text-sm text-muted">{spelling}</code>}
      </span>
      {samples.length > 0 ? (
        <span className="text-sm text-muted italic [overflow-wrap:anywhere]">
          {samples.join(' / ')}
        </span>
      ) : null}
    </button>
  );
}
