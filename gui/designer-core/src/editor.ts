// The editing session: the live document plus the undo/redo history and the
// current selection. Components call `apply`/`applyAll` with named ops — never
// mutate the document directly. Each history entry is a text snapshot (byte-exact
// restore) PAIRED WITH the selection at that point, so undo/redo restore where
// the user was working, not just the text — undoing a `moveItem` puts the
// selection back on the item at its old path, and redoing an insert re-selects
// the item it re-creates. The history is capped so a long session can't grow it
// without bound. What an entry IS and the budget that bounds the stack live in
// `history.ts`; this file owns the session that pushes and pops them.

import type { Document } from 'yaml';
import { clampTemplateMaxBytes, parseTemplate, readNode, serializeTemplate } from './document';
import { type HistoryEntry, MAX_HISTORY, MAX_HISTORY_BYTES, trimHistory } from './history';
import { applyOp, type Op, type OpError, type OpResult } from './ops';
import { formatPath, parsePath, toYamlPath } from './path';

/** Options for `Editor.create`. */
export interface EditorOptions {
  /** The template-size cap this session parses under (clamped to
   * `[MAX_TEMPLATE_BYTES, MAX_TEMPLATE_BYTES_CEILING]`). Raised by a host that
   * lets the user hold inline images; every internal re-parse (rollback / undo
   * / redo) uses it, so a legally-oversized document stays editable. */
  readonly maxBytes?: number;
}

/** Maximum ops in one `applyAll` batch — a bound on a single transactional
 * edit, since the op surface is AI-parity-public (an untrusted flow can emit a
 * batch). */
export const MAX_BATCH_OPS = 256;

/** The result of a transactional `applyAll`: on failure, `index` is the op that
 * failed (or the batch-level rejection at 0), and the document is left
 * byte-exact as it was before the batch. */
export type BatchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: OpError; readonly index: number };

/** What a committed edit was: a single `apply`, one transactional `applyAll`,
 * or a history move. History moves carry no ops — they restore a snapshot. */
export type EditorChangeSource = 'apply' | 'batch' | 'undo' | 'redo';

/** The document read contract every pure model in the Designer consults —
 * `Editor.read` (and the React controller's `read`, which wraps it). It lives
 * here rather than beside any one feature because the reader is the document
 * core, not the feature that happens to call it. */
export type ReadFn = (path: string) => unknown;

/** One committed change, as reported to subscribers. `ops` is empty for the
 * history sources; for `apply`/`batch` it is exactly the ops that landed. */
export interface EditorChange {
  readonly ops: readonly Op[];
  readonly source: EditorChangeSource;
}

/** A read-only observer of committed changes. Called AFTER the document and
 * history have settled, so a listener reading `text()`/`selection()` sees the
 * post-edit state. */
export type EditorListener = (change: EditorChange) => void;

export class Editor {
  #doc: Document;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #selection: string | null = null;
  #maxBytes: number;
  #listeners = new Set<EditorListener>();

  private constructor(doc: Document, maxBytes: number) {
    this.#doc = doc;
    this.#maxBytes = maxBytes;
  }

  /** Create an editor over template source. `options.maxBytes` raises the
   * template-size cap (clamped to the ceiling); it applies to the initial parse
   * AND every internal re-parse. Throws `TemplateParseError` if the source is
   * over the resolved cap or malformed. */
  static create(source: string, options: EditorOptions = {}): Editor {
    const maxBytes = clampTemplateMaxBytes(options.maxBytes);
    return new Editor(parseTemplate(source, maxBytes), maxBytes);
  }

  /** Adopt a new template-size cap mid-session (the user raised the editor's
   * limit to hold a larger image) WITHOUT discarding history: the retained
   * snapshots already parsed under the old (smaller) limit, so re-parsing them
   * under the larger one always succeeds. The value is clamped to the ceiling. */
  setMaxBytes(maxBytes: number): void {
    this.#maxBytes = clampTemplateMaxBytes(maxBytes);
  }

  /** The current template-size cap (clamped). */
  maxBytes(): number {
    return this.#maxBytes;
  }

  /** The current document as canonical YAML text (CST-preserving). */
  text(): string {
    return serializeTemplate(this.#doc);
  }

  /** Materialize the subtree at a structural `path` for the property panel to
   * read (display-only; never written back). A missing node reads as
   * `undefined`. Throws `PathSyntaxError` on a malformed path or
   * `TemplateParseError` on an alias bomb in the subtree. */
  read(path: string): unknown {
    return readNode(this.#doc, toYamlPath(parsePath(path)));
  }

  /** Apply an op. On success the pre-edit text is pushed to the undo stack and
   * the redo stack cleared; on failure the document and history are untouched. */
  apply(op: Op): OpResult {
    const before = serializeTemplate(this.#doc);
    const result = applyOp(this.#doc, op);
    if (!result.ok) {
      return result;
    }
    this.#commit(before);
    this.#notify([op], 'apply');
    return result;
  }

  /** Observe committed changes. Returns an unsubscribe function. Observation
   * only: a listener cannot alter the edit (it runs after the commit), which
   * keeps the op surface the single mutation path — anything the GUI does, an
   * AI does by emitting the same ops. */
  subscribe(listener: EditorListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(ops: readonly Op[], source: EditorChangeSource): void {
    for (const listener of this.#listeners) {
      listener({ ops, source });
    }
  }

  /** Apply a sequence of ops as ONE transactional edit: all succeed and land as
   * a single undo step, or the first failure rolls the document back byte-exact
   * (re-parsing the pre-batch snapshot) and returns that op's index. Used for
   * edits that must not leave a half-applied intermediate state (switching a
   * text item's content between `text` and `data`). */
  applyAll(ops: readonly Op[]): BatchResult {
    if (ops.length > MAX_BATCH_OPS) {
      return {
        ok: false,
        error: { code: 'invalid_value', message: `batch over ${MAX_BATCH_OPS} ops` },
        index: 0,
      };
    }
    if (ops.length === 0) {
      return { ok: true };
    }
    const before = serializeTemplate(this.#doc);
    for (let index = 0; index < ops.length; index++) {
      const result = applyOp(this.#doc, ops[index]);
      if (!result.ok) {
        this.#doc = parseTemplate(before, this.#maxBytes);
        return { ok: false, error: result.error, index };
      }
    }
    this.#commit(before);
    this.#notify(ops, 'batch');
    return { ok: true };
  }

  /** Clear the redo stack (a fresh edit forks history), push a pre-edit entry
   * (text + the selection as it was before the edit) onto the undo stack, then
   * trim it to the count + byte budget. `applyOp` never touches the selection,
   * so `this.#selection` here is still the pre-edit selection. */
  #commit(before: string): void {
    this.#redo = [];
    this.#undo.push({ text: before, selection: this.#selection });
    this.#undo = trimHistory(this.#undo, MAX_HISTORY, MAX_HISTORY_BYTES);
  }

  canUndo(): boolean {
    return this.#undo.length > 0;
  }

  canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /** Restore the previous entry — text AND selection. The current state (text +
   * selection) is pushed onto the redo stack so a following redo returns here
   * exactly, selection included. Returns false when there is nothing to undo. */
  undo(): boolean {
    const previous = this.#undo.pop();
    if (previous === undefined) {
      return false;
    }
    this.#redo.push({ text: serializeTemplate(this.#doc), selection: this.#selection });
    this.#doc = parseTemplate(previous.text, this.#maxBytes);
    this.#selection = previous.selection;
    this.#notify([], 'undo');
    return true;
  }

  /** Re-apply the last undone entry — text AND selection. The current state is
   * pushed back onto the undo stack. Returns false when there is nothing to redo. */
  redo(): boolean {
    const next = this.#redo.pop();
    if (next === undefined) {
      return false;
    }
    this.#undo.push({ text: serializeTemplate(this.#doc), selection: this.#selection });
    this.#doc = parseTemplate(next.text, this.#maxBytes);
    this.#selection = next.selection;
    this.#notify([], 'redo');
    return true;
  }

  /** Select a node by its structural path (validated + canonicalized). Throws
   * `PathSyntaxError` on a malformed path. */
  select(path: string): void {
    this.#selection = formatPath(parsePath(path));
  }

  clearSelection(): void {
    this.#selection = null;
  }

  selection(): string | null {
    return this.#selection;
  }
}
