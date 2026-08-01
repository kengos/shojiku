// What the selection→style capture SHOWS: the captured inline props as a
// gdoc-style preview chip plus a labeled value list. Split from what the modal
// COMMITS (`StyleCaptureModal`) because both of its modes — register a new
// style, update an applied one — render exactly this, and only the surrounding
// Modal differs.
//
// The chip sits on a fixed paper tint so an authored color/background reads
// truthfully in both themes (the document is white paper). Captured values are
// document-derived, so they render as auto-escaped TEXT and their look reaches
// the DOM only through `stylePreview`'s CSSOM object props, never string-built
// CSS.

import { useI18n } from '../i18n/context';
import { STYLE_FIELDS } from '../panel/styleFieldSpecs';
import { PREVIEW_CHIP, stylePreview } from './preview';

/** One captured property row: localized label + the authored value as text. */
interface CapturedRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface CapturedStyleViewProps {
  /** The capturable inline props (from `capturableStyleProps` at open time). */
  readonly captured: Readonly<Record<string, string | number>>;
  /** The text the preview chip renders in the captured look. */
  readonly text: string;
}

export function CapturedStyleView({ captured, text }: CapturedStyleViewProps) {
  const { t } = useI18n();
  // Ordered by STYLE_FIELDS (the panel's own field order), and only the keys
  // the selection actually carries — an unknown or non-scalar prop never
  // reaches here.
  const rows: CapturedRow[] = STYLE_FIELDS.flatMap((field) => {
    const value = captured[field.key];
    return value === undefined
      ? []
      : [{ key: field.key, label: t(field.labelKey), value: String(value) }];
  });
  const css = stylePreview(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-muted">{t('styleCapture.captured')}</h4>
      <div className="mb-2">
        <span className={`${PREVIEW_CHIP} inline-block break-words px-2 py-1`} style={css}>
          {text}
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex justify-between gap-3 py-0.5 text-sm">
            <span className="text-muted">{row.label}</span>
            <span className="text-text">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
