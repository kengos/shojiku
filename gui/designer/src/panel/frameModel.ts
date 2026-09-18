// What a selected sub-template FRAME is. A `repeat`'s `cell:`, a `repeat_flow`'s
// `item:` and a table column's `cell:` are containers with no `type:` of their
// own: the canvas already selects them (the box index names `…items[0].cell`,
// `…items[0].item`, `…columns[0].cell`), so the panel needs to know which of the
// three it was handed — and to refuse anything else that merely ends in the same
// word, since the router must not offer a frame editor over a node the engine
// reads as something different.
//
// The owner is read to check its TYPE, not trusted from the spelling: a `cell:`
// key under a plain container is not a repeat cell. Hostile shapes and a
// throwing read answer `null` (the unsupported card).

import { formatPath, parsePath } from '@shojiku/designer-core';

type ReadFn = (path: string) => unknown;

/** Which sub-template a frame belongs to. */
export type FrameKind = 'cell' | 'card' | 'columnCell';

export interface Frame {
  readonly kind: FrameKind;
  /** The item (or column) that owns the frame — the jump back out. */
  readonly ownerPath: string;
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The kind a frame key names under an owner of this shape, or `null`. A column
 * has no `type`, so for a column cell the TABLE's type is the one checked. */
function kindFor(
  key: string,
  owner: Record<string, unknown>,
  isColumn: boolean,
  table: unknown,
): FrameKind | null {
  if (isColumn) {
    return key === 'cell' && isMap(table) && table.type === 'table' ? 'columnCell' : null;
  }
  if (key === 'cell' && owner.type === 'repeat') {
    return 'cell';
  }
  return key === 'item' && owner.type === 'repeat_flow' ? 'card' : null;
}

/** The frame at `path`, or `null` when `path` is not one of the three. */
export function frameOf(read: ReadFn, path: string): Frame | null {
  let segments: ReturnType<typeof parsePath>;
  try {
    segments = parsePath(path);
  } catch {
    return null;
  }
  // `x[0].cell` is the shortest frame: a list key, an index, the frame key.
  if (segments.length < 3) {
    return null;
  }
  const last = segments[segments.length - 1];
  const index = segments[segments.length - 2];
  const list = segments[segments.length - 3];
  if (last.kind !== 'key' || index.kind !== 'index') {
    return null;
  }
  const ownerPath = formatPath(segments.slice(0, -1));
  try {
    const owner = read(ownerPath);
    if (!isMap(owner) || !isMap(read(path))) {
      return null;
    }
    const isColumn = list.kind === 'key' && list.key === 'columns';
    // `…items[k].columns[n].cell`: the table is the column list's owner.
    const table = isColumn ? read(formatPath(segments.slice(0, -3))) : undefined;
    const kind = kindFor(last.key, owner, isColumn, table);
    return kind === null ? null : { kind, ownerPath };
  } catch {
    return null;
  }
}
