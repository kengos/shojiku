// The one-line summaries the table's DECORATION-tab sections show while closed.
// The content-tab twin is `tableContentSummaries.ts`, which also owns the shared
// helpers. Pure over the read models the sections render from
// (`readTableStyle` + `matchPreset`, `readBorder`, the band views, the rule
// list, `styleNames`).
//
// Colours and style names are document strings, interpolated verbatim.

import type { ReadFn } from '@shojiku/designer-core';
import { formatList } from '../i18n/format';
import { namedValue, ownValue, readRecord, record } from './borderModel';
import { allEqual } from './borderSides';
import type { BorderView } from './borderTypes';
import { joinParts, lengthText, type SummaryI18n } from './tableContentSummaries';
import type { BandView, TableStyleView } from './tableStyleModel';
import { matchPreset } from './tableStylePresets';

const ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right']);
const WEIGHTS: ReadonlySet<string> = new Set(['normal', 'bold']);
const FONT_STYLES: ReadonlySet<string> = new Set(['normal', 'italic']);
const VALIGNS: ReadonlySet<string> = new Set(['top', 'middle', 'bottom']);
const LINE_STYLES: ReadonlySet<string> = new Set(['double', 'dashed', 'dotted']);

export function styleSummary(i18n: SummaryI18n, view: TableStyleView, gridWidth: string): string {
  const { t } = i18n;
  const preset = matchPreset(view, gridWidth);
  return joinParts(i18n, [
    preset === null ? t('panel.tableSection.style.custom') : t(`panel.tableStyle.preset.${preset}`),
    view.hiddenHeader ? t('panel.tableSection.style.hiddenHeader') : '',
  ]);
}

/** The `borderWidth` the table actually carries — its own, else the winning
 * named style's — as the RAW wire value, because on a table the FORM decides
 * what is drawn: one number is the grid, a per-side map is an outer frame even
 * when its four sides are equal (docs/engine/table.md). The parsed side map
 * cannot tell those two apart. */
export function borderWidthRaw(read: ReadFn, path: string): unknown {
  const item = readRecord(read, path);
  return (
    ownValue(item, 'borderWidth') ??
    namedValue(item, readRecord(read, 'styles'), 'borderWidth')?.raw
  );
}

/** Grid (one width; the engine default 0.5pt while unset, `0` removes it) or
 * outer frame (a per-side map). Line style and colour ride along only when
 * every side agrees. A hostile shape gets `''` — the section then shows no
 * summary line rather than a claim. */
export function borderSummary(i18n: SummaryI18n, view: BorderView, widthRaw: unknown): string {
  const { t } = i18n;
  if (widthRaw === undefined) {
    return t('panel.tableSection.border.default');
  }
  if (record(widthRaw) !== undefined) {
    return t('panel.tableSection.border.frame');
  }
  if (typeof widthRaw !== 'number') {
    // A hostile shape (an array, a string) the side-map parse reads as no
    // border: no claim either way, so no summary line.
    return '';
  }
  const width = view.width.effective.top;
  if (width === 0) {
    return t('panel.tableSection.border.noGrid');
  }
  const style = view.style.effective.top;
  return joinParts(i18n, [
    t('panel.tableSection.border.grid', { value: `${width}pt` }),
    allEqual(view.style.effective) && LINE_STYLES.has(style) ? t(`border.style.${style}`) : '',
    allEqual(view.color.effective) ? view.color.effective.top : '',
  ]);
}

/** One band's authored values — what the DOCUMENT sets on the band, not what
 * the cascade resolves: a closed section answers "did anyone set this row's
 * look?". Named styles on the band are part of that answer, so they are listed
 * by name (their contents are the styles' business). */
export function bandSummary(
  i18n: SummaryI18n,
  band: BandView,
  styleNames: readonly string[],
  /** Whether the band's section offers vertical alignment — the header band
   * does; the body band does not (a body cell takes its column's alone), so a
   * value it carries is not reported as if it did something. */
  verticalAlign = false,
): string {
  const { t, locale } = i18n;
  const text = joinParts(i18n, [
    ALIGNS.has(band.textAlign) ? t(`style.value.textAlign.${band.textAlign}`) : band.textAlign,
    band.backgroundColor === ''
      ? ''
      : t('panel.tableSection.band.fill', { value: band.backgroundColor }),
    band.color === '' ? '' : t('panel.tableSection.band.color', { value: band.color }),
    WEIGHTS.has(band.fontWeight) ? t(`style.value.fontWeight.${band.fontWeight}`) : band.fontWeight,
    ...typeParts(i18n, band),
    !verticalAlign || band.verticalAlign === ''
      ? ''
      : VALIGNS.has(band.verticalAlign)
        ? t(`style.value.verticalAlign.${band.verticalAlign}`)
        : band.verticalAlign,
    styleNames.length === 0
      ? ''
      : t('panel.tableSection.band.styles', { names: formatList(styleNames, locale) }),
  ]);
  return text === '' ? t('panel.tableSection.band.unset') : text;
}

/** The type-face parts of a band — family, size, italic — which the table's
 * own 「文字」 section summarises by themselves. */
function typeParts(i18n: SummaryI18n, band: BandView): readonly string[] {
  return [
    band.fontFamily,
    band.fontSize === '' ? '' : lengthText(band.fontSize),
    FONT_STYLES.has(band.fontStyle)
      ? i18n.t(`style.value.fontStyle.${band.fontStyle}`)
      : band.fontStyle,
  ];
}

/** The table's own text settings (`table.style`) as AUTHORED — the type face,
 * weight, colour and alignment it hands every cell. */
export function textSummary(i18n: SummaryI18n, table: BandView): string {
  const { t } = i18n;
  const text = joinParts(i18n, [
    ...typeParts(i18n, table),
    WEIGHTS.has(table.fontWeight)
      ? t(`style.value.fontWeight.${table.fontWeight}`)
      : table.fontWeight,
    table.color === '' ? '' : t('panel.tableSection.band.color', { value: table.color }),
    ALIGNS.has(table.textAlign) ? t(`style.value.textAlign.${table.textAlign}`) : table.textAlign,
  ]);
  return text === '' ? t('panel.tableSection.band.unset') : text;
}

export function conditionsSummary(i18n: SummaryI18n, count: number): string {
  return count === 0
    ? i18n.t('panel.tableSection.none')
    : i18n.t('panel.tableSection.conditions.count', { n: count });
}

export function styleNamesSummary(i18n: SummaryI18n, names: readonly string[]): string {
  return names.length === 0 ? i18n.t('panel.tableSection.none') : formatList(names, i18n.locale);
}
