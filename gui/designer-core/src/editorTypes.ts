// The Editor's wire types: how a session is created, what a step carries beside
// its ops, and what a committed change reports to subscribers. Type-only, so
// the session in `editor.ts` keeps its budget for behaviour.

import type { Op } from './ops';

/** Options for `Editor.create`. */
export interface EditorOptions<C = undefined> {
  /** The template-size cap this session parses under (clamped to
   * `[MAX_TEMPLATE_BYTES, MAX_TEMPLATE_BYTES_CEILING]`). Raised by a host that
   * lets the user hold inline images; every internal re-parse (rollback / undo
   * / redo) uses it, so a legally-oversized document stays editable. */
  readonly maxBytes?: number;
  /** The host's companion state at the start (opaque to the core). */
  readonly companion?: C;
}

/** What a step does beside its template ops: the companion state it leaves
 * behind, and the effect undo/redo reports when it crosses the step. */
export interface EditorStep<C, E> {
  readonly companion: C;
  readonly effect?: E;
}

/** What a committed edit was: a single `apply`, one transactional `applyAll`,
 * or a history move. History moves carry no ops — they restore a snapshot. */
export type EditorChangeSource = 'apply' | 'batch' | 'undo' | 'redo';

/** One committed change, as reported to subscribers. `ops` is empty for the
 * history sources; for `apply`/`batch` it is exactly the ops that landed.
 * `effect` is the step's effect: the one just made (`batch`), or the one an
 * undo/redo crossed — the host applies it backward or forward. */
export interface EditorChange<E = unknown> {
  readonly ops: readonly Op[];
  readonly source: EditorChangeSource;
  readonly effect?: E;
}

/** A read-only observer of committed changes. Called AFTER the document and
 * history have settled, so a listener reading `text()`/`selection()` sees the
 * post-edit state. */
export type EditorListener<E = unknown> = (change: EditorChange<E>) => void;
