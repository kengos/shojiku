// The editing session: the live document plus the undo/redo history and the
// current selection. Components call `apply`/`applyAll` with named ops — never
// mutate the document directly. Each history entry is a text snapshot (byte-exact
// restore) PAIRED WITH the selection at that point, so undo/redo restore where
// the user was working, not just the text — undoing a `moveItem` puts the
// selection back on the item at its old path, and redoing an insert re-selects
// the item it re-creates. The history is capped so a long session can't grow it
// without bound. A host may keep a COMPANION document beside the template (the
// Designer's definitions edits): each entry snapshots it too, and a STEP can
// change it — with or without template ops — so an action spanning both is ONE
// undo/redo, and a step can carry an EFFECT the host applies when undo/redo
// crosses it. What an entry IS and the budget that bounds the stack live in
// `history.ts`, the stack pair in `undoStack.ts`; this file owns the session
// that builds the entries and restores them.

import type { Document } from 'yaml';
import { clampTemplateMaxBytes, parseTemplate, readNode, serializeTemplate } from './document';
import type {
  EditorChange,
  EditorChangeSource,
  EditorListener,
  EditorOptions,
  EditorStep,
} from './editorTypes';
import { type HistoryEntry, historyEntry } from './history';
import { applyOp, type Op, type OpError, type OpResult } from './ops';
import { formatPath, parsePath, toYamlPath } from './path';
import { UndoStack } from './undoStack';

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

/** The document read contract every pure model in the Designer consults —
 * `Editor.read` (and the React controller's `read`, which wraps it). It lives
 * here rather than beside any one feature because the reader is the document
 * core, not the feature that happens to call it. */
export type ReadFn = (path: string) => unknown;

export type { EditorChange, EditorChangeSource, EditorListener, EditorOptions, EditorStep };

export class Editor<C = undefined, E = never> {
  #doc: Document;
  #history = new UndoStack<C, E>();
  #selection: string | null = null;
  #companion: C;
  #maxBytes: number;
  #listeners = new Set<EditorListener<E>>();

  private constructor(doc: Document, maxBytes: number, companion: C) {
    this.#doc = doc;
    this.#maxBytes = maxBytes;
    this.#companion = companion;
  }

  /** Create an editor over template source. `options.maxBytes` raises the
   * template-size cap (clamped to the ceiling); it applies to the initial parse
   * AND every internal re-parse. Throws `TemplateParseError` if the source is
   * over the resolved cap or malformed. */
  static create<C = undefined, E = never>(
    source: string,
    options: EditorOptions<C> = {},
  ): Editor<C, E> {
    const maxBytes = clampTemplateMaxBytes(options.maxBytes);
    // An omitted companion is `undefined`, which is what `C` defaults to.
    return new Editor<C, E>(parseTemplate(source, maxBytes), maxBytes, options.companion as C);
  }

  /** The host's companion state as of the current history position. */
  companion(): C {
    return this.#companion;
  }

  /** The effect of the step an undo would take back (`undefined` for a plain
   * template edit or an empty stack) — what a host reads to tell whether the
   * next undo is one of its own steps. */
  undoEffect(): E | undefined {
    return this.#history.undoEffect();
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
  subscribe(listener: EditorListener<E>): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #notify(ops: readonly Op[], source: EditorChangeSource, effect?: E): void {
    const change: EditorChange<E> =
      effect === undefined ? { ops, source } : { ops, source, effect };
    for (const listener of this.#listeners) {
      listener(change);
    }
  }

  /** Apply a sequence of ops as ONE transactional edit: all succeed and land as
   * a single undo step, or the first failure rolls the document back byte-exact
   * (re-parsing the pre-batch snapshot) and returns that op's index. Used for
   * edits that must not leave a half-applied intermediate state (switching a
   * text item's content between `text` and `data`). A `step` lands in the SAME
   * undo step: the companion it leaves and the effect it records — with no ops
   * at all, it is a companion-only step. */
  applyAll(ops: readonly Op[], step?: EditorStep<C, E>): BatchResult {
    if (ops.length > MAX_BATCH_OPS) {
      return {
        ok: false,
        error: { code: 'invalid_value', message: `batch over ${MAX_BATCH_OPS} ops` },
        index: 0,
      };
    }
    if (ops.length === 0 && step === undefined) {
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
    this.#commit(before, step);
    this.#notify(ops, 'batch', step?.effect);
    return { ok: true };
  }

  /** Clear the redo stack (a fresh edit forks history), push a pre-edit entry
   * (text + the selection and companion as they were before the edit, + the
   * step's effect) onto the undo stack, then trim it to the count + byte budget.
   * `applyOp` never touches the selection, so `this.#selection` here is still
   * the pre-edit selection. */
  #commit(before: string, step?: EditorStep<C, E>): void {
    this.#history.record(historyEntry(before, this.#selection, this.#companion, step?.effect));
    if (step !== undefined) {
      this.#companion = step.companion;
    }
  }

  /** The current state as an entry carrying `effect` — what undo parks on the
   * redo stack (and redo on the undo stack). */
  #current(effect: E | undefined): HistoryEntry<C, E> {
    return historyEntry(serializeTemplate(this.#doc), this.#selection, this.#companion, effect);
  }

  /** Make `entry` the current state: text, selection and companion. */
  #restore(entry: HistoryEntry<C, E>): void {
    this.#doc = parseTemplate(entry.text, this.#maxBytes);
    this.#selection = entry.selection;
    this.#companion = entry.companion;
  }

  canUndo(): boolean {
    return this.#history.canUndo();
  }

  canRedo(): boolean {
    return this.#history.canRedo();
  }

  /** Restore the previous entry — text, selection AND companion. The current
   * state is pushed onto the redo stack so a following redo returns here
   * exactly; the crossed step's effect is reported for the host to take back.
   * Returns false when there is nothing to undo. */
  undo(): boolean {
    const previous = this.#history.back((effect) => this.#current(effect));
    if (previous === undefined) {
      return false;
    }
    this.#restore(previous);
    this.#notify([], 'undo', previous.effect);
    return true;
  }

  /** Re-apply the last undone entry — text, selection AND companion. The
   * current state is pushed back onto the undo stack, and the crossed step's
   * effect is reported for the host to re-apply. Returns false when there is
   * nothing to redo. */
  redo(): boolean {
    const next = this.#history.forward((effect) => this.#current(effect));
    if (next === undefined) {
      return false;
    }
    this.#restore(next);
    this.#notify([], 'redo', next.effect);
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
