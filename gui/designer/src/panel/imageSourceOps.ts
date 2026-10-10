// An image's source switch — fixed (`src`) ⇄ data-bound (`data`) — as pure
// plans over the panel's `ItemView`. The engine refuses the whole render when
// an image carries both keys or neither (`image_source_conflict` /
// `image_source_missing` are validation errors), so every plan here leaves
// exactly one, and each one lands as ONE `applyAll` batch — one undo step.
//
// What the switch drops is remembered per path (`ImageMemory`, held by
// `ContentSection` beside the text pair's dropped text, which forgets both the
// moment an edit could have moved an item to another path — `keepsItemPaths`),
// so switching the SAME image back costs nothing: the old `src` (a bundled path included, which no
// picker can re-make) or the old key and scope come back. A switch to fixed
// with nothing remembered cannot invent a `src`, so it asks the host to pick a
// file instead (`pick`), and the host writes `imageToFixedOps` once one is
// imported. A restored `src` goes through the host too (`restore`), because it
// must pass the template-size gate an import passes.

import type { EditorChange, Op } from '@shojiku/designer-core';
import type { ItemView } from './itemView';

/** The two content modes of an image, as the panel's select names them. */
export type ImageSourceMode = 'fixed' | 'data';

/** A dropped binding: the key and scope the bound arm edits. `format` and
 * `placeholder` are not kept — an image binding reads only its key
 * (`engine/image/src/prepare/load.rs` `dynamic_asset`), so they draw nothing. */
export interface DroppedBinding {
  readonly key: string;
  readonly scope: string;
}

/** What one image's switches have dropped so far. Both halves survive a failed
 * or cancelled switch, so a refused restore loses nothing. */
export interface ImageMemory {
  readonly path: string;
  readonly src?: string;
  readonly binding?: DroppedBinding;
}

/** What a switch does: apply ops now, restore a remembered `src` (the host
 * gates its size), or ask the host for a file. `memory` is the record to keep
 * whichever way it goes. */
export type ImageSwitchPlan =
  | { readonly kind: 'ops'; readonly ops: readonly Op[]; readonly memory: ImageMemory }
  | { readonly kind: 'restore'; readonly src: string; readonly memory: ImageMemory }
  | { readonly kind: 'pick'; readonly memory: ImageMemory };

type SourceView = Pick<ItemView, 'hasSrc' | 'src' | 'hasData' | 'dataKey' | 'dataScope'>;

/** The ops that edit inside an item and never move one: everything else —
 * an insert, a removal, a move, a duplicate, a renamed or replaced map — can
 * leave a DIFFERENT item at a remembered path. */
const PATH_KEEPING_OPS: ReadonlySet<Op['op']> = new Set(['setScalar', 'setStrings', 'removeKey']);

/** Whether a committed change leaves every item at the path it had, so memory
 * keyed by path still names the same item. An undo or redo carries no ops (it
 * restores a snapshot, which may undo a move), so it never does. */
export function keepsItemPaths(change: EditorChange): boolean {
  return change.ops.length > 0 && change.ops.every((op) => PATH_KEEPING_OPS.has(op.op));
}

/** The mode the select shows — the same `hasData` the arms branch on, so a
 * document carrying both keys reads as bound, which is what the panel edits. */
export function imageSourceMode(view: Pick<ItemView, 'hasData'>): ImageSourceMode {
  return view.hasData ? 'data' : 'fixed';
}

/** Fixed → bound: drop `src` (only when the key is there — removing an absent
 * key is refused) and write the binding's REQUIRED key first, then its scope. */
export function imageToDataOps(
  path: string,
  view: Pick<ItemView, 'hasSrc'>,
  binding: DroppedBinding | null,
): Op[] {
  const ops: Op[] = view.hasSrc ? [{ op: 'removeKey', path, keys: ['src'] }] : [];
  ops.push({ op: 'setScalar', path, keys: ['data', 'key'], value: binding?.key ?? '' });
  if (binding !== null && binding.scope !== '') {
    ops.push({ op: 'setScalar', path, keys: ['data', 'scope'], value: binding.scope });
  }
  return ops;
}

/** Bound → fixed with a source in hand (a picked file or a remembered `src`). */
export function imageToFixedOps(path: string, src: string): Op[] {
  return [
    { op: 'removeKey', path, keys: ['data'] },
    { op: 'setScalar', path, keys: ['src'], value: src },
  ];
}

/** Plan the switch of the image at `path` to `target`, which differs from the
 * current mode (a select fires no change for the value it already shows).
 * `memory` from another path is ignored. */
export function planImageSwitch(
  path: string,
  view: SourceView,
  target: ImageSourceMode,
  memory: ImageMemory | null,
): ImageSwitchPlan {
  const own = memory?.path === path ? memory : { path };
  if (target === 'data') {
    const kept: ImageMemory = view.src === '' ? own : { ...own, src: view.src };
    return { kind: 'ops', ops: imageToDataOps(path, view, own.binding ?? null), memory: kept };
  }
  const kept: ImageMemory =
    view.dataKey === '' ? own : { ...own, binding: { key: view.dataKey, scope: view.dataScope } };
  if (view.hasSrc) {
    // Both keys present: the `src` is already there, so keeping it is all.
    return { kind: 'ops', ops: [{ op: 'removeKey', path, keys: ['data'] }], memory: kept };
  }
  return own.src === undefined
    ? { kind: 'pick', memory: kept }
    : { kind: 'restore', src: own.src, memory: kept };
}
