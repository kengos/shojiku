// The flowing body as the 本文 form edits it: whether it flows or places its
// items by coordinates, and the two batches that switch between them. The wire
// (docs/engine/template.md, flow.md): `sections.body` is `type: flow` — items
// stacked down the page and paginated, with an optional `gap` and `box` (the
// region, relative to the margin box) — or `type: absolute` — items at their
// own `box.x`/`box.y` on the first page only, and NO other key (the engine
// refuses `gap`/`box` there: both Body structs deny unknown fields).
//
// Each switch keeps what the page looks like as far as the target can. This
// file is the switch to fixed position (the way back is `bodyFlow.ts`): every
// boxed child pinned where the last fresh preview drew it on page 1 (border
// rect − the margin origin − the child's own margin, the pin math the
// placement tab uses), every unanchored line rebased by its endpoints
// (`bodyLines`). An absolute body draws EVERY item on its one page, so what
// the flow had pushed to later pages is DELETED rather than left to land on
// top of page 1. Everything else that changes is COUNTED for the confirm:
// children that continue past page 1 (cut there), children the preview did
// not draw (hidden under the sample data — kept, at the top of page 1 when
// shown), the flow-only kinds (`repeat`, `repeat_flow`, `page_break`) the
// engine skips, and the tables whose pagination settings it removes (they act
// only in a flowing body). Without fresh geometry there is nothing honest to
// pin from, so the switch is refused.

import { MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import type { PlacedBox } from '../engine/types';
import { lineAnchored, linePinOps } from './bodyLines';
import { NO_BOX_WIRE_TYPES } from './itemView';
import { childMarginInset, type PlacementGeometry } from './placementGeometry';
import { readItem } from './placementModel';

export const BODY_PATH = 'sections.body';
export const ITEMS = `${BODY_PATH}.items`;

/** A table's pagination keys — they act only on a table directly in a flowing
 * body (`table_pagination_key_ignored` anywhere else), so a switch to fixed
 * positions removes them rather than leaving warnings behind. */
export const TABLE_PAGINATION_KEYS = ['repeatHeader', 'autoPageBreak', 'keepTogether'] as const;

/** The item kinds only a flowing body lays out. */
export const FLOW_ONLY_TYPES: ReadonlySet<string> = new Set([
  'repeat',
  'repeat_flow',
  'page_break',
]);

export type BodyMode = 'flow' | 'absolute';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The body's mode, `null` for anything else (hostile — no switch offered). */
export function bodyMode(read: ReadFn): BodyMode | null {
  const type = readItem(read, BODY_PATH)?.type;
  return type === 'flow' || type === 'absolute' ? type : null;
}

/** The body's children; only called once `bodyMode` has read the body. */
export function children(read: ReadFn): unknown[] {
  const items = (readItem(read, BODY_PATH) as Record<string, unknown>).items;
  return Array.isArray(items) ? items : [];
}

/** Where the preview drew `path`: its first placement, the page that is on,
 * and whether it continues onto a later page (a table, a split text); `null`
 * when it is on no page (hidden or collapsed under the sample data). */
function placement(
  geometry: PlacementGeometry,
  path: string,
): { box: PlacedBox; page: number; continues: boolean } | null {
  const pages = geometry.boxes.pages.map((boxes) => boxes.find((b) => b.path === path));
  const page = pages.findIndex((box) => box !== undefined);
  if (page < 0) {
    return null;
  }
  const continues = pages.some((box, index) => index > page && box !== undefined);
  return { box: pages[page] as PlacedBox, page, continues };
}

/** What a switch to absolute changes beyond the pins, for the confirm. */
export interface AbsoluteLoss {
  /** Children drawn only after page 1 — DELETED: an absolute body draws every
   * item on its one page, so they would land on top of page 1. */
  readonly pastFirstPage: number;
  /** Children the preview did not draw (hidden under the sample data) or a
   * line whose endpoints cannot be rebased — kept, at the top of page 1. */
  readonly unplaced: number;
  /** Children that start on page 1 and continue after it — cut at page 1. */
  readonly continued: number;
  /** `repeat` / `repeat_flow` / `page_break` — skipped in an absolute body. */
  readonly flowOnly: number;
  /** Tables whose pagination settings the switch removes. */
  readonly tablePaging: number;
}

export type AbsolutePlan = { readonly ops: Op[]; readonly loss: AbsoluteLoss };

/** The flow → absolute batch and what it changes; `null` when there is no
 * fresh geometry or the body is not a flow, `'tooMany'` past the op cap. */
export function toAbsoluteOps(
  read: ReadFn,
  geometry: PlacementGeometry | null,
): AbsolutePlan | 'tooMany' | null {
  if (geometry === null || !geometry.fresh || bodyMode(read) !== 'flow') {
    return null;
  }
  // `bodyMode` just read it as a flow body, so the map is there.
  const body = readItem(read, BODY_PATH) as Record<string, unknown>;
  const ops: Op[] = [];
  for (const key of ['gap', 'box']) {
    if (body[key] !== undefined) {
      ops.push({ op: 'removeKey', path: BODY_PATH, keys: [key] });
    }
  }
  ops.push({ op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'absolute' });
  const loss = { pastFirstPage: 0, unplaced: 0, continued: 0, flowOnly: 0, tablePaging: 0 };
  const removed: number[] = [];
  const [top, , , left] = geometry.margin;
  children(read).forEach((child, index) => {
    const node = record(child);
    const type = String(node?.type);
    if (FLOW_ONLY_TYPES.has(type)) {
      loss.flowOnly += 1;
      return;
    }
    const line = type === 'line';
    if (
      node === undefined ||
      (NO_BOX_WIRE_TYPES.has(type) && !line) ||
      (line && lineAnchored(node))
    ) {
      return;
    }
    const path = `${ITEMS}[${index}]`;
    const placed = placement(geometry, path);
    if (placed === null) {
      loss.unplaced += 1;
      return;
    }
    if (placed.page > 0) {
      loss.pastFirstPage += 1;
      removed.push(index);
      return;
    }
    loss.continued += placed.continues ? 1 : 0;
    const paging = TABLE_PAGINATION_KEYS.filter((key) => node[key] !== undefined);
    if (type === 'table' && paging.length > 0) {
      loss.tablePaging += 1;
      ops.push(...paging.map((key): Op => ({ op: 'removeKey', path, keys: [key] })));
    }
    if (line) {
      const ends = linePinOps(node, path, placed.box, top, left);
      loss.unplaced += ends === null ? 1 : 0;
      ops.push(...(ends ?? []));
      return;
    }
    const inset = childMarginInset(read, path) ?? { left: 0, top: 0 };
    const x = Math.round((placed.box.border.x - left - inset.left) * 100) / 100;
    const y = Math.round((placed.box.border.y - top - inset.top) * 100) / 100;
    ops.push({ op: 'setScalar', path, keys: ['box', 'x'], value: x });
    ops.push({ op: 'setScalar', path, keys: ['box', 'y'], value: y });
  });
  // Last, and from the end, so every path above still names its child.
  for (const index of removed.reverse()) {
    ops.push({ op: 'removeItem', path: ITEMS, index });
  }
  return ops.length > MAX_BATCH_OPS ? 'tooMany' : { ops, loss };
}
