// A table's row-scoped reference surfaces: each column's `data` (row-relative
// unless it escapes with `scope: document`) and `label` (document scope, no
// declarations), every row condition's `when.key` (always the row), and each
// header group's `label`.

import { bindingKey } from '../../palette/bindingRefs';
import { pickLabel, record } from '../../tree/nodeFields';
import { recordInline, recordWhole, type Sink, type Site } from './collect';
import { frameOf } from './item';
import { NO_SHADOW, type RefOwner } from './types';

/** A table's own row-scoped parts: column data / labels, row conditions and
 * header-group labels. */
export function tableSurfaces(
  sink: Sink,
  item: Record<string, unknown>,
  path: string,
  rows: readonly string[] | null,
  owner: RefOwner,
): void {
  const docSite: Site = { owner, detail: null, frame: [], shadow: NO_SHADOW };
  if (Array.isArray(item.columns)) {
    item.columns.forEach((raw, index) => {
      const column = record(raw);
      const columnPath = `${path}.columns[${index}]`;
      const detail = pickLabel(column?.label, bindingKey(column?.data));
      const ambient = rows ?? [];
      const site: Site = { ...docSite, detail, frame: frameOf(column?.data, ambient) };
      recordWhole(sink, site, columnPath, ['data', 'key'], bindingKey(column?.data), 'column');
      recordInline(sink, { ...docSite, detail }, columnPath, ['label'], column?.label, 'label');
    });
  }
  const styles = record(item.row)?.conditionalStyles;
  if (Array.isArray(styles) && rows !== null) {
    styles.forEach((raw, index) => {
      const when = record(record(raw)?.when);
      const at = `${path}.row.conditionalStyles[${index}]`;
      recordWhole(
        sink,
        { ...docSite, frame: rows },
        at,
        ['when', 'key'],
        bindingKey(when),
        'rowCondition',
      );
    });
  }
  if (Array.isArray(item.headerGroups)) {
    item.headerGroups.forEach((raw, index) => {
      const group = record(raw);
      const site = { ...docSite, detail: pickLabel(group?.label) };
      recordInline(sink, site, `${path}.headerGroups[${index}]`, ['label'], group?.label, 'label');
    });
  }
}
