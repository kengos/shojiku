// The one-line summaries an item's decoration-tab sections show while closed —
// what the DOCUMENT sets on the item itself, like the table's twin
// (`tableDecorationSummaries`), whose band text summary and "not set" wording
// this reuses so the two panels speak one vocabulary.

import type { ReadFn } from '@shojiku/designer-core';
import { decorationOf, hasLineThrough, hasUnderline } from '../text/spanRuns';
import { hasAnyBorder, readBorder } from './borderModel';
import { BORDER_STYLE_VALUES, BORDERABLE_TYPES, type BorderView } from './borderTypes';
import { MARK_TYPES } from './itemView';
import { readLineStyle } from './lineModel';
import { readShapeStyle } from './shapeStyle';
import { styleOptionLabel } from './styleLabels';
import { joinParts, lengthText, type SummaryI18n } from './tableContentSummaries';
import { textSummary } from './tableDecorationSummaries';
import type { BandView } from './tableStyleModel';
import { opacityPercent } from './textLookOps';

function unsetOr(i18n: SummaryI18n, text: string): string {
  return text === '' ? i18n.t('panel.tableSection.band.unset') : text;
}

/** An enum key's own value, in the reader's words. */
export function enumSummary(i18n: SummaryI18n, key: string, own: string): string {
  return unsetOr(i18n, own === '' ? '' : styleOptionLabel(i18n.t, key, own));
}

/** The fill colour and whether any border side is drawn. */
export function fillSummary(i18n: SummaryI18n, fill: string, border: BorderView | null): string {
  return unsetOr(
    i18n,
    joinParts(i18n, [
      fill === '' ? '' : i18n.t('panel.tableSection.band.fill', { value: fill }),
      border !== null && hasAnyBorder(border) ? i18n.t('panel.itemSection.fill.border') : '',
    ]),
  );
}

/** The item's own opacity as the percentage the field shows. */
export function opacitySummary(i18n: SummaryI18n, own: string): string {
  return unsetOr(i18n, own === '' ? '' : `${opacityPercent(own)}%`);
}

/** The text section: the table text summary's parts (face, size, weight,
 * colour, alignment, vertical alignment when the host offers it) plus letter
 * spacing and the decoration lines. The table's own text section reads it too,
 * for the letter spacing its cells inherit. */
export function itemTextSummary(
  i18n: SummaryI18n,
  band: BandView,
  letterSpacing: string,
  textDecoration: string,
  verticalAlign = true,
): string {
  const { t } = i18n;
  const decoration = decorationOf(textDecoration);
  const base = textSummary(i18n, band, verticalAlign);
  return unsetOr(
    i18n,
    joinParts(i18n, [
      base === t('panel.tableSection.band.unset') ? '' : base,
      letterSpacing === '' ? '' : `${t('panel.field.letterSpacing')} ${lengthText(letterSpacing)}`,
      hasUnderline(decoration) ? t('flow.underline') : '',
      hasLineThrough(decoration) ? t('flow.lineThrough') : '',
    ]),
  );
}

/** The fill-and-border section: fill + border on a border box, the stroke's
 * width and colour (and a mark's fill) where the outline is the item's own. */
export function fillSectionSummary(
  i18n: SummaryI18n,
  read: ReadFn,
  path: string,
  type: string,
  fill: string,
): string {
  if (type === 'line') {
    const line = readLineStyle(read, path, BORDER_STYLE_VALUES);
    return strokeSummary(i18n, line.width, line.color, '');
  }
  if (MARK_TYPES.has(type)) {
    const shape = readShapeStyle(read, path);
    return strokeSummary(i18n, shape.strokeWidth, shape.strokeColor, shape.fill);
  }
  return fillSummary(i18n, fill, BORDERABLE_TYPES.has(type) ? readBorder(read, path) : null);
}

function strokeSummary(i18n: SummaryI18n, width: string, color: string, fill: string): string {
  return unsetOr(
    i18n,
    joinParts(i18n, [
      width === '' ? '' : lengthText(width),
      color,
      fill === '' ? '' : i18n.t('panel.tableSection.band.fill', { value: fill }),
    ]),
  );
}
