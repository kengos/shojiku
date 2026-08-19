// The op wire vocabulary: what an operation IS and what applying one RETURNS.
// Every other module of the op layer speaks these types — the shape checkers
// (`snippet.ts`), the target resolvers (`opTarget.ts`), the two op families
// (`keyOps.ts` / `seqOps.ts`) and the `applyOp` dispatcher (`ops.ts`).
//
// A scalar/strings op addresses a leaf by `path` (the structural grammar with
// `[n]` indices — the selected item) plus `keys` (a pure map-key path drilled
// under it — the property, e.g. `["box", "x"]` or `["data", "key"]`).
//
// `path` is OPTIONAL on the map-key ops (`setScalar`/`setStrings`/`removeKey`/
// `renameKey`/`putValue`): absent means the document root map, so `keys` drills
// from there. This reaches top-level document keys the structural grammar cannot
// spell (it has no root token) — the page-setup surface edits `page.size` at the
// root via `{ op: 'setScalar', keys: ['page', 'size'], value: 'A4' }`, and the
// styles-registry surface renames `styles.<name>` via `renameKey` and creates
// `styles.<name>: {}` via `putValue`. The sequence ops
// (`moveItem`/`duplicateItem`/`insertItem`/`removeItem`) keep a required
// `path`: the root is a map, never a sequence. `moveItem` alone may name a
// SECOND sequence (`toPath`) — the cross-parent move, which splices the node
// itself so the moved subtree keeps its comments and aliases.

export type ScalarValue = string | number | boolean;

/** A subtree an `insertItem` op composes into the document: plain JSON-shaped
 * data (finite scalars, arrays, plain maps). Deliberately NOT YAML text — a
 * text snippet would be a second grammar inside the op wire, and a JS value
 * cannot carry aliases/anchors, so the alias-bomb surface never opens. */
export type SnippetValue =
  | ScalarValue
  | readonly SnippetValue[]
  | { readonly [key: string]: SnippetValue };

export type Op =
  | {
      readonly op: 'setScalar';
      readonly path?: string;
      readonly keys: readonly string[];
      readonly value: ScalarValue;
    }
  | {
      readonly op: 'setStrings';
      readonly path?: string;
      readonly keys: readonly string[];
      readonly values: readonly string[];
    }
  | { readonly op: 'removeKey'; readonly path?: string; readonly keys: readonly string[] }
  | {
      readonly op: 'renameKey';
      readonly path?: string;
      readonly keys: readonly string[];
      readonly to: string;
    }
  | {
      readonly op: 'putValue';
      readonly path?: string;
      readonly keys: readonly string[];
      readonly value: SnippetValue;
    }
  | {
      readonly op: 'moveItem';
      readonly path: string;
      readonly from: number;
      readonly to: number;
      /** The sequence the element moves INTO. Absent (or naming the same
       * sequence) reorders inside `path`. `to` always means the index in the
       * destination AFTER the source removal, so same-sequence it is the
       * post-splice index and cross-sequence the plain insertion index —
       * which, like `insertItem`, admits `length` to append. */
      readonly toPath?: string;
    }
  | { readonly op: 'duplicateItem'; readonly path: string; readonly index: number }
  | {
      readonly op: 'insertItem';
      readonly path: string;
      readonly index: number;
      readonly value: SnippetValue;
    }
  | { readonly op: 'removeItem'; readonly path: string; readonly index: number };

export type OpErrorCode =
  | 'path_not_found'
  | 'not_a_map'
  | 'not_a_seq'
  | 'key_not_found'
  | 'index_out_of_range'
  | 'invalid_value';

export interface OpError {
  readonly code: OpErrorCode;
  readonly message: string;
}

export type OpResult = { readonly ok: true } | { readonly ok: false; readonly error: OpError };

export const OK: OpResult = { ok: true };

/** Echoed inputs (paths, keys) are clipped in error messages, mirroring the
 * engine's diagnostics discipline: never reflect unbounded content. */
const MAX_ECHO = 200;

/**
 * Characters that may not appear in an echo, matching the engine's
 * `shojiku_diagnostics::sanitize`: C0/C1 controls (an escape sequence
 * repaints a terminal, a newline forges a log line) plus the bidirectional
 * formatting characters, which reorder how the rest of the message displays
 * without changing its content. The zero-width joiner and non-joiner are
 * deliberately NOT here — they carry meaning in real text.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
const UNSAFE_ECHO = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function clip(input: string): string {
  const safe = input.replace(UNSAFE_ECHO, '');
  // Count by CODE POINT, not UTF-16 unit: `slice` on a string of astral
  // characters (emoji, rare CJK) can cut a surrogate pair in half and
  // produce a lone surrogate, which renders as a replacement character.
  const points = Array.from(safe);
  return points.length > MAX_ECHO ? `${points.slice(0, MAX_ECHO).join('')}…` : safe;
}

/** A path's label for an error message: the clipped path, or `document root`
 * when the op omitted `path` (root-addressed). */
export function pathLabel(path: string | undefined): string {
  return path === undefined ? 'document root' : clip(path);
}

export function fail(code: OpErrorCode, message: string): OpResult {
  return { ok: false, error: { code, message } };
}
