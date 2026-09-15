// Which surfaces the per-item panel offers a type: the tab set, and what the
// placement tab carries for types that have no box. The property panel's
// type→surface routing table, kept apart from `ItemPanel.tsx` (which renders
// it) so the table reads — and is tested — without rendering anything.
// Framework-free; every lookup is a real `Set`/`Map`, so a document's type name
// never walks a prototype.

import { BORDERABLE_TYPES } from './borderTypes';
import { type ItemView, MARK_TYPES, NO_BOX_WIRE_TYPES } from './itemView';

export type PanelTab = 'content' | 'style' | 'box';

/** Item types that have a content tab. `rect`/`line` and other pure-chrome
 * items have none; `qr_code` edits content like a text item (engine reference). */
const CONTENT_TAB_TYPES = new Set([
  'text',
  'qr_code',
  // Its content is a text item's (static text with `{key}`, or one bound
  // value) — and without this it had NO content surface at all, so a preset's
  // manuscript paper could not be rebound or retyped anywhere in the Designer.
  // It stays OUT of `STYLED_TYPES`: a char_grid's `borderWidth` is the GRID
  // RULING width, not a border box, so the border cluster's per-side model
  // would author a different property under the same spelling.
  'char_grid',
  'table',
  // The three non-table iterables share one content surface: the array they
  // repeat over (`IterableSourceSection`).
  'repeat_flow',
  'repeat',
  'list',
  'image',
  'page_number',
  // The two form marks. Their content is their PRESENCE — whether the oval or
  // the tick draws at all — which is the engine's own word for it ("a mark's
  // *presence* is content"), and without this an inserted mark could be moved
  // and painted but never bound to the data that decides it.
  ...MARK_TYPES,
]);

/** Types that get a decoration tab: every boxed item the border cluster decorates,
 * PLUS the three whose stroke is their own shape rather than a border box —
 * `line` and the two form marks. All three are still decoration the user must
 * be able to reach (the insert menu creates all of them, and an insertable kind
 * with no editing surface is a dead end). */
const STYLED_TYPES: ReadonlySet<string> = new Set([
  ...BORDERABLE_TYPES,
  'line',
  // ...and the form marks, whose outline is one closed path rather than a
  // border box. They reach `ShapeStyleEditor` instead of the border cluster —
  // see `MARK_TYPES` for why that distinction is the engine's, not the panel's.
  ...MARK_TYPES,
]);

/** What a placement tab carries: the box fields, or a type's own editor. */
export type PlacementBody = 'box' | 'points' | 'repeatGrid';

/** Types whose placement tab is NOT the box fields, and what it carries instead.
 * Both take no `box:` — the engine rejects the key on either as a parse error —
 * yet both have a position worth editing. A `line`'s is its two endpoints. A
 * `repeat`'s is its grid: how many cells each sheet holds, their gaps and fill
 * order, where the grid starts and whether it is marked for cutting — the
 * `char_grid` precedent, whose grid geometry likewise lives where an author goes
 * to make a thing bigger. */
const OWN_PLACEMENT: ReadonlyMap<string, PlacementBody> = new Map([
  ['line', 'points'],
  ['repeat', 'repeatGrid'],
]);

/** The placement tab's body for a type. */
export function placementBody(type: string): PlacementBody {
  return OWN_PLACEMENT.get(type) ?? 'box';
}

/** The note a TAB-LESS item's panel opens with.
 *
 * Of the wire's item types exactly one gets no tab: `page_break` (its suite
 * walks every type to keep that true). Its empty panel is the WHOLE item rather
 * than a missing surface, so the note says what the item does.
 *
 * A break at the top of an untouched page is a NO-OP — the engine collapses it
 * (`flow.rs`: `if !layouter.fresh_page`), so consecutive breaks never generate
 * a blank page. On a blank document, then, the first thing Insert ▸ Page break
 * produces is nothing at all, and a panel promising "everything after this
 * starts on a new page" would be answering a question the reader is not
 * asking with a claim the document does not honour.
 *
 * Index 0 is the case the panel can actually SEE. It is sufficient, not
 * necessary — a predecessor that exactly fills the page leaves the break
 * redundant too — but that one still ends with the following content on a
 * fresh page, so the general note stays true there. */
export function tabLessNoteKey(path: string): string {
  return /\[0\]$/.test(path) ? 'panel.pageBreak.noteFirst' : 'panel.pageBreak.note';
}

/** The tabs that apply to an item, in fixed content→decoration→placement
 * order. A type gets the placement tab when it has a position the panel can
 * author — a box, or its own placement editor (`OWN_PLACEMENT`). One type ends
 * up with NO tab at all: `page_break`, which takes only `id` and `visible:` on
 * the wire.
 *
 * The gate is `NO_BOX_WIRE_TYPES`, not the narrower canvas set: a placement tab
 * over a type the wire gives no `box:` authors a key that stops the document
 * parsing, which is a worse offer than no tab. */
export function applicableTabs(view: ItemView): PanelTab[] {
  const tabs: PanelTab[] = [];
  if (CONTENT_TAB_TYPES.has(view.type)) {
    tabs.push('content');
  }
  if (STYLED_TYPES.has(view.type)) {
    tabs.push('style');
  }
  if (!NO_BOX_WIRE_TYPES.has(view.type) || OWN_PLACEMENT.has(view.type)) {
    tabs.push('box');
  }
  return tabs;
}
