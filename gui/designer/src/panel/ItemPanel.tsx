// The per-item editor, split into content / decoration / placement tabs. PropertyPanel routes a
// real item here; this file owns the tabbed layout only — each tab's body is a
// section module beside it (`ContentSection` / `StyleSection` / `BoxSection`),
// and the prop contract they all take is `itemPanelProps.ts`. Every edit is the
// same one-op dispatch the flat panel used (AI parity — no new document
// mutation, no GUI-only state in the file; the active tab is Designer-local UI
// state like zoom/grid-step).
//
// Only the tabs that APPLY to the item render (a rect has no content tab, a table no
// decoration tab), fixed content→decoration→placement order; a lone tab (box-only items) drops the tablist
// chrome. Headless UI `Tab` is used locally — the Sidebar precedent — not a
// catalog primitive (that extraction is still pending).

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { anchorTargets, readItemId } from './anchorTargets';
import { BoxSection } from './BoxSection';
import { BORDERABLE_TYPES } from './borderTypes';
import { ContentSection } from './ContentSection';
import type { ItemPanelProps } from './itemPanelProps';
import { hasCapability } from './itemPanelProps';
import { type ItemView, MARK_TYPES, NO_BOX_WIRE_TYPES } from './itemView';
import { LinePointsEditor } from './LinePointsEditor';
import { LinkField } from './LinkField';
import { readLinePoints } from './linePoints';
import { bindingScopeFor, pickerOptions, scopeAuthorable } from './pickerModel';
import { StyleSection } from './StyleSection';
import { VisibilitySection } from './VisibilitySection';

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
  'repeat_flow',
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

/** Types whose placement tab is NOT the box fields. A `line` has a position
 * (its two endpoints) but no `box:` — the engine rejects that key as a parse
 * error — so its placement tab carries the points editor instead. */
const POINT_PLACED_TYPES: ReadonlySet<string> = new Set(['line']);

/** The one tab-less type whose empty panel is the WHOLE item rather than a
 * missing surface, so it is the one that gets a saying-what-it-is note. */
const PAGE_BREAK_TYPE = 'page_break';

/** Which note a page break earns, or `null` for anything else.
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
function pageBreakNoteKey(type: string, path: string): string | null {
  if (type !== PAGE_BREAK_TYPE) {
    return null;
  }
  return /\[0\]$/.test(path) ? 'panel.pageBreak.noteFirst' : 'panel.pageBreak.note';
}

/** The tabs that apply to an item, in fixed content→decoration→placement
 * order. A type gets the placement tab when it has a position the panel can
 * author — a box, or (for `line`) endpoints. Two types end up with NO tab at
 * all: `page_break`, which takes only `id` and `visible:` on the wire, and
 * `repeat`, which takes a great deal more but has no surface for any of it —
 * see the empty-panel branch below for what each is told.
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
  if (!NO_BOX_WIRE_TYPES.has(view.type) || POINT_PLACED_TYPES.has(view.type)) {
    tabs.push('box');
  }
  return tabs;
}

const TAB_LABEL_KEYS: Readonly<Record<PanelTab, string>> = {
  content: 'panel.tab.content',
  style: 'panel.tab.style',
  box: 'panel.tab.box',
};

export function ItemPanel(props: ItemPanelProps) {
  const { t } = useI18n();
  const { view } = props;
  const tabs = applicableTabs(view);
  // Controlled active tab (clamped) so an edit's re-render keeps the tab, while
  // a selection change to a shape with a different tab set clamps to the first
  // — the Sidebar pattern.
  const [active, setActive] = useState<PanelTab>('content');
  const index = tabs.indexOf(active);
  const selected = index === -1 ? 0 : index;

  const panelFor = (tab: PanelTab) =>
    tab === 'content' ? (
      // A SIBLING of the content section, not a field inside it: that section
      // routes by early return (`image` never reaches its bottom), so a field
      // added there would appear for `text` and silently not for `image` —
      // which is the other of the two types the wire gives a `link:`.
      <>
        <ContentSection {...props} />
        <LinkField {...props} />
      </>
    ) : tab === 'style' ? (
      <StyleSection {...props} />
    ) : POINT_PLACED_TYPES.has(view.type) ? (
      <LinePointsEditor
        view={readLinePoints(props.controller.read, props.path)}
        path={props.path}
        controller={props.controller}
        capabilities={props.capabilities}
        targets={anchorTargets(
          props.geometry?.boxes.pages,
          readItemId(props.controller.read, props.path),
        )}
      />
    ) : (
      <BoxSection {...props} />
    );

  // `visible:` applies to EVERY item type and is none of the three tab
  // concerns — it decides whether the item is there at all — so it sits outside
  // the tablist rather than inside a tab, and BELOW it: it is the rare, advanced
  // case, and it used to own the top of the panel ahead of the controls anyone
  // opens the panel for (see `VisibilitySection`'s own header). Gated on the
  // engine capability: an older engine parse-REJECTS the key, so the control
  // must not be offered hopefully.
  //
  // The picker follows the item's OWN data scope, derived from its path like
  // every other row-scoped surface: inside a `repeat` cell the fields offered
  // are the bound element's, with the top-level ones as a labeled second
  // section that writes `scope: document` when picked. Offering document
  // fields at element scope would author a key that resolves to nothing —
  // the item then vanishes silently, or reports an undeclared key.
  const enclosing = bindingScopeFor(props.controller.read, props.path);
  const documentFields = pickerOptions(props.paletteGroups, null, props.params);
  const scopeArmed = enclosing !== null && scopeAuthorable(props.capabilities);
  const visibility = hasCapability(props.capabilities, 'item.visible') ? (
    <VisibilitySection
      path={props.path}
      controller={props.controller}
      options={
        enclosing === null
          ? documentFields
          : scopeArmed
            ? pickerOptions(props.paletteGroups, enclosing, props.params)
            : // No `scope:` to author, so both scopes go in one flat list
              // rather than offering a section that cannot be committed.
              [...pickerOptions(props.paletteGroups, enclosing, props.params), ...documentFields]
      }
      documentOptions={scopeArmed ? documentFields : undefined}
      itemType={view.type}
    />
  ) : null;

  // A type with no applicable TAB still has the presence binding to edit. For
  // `page_break` that is the WHOLE item — nothing but `id` and `visible:` on
  // the wire — and a conditional page break is exactly what the key is for.
  // For `repeat` it is not: the wire gives it a data source, a cell
  // sub-template and a grid, and none of them has a panel surface yet. It
  // lands here because a placement tab over a boxless struct authored a parse
  // error, so an empty panel is the lesser wrong until that surface is built.
  // Only when there is nothing at all — an engine without `item.visible` —
  // does the panel say so in words.
  if (tabs.length === 0) {
    const noteKey = pageBreakNoteKey(view.type, props.path);
    return (
      <div className="p-3">
        {/* A page break DRAWS nothing, so the canvas answers the insert only by
         * gaining a page — a change a first-time reader misses, leaving them on
         * a panel that says nothing about what they just made. One line saying
         * what the item DOES is the whole affordance it needs, and when the
         * break is a no-op that line says THAT instead. Only `page_break` gets
         * one: it is the one tab-less type whose empty panel is COMPLETE. */}
        {noteKey === null ? null : <p className="m-0 mb-3 text-muted text-sm">{t(noteKey)}</p>}
        {visibility}
        {visibility === null ? (
          <p className="m-0 text-muted text-sm">{t('panel.noEditable')}</p>
        ) : null}
      </div>
    );
  }
  // A single-tab item (a `line`'s stroke, and other one-surface types) skips
  // the tablist chrome — a lone tab is noise.
  if (tabs.length === 1) {
    return (
      <div className="p-3">
        {panelFor(tabs[0])}
        {visibility}
      </div>
    );
  }

  return (
    <TabGroup selectedIndex={selected} onChange={(next) => setActive(tabs[next])}>
      <TabList className="flex gap-1 border-b border-border px-3 pt-2">
        {tabs.map((tab) => (
          <Tab
            key={tab}
            className="cursor-pointer whitespace-nowrap rounded-t-sj border border-b-0 border-transparent bg-transparent px-2 py-1 text-sm text-muted data-selected:-mb-px data-selected:border-border data-selected:bg-bg data-selected:text-text"
          >
            {t(TAB_LABEL_KEYS[tab])}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {tabs.map((tab) => (
          <TabPanel key={tab} className="p-3">
            {panelFor(tab)}
          </TabPanel>
        ))}
      </TabPanels>
      {/* Below the tab BODIES, not inside one: the key applies to every type,
        so it must not appear and disappear as the reader changes tab. */}
      {visibility === null ? null : <div className="px-3 pb-3">{visibility}</div>}
    </TabGroup>
  );
}
