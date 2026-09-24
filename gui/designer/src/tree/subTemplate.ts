// A path's relation to a repeating SUB-TEMPLATE: the three `ContainerItem`
// slots the wire has — a `repeat`'s `cell:`, a `repeat_flow`'s `item:` and a
// `table` column's `columns[].cell:`. One authored node laid out once per data
// element, so a single box cannot be moved, positioned or dropped into: an
// edit would reach every instance.
//
// TWO questions, and the difference is the slot's OWN path — for a `repeat`
// and a `repeat_flow`. A table column is the exception: `\.columns\[` matches a
// PREFIX of the path and needs no trailing separator, so a column node and its
// `cell:` frame answer yes to both questions. They are told apart here by NAME
// because the canvas, the panel and the insert side all ask one of them, and
// telling them apart by whether the caller remembered to append a separator is
// how one concept ended up written three ways.
//
// The pattern matches a path's SPELLING, not a node's kind, and that is sound
// only because nothing else the Designer addresses by path is spelled `cell`,
// `item` or `columns[n]`. Two wire keys would match if they were ever reached —
// a `line` endpoint's `item:` anchor target and a grid `box.columns` track list
// — and neither is: the Designer's structural paths stop at an item and never
// descend into `box:` or a point spec (`panel/linePoints.ts` addresses those
// through an op's `keys` array). `palette/cellTarget.ts` shows the segment-walk
// form that would be exact, and asks a different question with it.

const SUB_TEMPLATE_RE = /\.columns\[|\.cell\.|\.item\./;

/** The item at `path` REPEATS: the path runs through a sub-template slot
 * (`…cell.items[0]`, `…item.items[2]`) or is a table column, whose own node is
 * per-element too. A `repeat`'s or a `repeat_flow`'s FRAME — a path ENDING at
 * `.cell` / `.item` — is not this: it holds the authored node rather than being
 * one. A table column's frame (`…columns[1].cell`) IS, because everything under
 * `columns[` already matched. */
export function insideSubTemplate(path: string): boolean {
  return SUB_TEMPLATE_RE.test(path);
}

/** `insideSubTemplate`, plus a `repeat`'s or a `repeat_flow`'s frame. Appending
 * the separator is the whole widening: the pattern's own trailing dot then has
 * something to match at the end of `…items[0].cell`.
 *
 * This is the question to ask wherever the FRAME must answer the same as its
 * inside — it is drawn once per data element like everything under it. That is
 * every OWNER question (may it receive a drop, is it an insert target, may the
 * item at it be dragged out) AND the SELECTION question `canvas/manipulate`
 * asks, which is the one site where the widening is observable: without it a
 * frame classified as a section, and the chip said so over a panel that had
 * nothing to offer. */
export function isOrInsideSubTemplate(path: string): boolean {
  return SUB_TEMPLATE_RE.test(`${path}.`);
}
