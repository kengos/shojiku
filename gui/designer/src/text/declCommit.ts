// What one chip-editor commit writes: the text edit, the declarations the
// session staged for it, and the removal of a declaration THIS edit orphaned —
// assembled as ONE op batch (see `text/declModel` for reading them and
// `text/declMint` for how a staged one gets its name).
//
// The batch is what makes a cancelled edit leave nothing behind: a staged
// declaration reaches the document only alongside the text that references it.

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { plainTextOp } from '../panel/model';
import {
  type Declaration,
  narrowDeclarations,
  otherSurfaceNames,
  type PendingDecl,
  readItem,
} from './declModel';
import { interpolationKeys, MAX_TEXT_EXPRS, parseRawSegments } from './interpolate';

/** Whether a text holds so many expressions that the display-side cap stopped
 * reading them. The ENGINE has no such cap, so past it a name the GUI reads as
 * unreferenced is still live — the prune has to stand down rather than drop a
 * declaration the page is using. */
function saturated(text: string): boolean {
  let exprs = 0;
  for (const segment of parseRawSegments(text)) {
    if (segment.kind === 'expr') {
      exprs += 1;
    }
  }
  return exprs >= MAX_TEXT_EXPRS;
}

function declValue(decl: Declaration): SnippetValue {
  return decl.scope === 'document' ? { key: decl.key, scope: 'document' } : { key: decl.key };
}

/** What one chip-editor commit writes. */
export interface CommitInput {
  readonly read: ReadFn;
  readonly path: string;
  /** The text the editor opened with — its names are what a prune may drop. */
  readonly oldText: string;
  readonly newText: string;
  readonly pending: readonly PendingDecl[];
}

/** The ONE batch a commit applies: the text edit, the staged declarations the
 * new text actually references, and the removal of a declaration THIS edit
 * orphaned. Applied through `applyAll` it is a single undo step, and a
 * serializable op list an AI could have produced (AI parity).
 *
 * A declaration is pruned only when the old text referenced it, the new text
 * does not, and no other surface of the item still does — so a chip deleted
 * from the text takes its declaration with it while an externally authored or
 * link-URL-only one is left alone. It exists by construction (it was read from
 * the item's own map), so the `removeKey` can never fail the batch with
 * `key_not_found`; an unreadable item yields no declarations and therefore no
 * prune at all, and a text past the display-side expression cap stands the
 * prune down entirely (see [`saturated`]). */
export function commitOps(input: CommitInput): readonly Op[] {
  const { read, path, oldText, newText, pending } = input;
  const ops: Op[] = [plainTextOp(path, ['text'], newText)];
  const item = readItem(read, path);
  const declared = narrowDeclarations(item?.bindings);
  const used = new Set(interpolationKeys(newText));
  const staged = new Set<string>();
  for (const decl of pending) {
    if (!used.has(decl.name) || staged.has(decl.name)) {
      continue;
    }
    staged.add(decl.name);
    const existing = declared.get(decl.name);
    if (existing !== undefined && existing.key === decl.key && existing.scope === decl.scope) {
      continue;
    }
    ops.push({ op: 'putValue', path, keys: ['bindings', decl.name], value: declValue(decl) });
  }
  if (saturated(oldText) || saturated(newText)) {
    return ops;
  }
  const others = otherSurfaceNames(item);
  const before = new Set(interpolationKeys(oldText));
  for (const name of declared.keys()) {
    if (before.has(name) && !used.has(name) && !others.has(name)) {
      ops.push({ op: 'removeKey', path, keys: ['bindings', name] });
    }
  }
  return ops;
}
