// The palette's view of where the template binds each data key: one
// `BindingRef` per PLACE (an item, or a table column) per key and scope —
// several surfaces of one item naming the same key are one placement.
//
// A PROJECTION of the data-reference walk (`data/refs/walk.ts`), the one census
// every usage count shares, so the palette, the data-item editor's rows and its
// usage list never disagree about whether a field is used: values, spans, text
// marks, `visible:`, interpolated text and links, `bindings:` declarations,
// list entries, table columns and row conditions, header-group and column
// labels, all three bands, and the `document:` block (whose path is
// `document`, which selects no canvas item). Untrusted text: unparseable input
// yields no bindings (never a throw).

import { placePath } from '../data/refs/match';
import { readDataRefs } from '../data/refs/walk';

/** One `data.key` reference found in the template. */
export interface BindingRef {
  /** Structural path of the ITEM carrying the binding (the box-index
   * grammar), so selecting it highlights on canvas — a table column's own
   * path for a column binding, `document` for the document block. Spans and
   * text marks report their item's path — they have no box of their own. */
  readonly path: string;
  readonly key: string;
  /** The array the binding resolves in (dotted data path) — rows of a table /
   * repeat / repeat_flow, entries of a list — or `null` at document scope. */
  readonly scope: string | null;
  /** Whether this binding IS an array source (`table`/`repeat`/
   * `repeat_flow`/`list` `data:`). */
  readonly source: boolean;
}

/** Collect every data reference in the template text as palette bindings. Never
 * throws — unparseable text yields no bindings (every field then reads
 * "unused", which matches a template the engine cannot render either). */
export function readBindings(source: string): readonly BindingRef[] {
  const index = readDataRefs(source);
  if (index === null) {
    return [];
  }
  const seen = new Set<string>();
  const out: BindingRef[] = [];
  for (const ref of index.refs) {
    const path = placePath(ref);
    const scope = ref.frame.length === 0 ? null : ref.frame.join('.');
    const identity = JSON.stringify([path, ref.spelled, scope, ref.source]);
    if (!seen.has(identity)) {
      seen.add(identity);
      out.push({ path, key: ref.spelled, scope, source: ref.source });
    }
  }
  return out;
}
