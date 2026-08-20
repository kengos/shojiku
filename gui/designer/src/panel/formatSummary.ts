// The one-line "what this section currently holds" for the 表示形式 rail entry.
// Its own module because the summary reads TWO document nodes — the per-type
// defaults and the `formats:` registry — and because naming the first set type
// takes a real branch per count, which the section-summary table should not
// carry inline.
//
// The rail exists so a reader can find a setting without opening every section,
// so the summary NAMES the first thing that is set rather than only counting:
// 「日付=和暦 ほか2件 · 書式2個」 answers "is the date format set here?" in the
// rail. With nothing set it says so — a blank summary would read as a section
// that failed to load.

import { FORMAT_DEFAULT_TYPES, readFormatsView } from '../formats/model';
import { type FormatDefaultValue, readFormatDefaultsView } from './formatDefaultsModel';
import { variantLabelKey } from './formatLabels';
import type { Translate } from './styleLabels';

/** Build the summary from the materialized `defaults:` and `formats:` nodes. */
export function formatSectionSummary(defaults: unknown, formats: unknown, t: Translate): string {
  const view = readFormatDefaultsView(defaults);
  const registry = readFormatsView(formats).length;
  // Narrowed as it is filtered, so the label below has only the two arms a SET
  // slot can actually be in.
  const set = FORMAT_DEFAULT_TYPES.map((type) => ({ type, value: view[type] })).filter(
    (slot): slot is { type: string; value: Exclude<FormatDefaultValue, { kind: 'unset' }> } =>
      slot.value.kind !== 'unset',
  );
  if (set.length === 0) {
    return t('formats.summaryUnset', { registry });
  }
  const { type, value } = set[0];
  const labelKey = value.kind === 'name' ? variantLabelKey(value.name) : undefined;
  const args = {
    type: t(`format.label.${type}`),
    // A pick with no catalog entry shows its bare wire spelling, the same
    // fallback the pickers take; an inline pattern is named as one rather than
    // pasted into the rail, where it would not fit and would not read.
    value:
      value.kind === 'inline'
        ? t('formats.customPattern')
        : labelKey === undefined
          ? value.name
          : t(labelKey),
    others: set.length - 1,
    registry,
  };
  return set.length === 1 ? t('formats.summaryOne', args) : t('formats.summaryMany', args);
}
