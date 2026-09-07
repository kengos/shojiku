// The READ side of a text item's `spans:` — inline rich text, and the panel's
// only view of it. Until now the Designer had none at all: `itemView` reads
// `text:` and nothing else, so a spans-carrying item showed (and let the reader
// EDIT) a key the engine ignores — `spans` takes precedence over `text`/`data`
// when non-empty, and authoring one makes the document warn
// (`engine/core/src/validate/spans.rs`, `span_content_conflict`).
//
// Every field is narrowed the way `text/declModel` narrows `bindings:` —
// templates are untrusted, so a hostile shape degrades to "unset" rather than
// throwing. The one thing that must NOT degrade is `index`: it is the wire
// position the write path addresses (`<item>.spans[i]`), so a skipped entry
// leaves a GAP in the returned indices rather than renumbering its neighbours.

import type { ReadFn } from '@shojiku/designer-core';
import { readItem } from '../text/declModel';
import { display, record } from './itemView';

/** Mirrors `MAX_SPANS` in `engine/core/src/template/spans.rs`. The engine
 * applies the first `MAX_SPANS` and warns (`too_many_spans`) about the rest, so
 * capping the LIST here shows exactly the fragments that render and owes the
 * reader no extra sentence. It is a DISPLAY bound only — the declaration name
 * sets in `text/declModel` stay uncapped, or a minted name could collide with
 * one a span past the cap is still using. Pinned against the Rust by
 * `spansModel.test.ts`. */
export const MAX_SPANS = 256;

/** One fragment as the panel shows it. `text` and `dataKey` are mutually
 * exclusive on a well-formed span (the engine warns when both are set and
 * `data` wins); both empty is an `empty_span`, which the row still has to
 * render as SOMETHING rather than a blank. */
export interface SpanView {
  /** The wire index — what `<item>.spans[index]` addresses. Not the row's
   * position in this array, which a skipped entry makes differ. */
  readonly index: number;
  readonly text: string;
  readonly dataKey: string;
  /** This fragment's own `link.url`, `''` when it carries none. */
  readonly url: string;
}

/** The fragments of the item at `path`, or `[]` for an item with no `spans:`
 * (and for any hostile shape). */
export function readSpans(read: ReadFn, path: string): readonly SpanView[] {
  return narrowSpans(readItem(read, path)?.spans);
}

/** [`readSpans`] over an already-materialized value, so the pure tests and the
 * op builders can share one narrowing. */
export function narrowSpans(value: unknown): readonly SpanView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: SpanView[] = [];
  for (const [index, entry] of value.slice(0, MAX_SPANS).entries()) {
    const span = record(entry);
    if (span === undefined) {
      continue;
    }
    out.push({
      index,
      text: display(span.text),
      dataKey: display(record(span.data)?.key),
      url: display(record(span.link)?.url),
    });
  }
  return out;
}
