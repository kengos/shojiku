// The one-line summaries the table's CONTENT-tab sections show while closed —
// what each section is set to, so reading a value needs no click. Pure over the
// read models the sections themselves render from (`readTableSettings`,
// `readColumnsView`, `readGroupsView`); nothing here reads the wire a second
// way, so a summary cannot disagree with the controls under it.
//
// Every string is catalog text; a document string (a data key, a group label)
// is interpolated verbatim and rendered by React as text.

import { formatList, type MessageArgs } from '../i18n/format';
import type { GroupRow } from './groupModel';
import {
  DEFAULT_CELL_PADDING,
  DEFAULT_ROW_MIN_HEIGHT,
  type TableSettingsView,
} from './tableSettingsModel';

/** The i18n pair a summary needs — `useI18n()`'s own `t` and `locale`. */
export interface SummaryI18n {
  readonly t: (key: string, args?: MessageArgs) => string;
  readonly locale: string;
}

/** A length as the summary prints it: a bare number is in points (the panel's
 * steppers author bare numbers), anything else — `20pt`, `5%` — is shown
 * verbatim rather than re-expressed; an unreadable value is a dash. */
export function lengthText(value: string): string {
  if (value === '') {
    // A value the text read cannot show (a map, a boolean) — a dash, not a gap.
    return '—';
  }
  return /^\d+(\.\d+)?$/.test(value) ? `${value}pt` : value;
}

/** Join summary parts with the catalog's separator, dropping empty ones. */
export function joinParts(i18n: SummaryI18n, parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(i18n.t('panel.tableSection.sep'));
}

/** A section's `?` text: its lines, in order, with the empty ones dropped — so
 * a line explaining one control is passed as `''` when that control is not on
 * screen, and the bubble never explains a switch this engine (or this
 * placement) does not offer. */
export function helpText(...lines: readonly string[]): string {
  return lines.filter((line) => line !== '').join('\n');
}

/** One control's line in a section's `?`, led by the control's OWN label — read
 * from the label's catalog key rather than retyped, so the two cannot drift. */
export function controlHelp(i18n: SummaryI18n, labelKey: string, bodyKey: string): string {
  const { t } = i18n;
  return t('panel.tableSection.helpLine', { label: t(labelKey), body: t(bodyKey) });
}

export function columnsSummary(i18n: SummaryI18n, count: number, dataKey: string): string {
  const { t } = i18n;
  return joinParts(i18n, [
    t('panel.tableSection.columns.count', { n: count }),
    dataKey === '' ? '' : t('panel.tableSection.columns.source', { key: dataKey }),
  ]);
}

/** `heights` is false against an engine without `table.row.height`, where the
 * section offers only the cell padding — so it summarises only that. */
export function rowsSummary(i18n: SummaryI18n, view: TableSettingsView, heights: boolean): string {
  const { t } = i18n;
  const padding = t('panel.tableSection.rows.padding', {
    value: lengthText(view.cellPadding === '' ? String(DEFAULT_CELL_PADDING) : view.cellPadding),
  });
  if (!heights) {
    return padding;
  }
  const body =
    view.rowMode === 'fixed'
      ? t('panel.tableSection.rows.fixed', { value: lengthText(view.rowHeight) })
      : t('panel.tableSection.rows.auto', {
          value: lengthText(
            view.minHeight === '' ? String(DEFAULT_ROW_MIN_HEIGHT) : view.minHeight,
          ),
        });
  const header = t('panel.tableSection.rows.header', {
    value: view.headerHeight === '' ? t('panel.tableSettings.auto') : lengthText(view.headerHeight),
  });
  return joinParts(i18n, [body, header, padding]);
}

/** `bounded`: the table sits where the engine draws it as one block, and the
 * section shows the note instead of the switches. */
export function pagesSummary(
  i18n: SummaryI18n,
  view: TableSettingsView,
  mode: 'flow' | 'bounded',
  keepTogether: boolean,
): string {
  const { t } = i18n;
  if (mode === 'bounded') {
    return t('panel.tableSection.pages.bounded');
  }
  const parts = [
    view.autoPageBreak ? t('panel.tableSection.pages.continue') : '',
    view.repeatHeader ? t('panel.tableSection.pages.repeat') : '',
    keepTogether && view.keepTogether ? t('panel.tableSection.pages.keep') : '',
  ];
  const text = joinParts(i18n, parts);
  return text === '' ? t('panel.tableSection.pages.none') : text;
}

/** `merge` is false against an engine without `table.mergeEmptyCells`. */
export function emptySummary(i18n: SummaryI18n, view: TableSettingsView, merge: boolean): string {
  const { t } = i18n;
  return joinParts(i18n, [
    t('panel.tableSection.empty.zero', {
      value: t(`panel.tableSettings.empty.${view.emptyBehavior}`),
    }),
    merge
      ? t(
          view.mergeEmptyCells
            ? 'panel.tableSection.empty.merge'
            : 'panel.tableSection.empty.noMerge',
        )
      : '',
  ]);
}

export function groupsSummary(i18n: SummaryI18n, groups: readonly GroupRow[]): string {
  const { t, locale } = i18n;
  if (groups.length === 0) {
    return t('panel.tableSection.none');
  }
  const labels = groups.map((g) =>
    g.label === '' ? t('panel.tableSection.groups.unnamed') : g.label,
  );
  return t('panel.tableSection.groups.count', {
    n: groups.length,
    labels: formatList(labels, locale),
  });
}
