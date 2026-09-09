// One fragment's MARKS as wire keys — the narrow bridge between the editor's
// `RunMarks` and `spans[i].style`. Kept apart from the batch assembly in
// `spanOps` because these are two different questions: what one fragment's
// style should say, and in what ORDER a sequence of fragments may be rewritten.
//
// Every removal here is PRESENCE-GUARDED, and it has to be: `removeKey` on an
// absent key returns `key_not_found`, and `applyAll` re-parses the pre-batch
// snapshot on the first failing op — so one unguarded removal silently discards
// the whole commit, including the text the reader just typed.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import type { RunMarks } from '../text/spanRuns';

/** A snippet's MAP form — the shape `insertItem` composes into the document. */
export type SnippetMap = { readonly [key: string]: SnippetValue };

import { record } from './itemView';

/** The four style keys this surface owns. `fontSize`, `fontFamily` and
 * `letterSpacing` are deliberately NOT here: the flow surface is not WYSIWYG
 * (`canvas/InlineTextEditor` says so), so it shows no metric and therefore
 * writes none — those three are the panel inspector's. */
const MARK_KEYS = ['fontWeight', 'fontStyle', 'textDecoration', 'color'] as const;

/** What each mark spells on the wire, or `null` for "this fragment sets none",
 * which is a REMOVAL rather than a value. The engine has explicit `normal` and
 * `none` keywords, but authoring them would leave a key behind on every
 * fragment a reader ever un-bolded — the minimal-wire rule the declaration
 * modules follow. */
export function markValues(marks: RunMarks): Readonly<Record<string, string | null>> {
  return {
    fontWeight: marks.bold ? 'bold' : null,
    fontStyle: marks.italic ? 'italic' : null,
    textDecoration: marks.decoration === 'none' ? null : marks.decoration,
    color: marks.color === '' ? null : marks.color,
  };
}

/** The `style:` map a NEW fragment is inserted with — only the keys that say
 * something, and omitted entirely when none do. */
export function markStyleValue(marks: RunMarks): SnippetMap | undefined {
  const values = markValues(marks);
  const out: Record<string, string> = {};
  for (const key of MARK_KEYS) {
    const value = values[key];
    if (value !== null) {
      out[key] = value;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** The style writes that take an EXISTING fragment from what it says now to
 * `marks`. `current` is the fragment's own raw `style` value (hostile shapes
 * included — a non-map reads as "sets nothing", which is also what makes every
 * removal below correctly guarded). */
export function markStyleOps(spanPath: string, current: unknown, marks: RunMarks): readonly Op[] {
  const style = record(current) ?? {};
  const values = markValues(marks);
  const ops: Op[] = [];
  for (const key of MARK_KEYS) {
    const next = values[key];
    const present = Object.hasOwn(style, key);
    if (next === null) {
      if (present) {
        ops.push({ op: 'removeKey', path: spanPath, keys: ['style', key] });
      }
      continue;
    }
    if (style[key] !== next) {
      ops.push({ op: 'setScalar', path: spanPath, keys: ['style', key], value: next });
    }
  }
  return ops;
}

/** The keys this surface does NOT edit, copied onto a fragment the edit split
 * out of an existing one. Splitting a linked, named-style fragment must leave
 * both halves linked and named — that is what every editor a reader has met
 * does, and the alternative silently drops an author's work at a boundary they
 * never placed. */
export function inheritedKeys(source: unknown): SnippetMap {
  const span = record(source);
  if (span === undefined) {
    return {};
  }
  const out: Record<string, SnippetValue> = {};
  // NARROWED on the way through, not copied verbatim: the source is document
  // text, so a `styleNames` holding a number or a `link` holding a non-string
  // `url` must not be carried onto a fragment the reader just created. The
  // engine would report it, but the report would name a node nobody authored.
  const names = Array.isArray(span.styleNames)
    ? span.styleNames.filter((name): name is string => typeof name === 'string')
    : [];
  if (names.length > 0) {
    out.styleNames = names;
  }
  const url = record(span.link)?.url;
  if (typeof url === 'string') {
    out.link = { url };
  }
  return out;
}
