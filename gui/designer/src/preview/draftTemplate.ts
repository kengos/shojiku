// The uncommitted-edit overlay: the template the canvas renders while a text
// edit is still in progress. Deliberately a THROWAWAY document — the ops are
// applied to a private `Editor` built from the committed source, so the live
// session's document, its undo history, and every save/export path are
// untouched (all three read the session's own text, never this string).
//
// "Draft" here is an UNCOMMITTED FIELD EDIT, not `designer-app`'s persisted
// draft (which is the unsaved document itself, and rides the committed text).
//
// Total by construction: a refused op, an unparseable source, or a result over
// the session's byte cap all answer `null`, and the caller renders the
// COMMITTED text. A draft is a courtesy to the eye — it may never be the reason
// a render fails, and it may never let the document grow without bound.

import { Editor, type Op } from '@shojiku/designer-core';

/** The template text `ops` would produce over `source`, or `null` when it
 * cannot be produced. `maxBytes` is the session's template-size cap. */
export function draftTemplate(source: string, ops: readonly Op[], maxBytes: number): string | null {
  if (ops.length === 0) {
    return null;
  }
  let draft: Editor;
  try {
    draft = Editor.create(source, { maxBytes });
  } catch {
    return null;
  }
  if (!draft.applyAll(ops).ok) {
    return null;
  }
  const text = draft.text();
  // `applyAll` enforces no size bound of its own: only a re-parse does, and a
  // SUCCESSFUL batch never re-parses. So the cap is checked here or nowhere.
  // The bound is the caller's — the session threads its own already-clamped
  // value — rather than the editor's clamped floor, so a host that hands down a
  // tighter budget gets it honoured. Fail-closed in both directions: a smaller
  // bound only ever refuses MORE drafts, and a refusal renders the committed
  // text.
  return new TextEncoder().encode(text).length > maxBytes ? null : text;
}
