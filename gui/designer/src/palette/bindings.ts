// The template walk: every `data.key` reference a template carries, with the
// structural path that carries it. Untrusted text — unparseable input yields
// no bindings (never a throw), and the walk is depth-bounded against hostile
// nesting and anything YAML anchors could express as a cycle.

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { narrowDeclarations } from '../text/declModel';
import {
  ARRAY_SOURCE_TYPES,
  bindingKey,
  bindingScope,
  collectInterpolations,
  pushInterpolated,
  TEXT_INTERPOLATION_TYPES,
} from './bindingRefs';
import { MAX_WALK_DEPTH } from './caps';
import { record } from './fieldDisplay';

/** One `data.key` reference found in the template. */
export interface BindingRef {
  /** Structural path of the ITEM carrying the binding (the box-index
   * grammar), so selecting it highlights on canvas. Spans and text marks
   * report their item's path — they have no box of their own. */
  readonly path: string;
  readonly key: string;
  /** Innermost enclosing array source key (bindings under a table column /
   * repeat cell / repeat_flow card are row-relative), or `null` at document
   * scope. */
  readonly scope: string | null;
  /** Whether this binding IS an array source (`table`/`repeat`/
   * `repeat_flow`/`list` `data:`). */
  readonly source: boolean;
}
function walkItems(
  out: BindingRef[],
  prefix: string,
  items: readonly unknown[],
  scope: string | null,
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }
  items.forEach((entry, index) => {
    const item = record(entry);
    if (item === undefined) {
      return;
    }
    const path = `${prefix}[${index}]`;
    const isSource = typeof item.type === 'string' && ARRAY_SOURCE_TYPES.has(item.type);
    const key = bindingKey(item.data);
    if (key !== undefined) {
      out.push({ path, key, scope: bindingScope(item.data, scope), source: isSource });
    }
    if (Array.isArray(item.spans)) {
      for (const span of item.spans) {
        const spanData = record(span)?.data;
        const spanKey = bindingKey(spanData);
        if (spanKey !== undefined) {
          out.push({ path, key: spanKey, scope: bindingScope(spanData, scope), source: false });
        }
      }
    }
    const markData = record(item.mark)?.data;
    const markKey = bindingKey(markData);
    if (markKey !== undefined) {
      out.push({ path, key: markKey, scope: bindingScope(markData, scope), source: false });
    }
    // Row-relative scope opens only under a source's sub-template keys
    // (columns / cell / item); a container's own `items` stay at this scope.
    const childScope = isSource && key !== undefined ? key : scope;
    // Interpolated surfaces at THIS item's scope: static text on text/qr_code,
    // and link URLs (`link: { url: "…/{order.code}" }` interpolates exactly
    // like static text) on the item and its spans. One ref per distinct key —
    // several surfaces of one item are still one placement.
    const interpolated = new Set<string>();
    if (typeof item.type === 'string' && TEXT_INTERPOLATION_TYPES.has(item.type)) {
      collectInterpolations(interpolated, item.text);
    }
    collectInterpolations(interpolated, record(item.link)?.url);
    if (Array.isArray(item.spans)) {
      for (const span of item.spans) {
        collectInterpolations(interpolated, record(record(span)?.link)?.url);
      }
    }
    // The item's own declarations redirect the names its surfaces use.
    const decls = narrowDeclarations(item.bindings);
    pushInterpolated(out, path, interpolated, decls, scope);
    // A `list`'s per-entry text template resolves against the array entry —
    // its keys count under the list's own source scope (only meaningful when
    // the list actually binds one).
    if (item.type === 'list' && isSource && key !== undefined) {
      const entryKeys = new Set<string>();
      collectInterpolations(entryKeys, item.text);
      pushInterpolated(out, path, entryKeys, decls, key);
    }
    if (Array.isArray(item.items)) {
      walkItems(out, `${path}.items`, item.items, scope, depth + 1);
    }
    if (Array.isArray(item.columns)) {
      item.columns.forEach((column, columnIndex) => {
        const columnRec = record(column);
        if (columnRec === undefined) {
          return;
        }
        const columnPath = `${path}.columns[${columnIndex}]`;
        const columnKey = bindingKey(columnRec.data);
        if (columnKey !== undefined) {
          out.push({
            path: columnPath,
            key: columnKey,
            scope: bindingScope(columnRec.data, childScope),
            source: false,
          });
        }
        const cellItems = record(columnRec.cell)?.items;
        if (Array.isArray(cellItems)) {
          walkItems(out, `${columnPath}.cell.items`, cellItems, childScope, depth + 1);
        }
      });
    }
    const cellItems = record(item.cell)?.items;
    if (Array.isArray(cellItems)) {
      walkItems(out, `${path}.cell.items`, cellItems, childScope, depth + 1);
    }
    const cardItems = record(item.item)?.items;
    if (Array.isArray(cardItems)) {
      walkItems(out, `${path}.item.items`, cardItems, childScope, depth + 1);
    }
  });
}

/** Collect every `data.key` binding in the template text, with the structural
 * path that carries it. Never throws — unparseable text yields no bindings
 * (every field then reads "unused", which matches a template the engine
 * cannot render either). */
export function readBindings(source: string): readonly BindingRef[] {
  let raw: unknown;
  try {
    // Editor-held TEMPLATE text (an image can push it past 2 MiB) → ceiling.
    raw = readTemplate(parseTemplate(source, MAX_TEMPLATE_BYTES_CEILING));
  } catch {
    return [];
  }
  const out: BindingRef[] = [];
  const sections = record(record(raw)?.sections);
  if (sections === undefined) {
    return out;
  }
  for (const name of ['header', 'body', 'footer'] as const) {
    const items = record(sections[name])?.items;
    if (Array.isArray(items)) {
      walkItems(out, `sections.${name}.items`, items, null, 0);
    }
  }
  return out;
}
