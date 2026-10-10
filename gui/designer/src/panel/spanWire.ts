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
import type { SerializedRun } from '../text/runSerialize';
import type { RunMarks } from '../text/spanRuns';

/** A snippet's MAP form — the shape `insertItem` composes into the document. */
export type SnippetMap = { readonly [key: string]: SnippetValue };

import { record } from './itemView';
import { combineToken, UNREADABLE_COMBINE } from './typesettingModel';

/** The tate-chu-yoko key — the fifth mark, kept out of `MARK_KEYS` because its
 * value is not always a scalar (`{ digits: N }`). */
export const COMBINE_KEY = 'textCombineUpright';

/** What a combine token spells on the wire, or `null` for nothing to write.
 * A token is turned back into the value it was READ from, never into a new
 * one: `digitsN` → `{ digits: N }` for ANY integer N (out of the engine's
 * 2..=4 too — that map is what the author wrote, and the engine already reports
 * it), a keyword → itself. Unset writes nothing, and so does the UNREADABLE
 * token, whose authored shape this model never kept (a fragment split out of
 * such a run gets no value rather than an invented one). */
function combineWire(token: string): SnippetValue | null {
  if (token === '' || token === UNREADABLE_COMBINE) {
    return null;
  }
  const digits = /^digits(-?\d+)$/.exec(token);
  return digits === null ? token : { digits: Number(digits[1]) };
}

/** The four style keys this surface owns. `fontSize`, `fontFamily` and
 * `letterSpacing` are deliberately NOT here: the flow surface is not WYSIWYG
 * (`canvas/InlineTextEditor` says so), so it shows no metric and therefore
 * writes none — those three are the panel's (and a split carries them over,
 * `INHERITED_STYLE_KEYS`). */
export const MARK_KEYS = ['fontWeight', 'fontStyle', 'textDecoration', 'color'] as const;

/** The style keys a span honours that this surface does NOT edit — the
 * engine's per-span list (`Style::ignored_span_keys`'s complement in
 * `engine/core/src/style/inert.rs`) minus `MARK_KEYS` and the combine key.
 * A fragment split out of another copies them, or marking one word of a 12pt
 * fragment would drop the rest of it back to the block's size. Pinned against
 * the Rust by `spanWire.inert.test.ts`. */
export const INHERITED_STYLE_KEYS = ['fontSize', 'fontFamily', 'letterSpacing'] as const;

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
  const out: Record<string, SnippetValue> = {};
  for (const key of MARK_KEYS) {
    const value = values[key];
    if (value !== null) {
      out[key] = value;
    }
  }
  const combine = combineWire(marks.combine);
  if (combine !== null) {
    out[COMBINE_KEY] = combine;
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
  ops.push(...combineOps(spanPath, style, marks.combine));
  return ops;
}

/** The tate-chu-yoko write, compared as TOKENS: a fragment whose token did not
 * move authors nothing, so an authored `{ digits: 3 }` (or an unreadable
 * shape) survives every edit that does not press the toggle. */
function combineOps(
  spanPath: string,
  style: Readonly<Record<string, unknown>>,
  next: string,
): readonly Op[] {
  if (combineToken(style[COMBINE_KEY]) === next) {
    return [];
  }
  const keys = ['style', COMBINE_KEY];
  // Guarded by the token check above: the current token is not `''`, and only
  // a PRESENT value reads as anything else, so this removal has a key to hit.
  if (next === '') {
    return [{ op: 'removeKey', path: spanPath, keys }];
  }
  const value = combineWire(next);
  return value === null ? [] : [{ op: 'putValue', path: spanPath, keys, value }];
}

/** The keys this surface does NOT edit, copied onto a fragment the edit split
 * out of an existing one. Splitting a linked, named-style, 12pt fragment must
 * leave both halves linked, named and 12pt — that is what every editor a
 * reader has met does, and the alternative silently drops an author's work at
 * a boundary they never placed. Three pieces, composed by `spanOps`:
 * `inheritedKeys` (`styleNames`, `link`), `inheritedStyle` (the metrics) and
 * `inheritedBinding` (a bound run's options).
 *
 * Each is NARROWED on the way through rather than copied verbatim: the source
 * is document text, so a value of the wrong shape must not be carried onto a
 * fragment the reader just created. The engine would report it, but the
 * report would name a node nobody authored. */
export function inheritedKeys(source: unknown): SnippetMap {
  const span = record(source);
  if (span === undefined) {
    return {};
  }
  const out: Record<string, SnippetValue> = {};
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

/** The source's `INHERITED_STYLE_KEYS` whose value is a scalar — a string or a
 * finite number, copied as the source wrote it so the new node says what the
 * old one did — or `undefined` when it has none. The source's MARK keys are
 * never copied: the new run's own marks decide those. */
export function inheritedStyle(source: unknown): SnippetMap | undefined {
  const style = record(record(source)?.style);
  const out: Record<string, SnippetValue> = {};
  for (const key of INHERITED_STYLE_KEYS) {
    const value = style?.[key];
    if (isScalar(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** A string or a finite number — the one narrowing every inherited value goes
 * through, and the same shapes `display` shows as set. */
function isScalar(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** The engine's two `BindingScope` spellings — anything else is a parse error
 * in the source, and is not copied onto a new node. */
const SCOPES = new Set(['element', 'document']);

/** The `data:` a re-inserted BOUND run is written with when its source is bound
 * to the SAME key: the run's key plus the source's `format`, `placeholder` and
 * `scope`. `undefined` for a text run, another key, or nothing to give — the
 * run's plain `{ key }` then stands.
 *
 * No measured edit reaches this. A bound fragment is atomic in the flow, and
 * paste and drop insert plain text, so marking, typing beside it, deleting and
 * undoing a single delete all leave it on its own node. It is a defence for the
 * paths nobody measured (an IME, a native undo beyond a single delete) — a
 * binding's options are an author's work just as its metrics are. */
export function inheritedBinding(source: unknown, run: SerializedRun): SnippetMap | undefined {
  const data = record(record(source)?.data);
  if (run.kind !== 'bound' || data === undefined || data.key !== run.content) {
    return undefined;
  }
  const out: Record<string, SnippetValue> = { key: run.content };
  for (const option of ['format', 'placeholder'] as const) {
    const value = data[option];
    if (isScalar(value)) {
      out[option] = value;
    }
  }
  if (typeof data.scope === 'string' && SCOPES.has(data.scope)) {
    out.scope = data.scope;
  }
  return Object.keys(out).length === 1 ? undefined : out;
}
