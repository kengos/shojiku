// The reference walk over template text: every place a data key is named, at
// the leaf that holds it (`collect.ts` records; this file decides which leaves
// an item has and the frame each resolves under). The scope rules mirror the
// engine's validate walks:
//
// - a binding resolves at the ambient frame unless it says `scope: document`,
//   which escapes to the root (`bindingScope`);
// - an array source (`table` / `repeat` / `repeat_flow` / `list`) opens its
//   ROWS under its own data path — its columns, cell and card items resolve
//   there, and a `list`'s entry text and declarations resolve in its ENTRIES;
//   a `list` inside rows joins them (`orders.lines`), while any other source
//   is read from the ROOT wherever it sits, as the engine checks it;
// - a row condition (`row.conditionalStyles[].when`) always reads the row —
//   its `scope:` is ignored, exactly as the engine ignores (and warns on) it;
// - column and header-group labels interpolate at document scope, with no
//   declaration map (the engine resolves a label outside the item's).
//
// Untrusted text: never throws, bounded by depth and item count (a hit marks
// the index truncated), own-property reads only.

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { bindingKey } from '../../palette/bindingRefs';
import { MAX_WALK_DEPTH } from '../../palette/caps';
import { pickLabel, record, spanLabel } from '../../tree/nodeFields';
import { recordInline, recordStrings, type Sink, type Site } from './collect';
import { itemSurfaces } from './item';
import { tableSurfaces } from './table';
import { DOCUMENT_OWNER, MAX_REF_ITEMS, NO_SHADOW, type RefIndex, type RefOwner } from './types';

function walkItems(
  sink: Sink,
  prefix: string,
  items: readonly unknown[],
  ambient: readonly string[],
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) {
    sink.truncated = true;
    return;
  }
  items.forEach((raw, index) => {
    const item = record(raw);
    if (item === undefined) {
      return;
    }
    if (sink.items >= MAX_REF_ITEMS) {
      sink.truncated = true;
      return;
    }
    sink.items += 1;
    const path = `${prefix}[${index}]`;
    const owner = ownerOf(item, path);
    const rows = itemSurfaces(sink, item, owner, ambient);
    tableSurfaces(sink, item, path, rows, owner);
    // A container's own `items` stay at this frame; a source's cell / card /
    // column-cell items resolve in its rows.
    const inner = rows ?? ambient;
    const nested: [string, unknown, readonly string[]][] = [
      [`${path}.items`, item.items, ambient],
      [`${path}.cell.items`, record(item.cell)?.items, inner],
      [`${path}.item.items`, record(item.item)?.items, inner],
    ];
    if (Array.isArray(item.columns)) {
      item.columns.forEach((column, at) => {
        const cells = record(record(column)?.cell)?.items;
        nested.push([`${path}.columns[${at}].cell.items`, cells, inner]);
      });
    }
    for (const [childPath, children, frame] of nested) {
      if (Array.isArray(children)) {
        walkItems(sink, childPath, children, frame, depth + 1);
      }
    }
  });
}

function ownerOf(item: Record<string, unknown>, path: string): RefOwner {
  const type = typeof item.type === 'string' ? item.type : '';
  return {
    path,
    type,
    label: pickLabel(item.text, bindingKey(item.data), spanLabel(item.spans), item.id),
  };
}

/** The `document:` block: its strings interpolate at document scope. */
function documentSurfaces(sink: Sink, value: unknown): void {
  const meta = record(value);
  if (meta === undefined) {
    return;
  }
  const site: Site = {
    owner: { path: DOCUMENT_OWNER, type: DOCUMENT_OWNER, label: null },
    detail: null,
    frame: [],
    shadow: NO_SHADOW,
  };
  for (const key of ['title', 'description', 'language']) {
    recordInline(sink, site, DOCUMENT_OWNER, [key], meta[key], 'document');
  }
  for (const key of ['keywords', 'authors']) {
    recordStrings(sink, site, DOCUMENT_OWNER, [key], meta[key]);
  }
}

/** Every data reference in template text, or `null` when the text does not
 * parse to a map (malformed, over the ceiling, an alias bomb). */
export function readDataRefs(source: string): RefIndex | null {
  let root: Record<string, unknown> | undefined;
  try {
    root = record(readTemplate(parseTemplate(source, MAX_TEMPLATE_BYTES_CEILING)));
  } catch {
    return null;
  }
  if (root === undefined) {
    return null;
  }
  const sink: Sink = { refs: [], truncated: false, items: 0 };
  const sections = record(root.sections);
  for (const band of ['header', 'body', 'footer'] as const) {
    const items = record(sections?.[band])?.items;
    if (Array.isArray(items)) {
      walkItems(sink, `sections.${band}.items`, items, [], 0);
    }
  }
  documentSurfaces(sink, root.document);
  return { refs: sink.refs, truncated: sink.truncated };
}
