// The two PICTURES the section shows: a live miniature of the table's current
// banding, and the preset thumbnails beside it — Excel's table-style gallery,
// which is the part of that UI a non-engineer actually uses (pick a look; never
// choose a colour).
//
// Both are FIGURES, not renders. The canvas already carries the real engine
// preview, so this does not reproduce the table's column count, widths or data;
// it answers "which banding is on" at a glance. It is drawn as JSX over a fixed
// paper-white ground in BOTH schemes, because the page it depicts is paper — the
// chrome tokens would make the miniature follow the theme and stop looking like
// the printed thing.
//
// Every colour reaching an inline style passes `isHexColor` first: these values
// come out of the document.

import { useI18n } from '../i18n/context';
import { isHexColor } from '../ui/chipContrast';
import { TABLE_PRESETS, type TablePreset } from './tableStylePresets';

/** The miniature's paper, ink and rule — fixed, not tokens (see the header). */
const PAPER = '#ffffff';
const INK = '#2b2724';
const RULE = '#9aa0a6';

/** A document-derived colour, or the fallback when it is not one. */
function paint(value: string, fallback: string): string {
  return isHexColor(value) ? value : fallback;
}

export interface TableMiniatureProps {
  readonly headerFill: string;
  readonly headerColor: string;
  readonly headerBold: boolean;
  readonly zebra: string;
  readonly rowFill: string;
  readonly rowColor: string;
  readonly gridless: boolean;
  /** `header.visuallyHidden`: the header row keeps its HEIGHT and loses all
   * its ink — no band fill, no rule, no visible label. Without this the
   * miniature painted a full header band directly above the checkbox that
   * hides it, which is the one place a figure must not disagree with the
   * control beside it. */
  readonly hiddenHeader: boolean;
}

const SAMPLE_ROWS = ['1', '2', '3'];

/** The live miniature: a header band plus three body rows, the second striped
 * when the zebra overlay is on. Labels are generic — it depicts the BANDING. */
export function TableMiniature(props: TableMiniatureProps) {
  const { t } = useI18n();
  // The band's own text colour matters here, not only its fill: a dark header
  // fill goes with light label text, and drawing the label in a fixed ink makes
  // the miniature both unreadable and wrong about the document.
  const cell = {
    border: props.gridless ? 'none' : `1px solid ${RULE}`,
    padding: '3px 6px',
  };
  return (
    <div className="mb-2 rounded-sj border border-border bg-surface p-1.5">
      <table
        className="w-full table-fixed border-collapse text-[11px]"
        style={{ background: PAPER }}
        aria-label={t('panel.tableStyle.preview')}
      >
        <tbody>
          <tr>
            {['A', 'B', 'C'].map((column) => (
              <th
                key={column}
                scope="col"
                style={{
                  ...cell,
                  // Ink-free but NOT collapsed: the label keeps its box (and
                  // so the row keeps its height), exactly as the engine
                  // resolves it — `visibility: hidden`, never `display: none`.
                  border: props.hiddenHeader ? 'none' : cell.border,
                  background: props.hiddenHeader ? PAPER : paint(props.headerFill, '#ededed'),
                  color: paint(props.headerColor, INK),
                  fontWeight: props.headerBold ? 700 : 400,
                  textAlign: 'left',
                  visibility: props.hiddenHeader ? 'hidden' : undefined,
                }}
              >
                {column}
              </th>
            ))}
          </tr>
          {SAMPLE_ROWS.map((row, index) => (
            <tr key={row}>
              {['A', 'B', 'C'].map((column) => (
                <td
                  key={column}
                  style={{
                    ...cell,
                    color: paint(props.rowColor, INK),
                    background:
                      index % 2 === 1 && props.zebra !== ''
                        ? paint(props.zebra, PAPER)
                        : paint(props.rowFill, PAPER),
                  }}
                >
                  {row}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TableStyleGalleryProps {
  /** The matched preset id, or `null` for a hand-tuned table. */
  readonly active: string | null;
  readonly onPick: (id: string) => void;
}

/** The preset thumbnails. Each is a three-row sketch of what that preset does,
 * captioned with its name; the active one is ringed in the accent. */
export function TableStyleGallery({ active, onPick }: TableStyleGalleryProps) {
  const { t } = useI18n();
  return (
    <div className="mb-2 grid grid-cols-3 gap-1.5">
      {TABLE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          aria-pressed={active === preset.id}
          onClick={() => onPick(preset.id)}
          className={`cursor-pointer rounded-sj border bg-surface p-1 ${
            active === preset.id ? 'border-accent ring-1 ring-accent' : 'border-border'
          }`}
        >
          <PresetSketch preset={preset} />
          <span className="mt-0.5 block text-[11px] text-muted">
            {t(`panel.tableStyle.preset.${preset.id}`)}
          </span>
        </button>
      ))}
    </div>
  );
}

/** One thumbnail's three bars: header, body, body — tinted per preset. Reads the
 * preset's own declared values so a preset edit cannot drift from its picture. */
function PresetSketch({ preset }: { readonly preset: TablePreset }) {
  const values = preset.values;
  const header = String(values['header.style.backgroundColor'] ?? '#ededed');
  const zebra = String(values['row.alternateStyle.backgroundColor'] ?? '');
  const gridless = values['style.borderWidth'] === 0;
  const edge = gridless ? 'none' : `1px solid ${RULE}`;
  // Named bars, not an index map: two of the three legitimately carry the same
  // fill, so the colour cannot identify them and a positional key would be the
  // only alternative.
  const bars = [
    { band: 'header', fill: header },
    { band: 'odd', fill: PAPER },
    { band: 'even', fill: zebra === '' ? PAPER : zebra },
  ];
  return (
    <span aria-hidden="true" className="block" style={{ background: PAPER }}>
      {bars.map((bar) => (
        <span
          key={bar.band}
          className="block h-1.5"
          style={{ background: paint(bar.fill, PAPER), border: edge }}
        />
      ))}
    </span>
  );
}
