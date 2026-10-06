// Which children of a container the engine actually LAYS OUT by flex or grid, and
// what width each would ask of a grid column. Everything the layout controls do
// to "the children" — the ratio inputs, the split-by-ratio toggle, the columns a
// switch to a grid creates — is about these children only. The rest take no part:
// a child with `box.x`/`box.y` is placed absolutely, and a `line`, `page_number`,
// `page_break`, `repeat` or `repeat_flow` is never a flex item at all — several
// of them have no `box` on the wire, so writing a flex key onto one is a
// whole-document parse error, not a no-op.
//
// Both sets mirror the engine and are pinned to its source by
// `layoutWire.test.ts`: `FLEX_ITEM_TYPES` is `FlexKind::of`
// (engine/layout/src/engine/flex/kind.rs), `UNMEASURED_TYPES` the kinds
// `max_content_width` answers `None` for (engine/layout/src/engine/intrinsic.rs).

/** The item types the engine lays out as flex/grid children (when they author
 * neither `box.x` nor `box.y`). */
export const FLEX_ITEM_TYPES: ReadonlySet<string> = new Set([
  'text',
  'rect',
  'image',
  'container',
  'qr_code',
  'list',
  'char_grid',
  'table',
  'ellipse',
  'checkbox',
]);

/** The flex item types with no content width the engine can measure: in a row
 * an unset grow weight is 1 for these (0 for the rest), so as a grid column each
 * takes a share rather than its content's width. */
export const UNMEASURED_TYPES: ReadonlySet<string> = new Set([
  'rect',
  'ellipse',
  'image',
  'qr_code',
  'list',
  'char_grid',
  'table',
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The child's `box` map (`{}` when absent or not a map). */
export function boxOf(child: unknown): Readonly<Record<string, unknown>> {
  return record(record(child)?.box) ?? {};
}

/** The engine lays this child out by flex/grid: a flex item type, no x/y. */
export function isFlexItem(child: unknown): boolean {
  const type = record(child)?.type;
  if (typeof type !== 'string' || !FLEX_ITEM_TYPES.has(type)) {
    return false;
  }
  const box = boxOf(child);
  return box.x === undefined && box.y === undefined;
}

/** A flex item whose width the engine cannot measure from its content: an
 * unmeasured type, or rich `spans` text (vertical writing also cannot be, but
 * it may be inherited, so the document alone cannot tell). */
function unmeasured(child: unknown): boolean {
  const node = record(child);
  return UNMEASURED_TYPES.has(String(node?.type)) || node?.spans !== undefined;
}

/** The grid column a flex item becomes when its row turns into a grid, so the
 * row keeps its look: its own width; its grow weight as an `fr` share; a share
 * of 1 for content the engine cannot measure (it grew by default in the row);
 * otherwise `auto` — its content's width, which is where an unweighted row
 * child starts. */
export function trackFor(child: unknown): string | number {
  const box = boxOf(child);
  if (typeof box.w === 'number' || typeof box.w === 'string') {
    return box.w;
  }
  const grow = box.flexGrow;
  if (typeof grow === 'number' && Number.isFinite(grow) && grow > 0) {
    return `${grow}fr`;
  }
  return grow === undefined && unmeasured(child) ? '1fr' : 'auto';
}
