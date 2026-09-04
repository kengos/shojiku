// Flow-body rules: which insert kinds lay out ONLY in the body's flow, and
// whether a resolved insert target is that flow. The mirror of
// `bandPlacement.ts` — where that file answers "this belongs in a band", this
// one answers "this belongs in the flow and nowhere else". Framework-free.
//
// The engine's own word for it is three warn-and-skip diagnostics per kind
// (`page_break_in_absolute_body` / `_in_band` / `_in_container`, and the same
// trio for `repeat`), so a misplaced item is not a parse error — it simply
// never draws. That is exactly the failure a menu row must not lead someone
// into, which is why the row states the reason instead of acting.

import type { ReadFn } from '@shojiku/designer-core';
import type { InsertKind } from './insertMenu';
import { BODY_ITEMS_PATH } from './model';

/** Which kinds lay out only in the body's flow.
 *
 * `charGrid` is deliberately NOT one of them: the engine places a `char_grid`
 * everywhere, drawing a single sheet (and dropping the overflow with
 * `char_grid_overflow`) outside a flow body rather than skipping the item. */
export function requiresFlow(kind: InsertKind): boolean {
  return kind === 'pageBreak';
}

/** Whether the insert target at `path` is the body's flow — the one owner a
 * `requiresFlow` kind lays out in.
 *
 * Positive test, so it fails CLOSED: a container target, an `absolute` body, a
 * body whose `type` is missing or unrecognized, and a read that throws (a
 * hostile subtree the materializer refuses) all read as NOT the flow. That
 * mirrors `panel/placementModel`, which likewise asks `owner.type === 'flow'`
 * rather than ruling `absolute` out.
 */
export function isFlowTarget(read: ReadFn, path: string): boolean {
  if (path !== BODY_ITEMS_PATH) {
    return false;
  }
  let body: unknown;
  try {
    body = read('sections.body');
  } catch {
    return false;
  }
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).type === 'flow'
  );
}
