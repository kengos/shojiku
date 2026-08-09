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
import { BoxSection } from './BoxSection';
import { BORDERABLE_TYPES } from './borderTypes';
import { ContentSection } from './ContentSection';
import type { ItemPanelProps } from './itemPanelProps';
import { hasCapability } from './itemPanelProps';
import { BOXLESS_TYPES, type ItemView } from './itemView';
import { LinePointsEditor } from './LinePointsEditor';
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
  'table',
  'repeat_flow',
  'list',
  'image',
  'page_number',
]);

/** Types that get a decoration tab: every boxed item the border cluster decorates,
 * PLUS `line` — its stroke is its own shape rather than a border box, but it
 * is still decoration the user must be able to reach (the insert menu creates
 * dashed lines, and an insertable kind with no editing surface is a dead
 * end). */
const STYLED_TYPES: ReadonlySet<string> = new Set([...BORDERABLE_TYPES, 'line']);

/** Types whose placement tab is NOT the box fields. A `line` has a position
 * (its two endpoints) but no `box:` — the engine rejects that key as a parse
 * error — so its placement tab carries the points editor instead. */
const POINT_PLACED_TYPES: ReadonlySet<string> = new Set(['line']);

/** The tabs that apply to an item, in fixed content→decoration→placement
 * order. A type gets the placement tab when it has a position the panel can
 * author — a box, or (for `line`) endpoints. `page_break` has neither and
 * ends up with NO tabs at all (it takes only `id`); the panel renders a
 * placeholder for that. */
export function applicableTabs(view: ItemView): PanelTab[] {
  const tabs: PanelTab[] = [];
  if (CONTENT_TAB_TYPES.has(view.type)) {
    tabs.push('content');
  }
  if (STYLED_TYPES.has(view.type)) {
    tabs.push('style');
  }
  if (!BOXLESS_TYPES.has(view.type) || POINT_PLACED_TYPES.has(view.type)) {
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
      <ContentSection {...props} />
    ) : tab === 'style' ? (
      <StyleSection {...props} />
    ) : POINT_PLACED_TYPES.has(view.type) ? (
      <LinePointsEditor
        view={readLinePoints(props.controller.read, props.path)}
        path={props.path}
        controller={props.controller}
      />
    ) : (
      <BoxSection {...props} />
    );

  // `visible:` applies to EVERY item type and is none of the three tab
  // concerns — it decides whether the item is there at all — so it sits above
  // the tablist rather than inside a tab. Gated on the engine capability: an
  // older engine parse-REJECTS the key, so the control must not be offered
  // hopefully.
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

  // A type with no applicable TAB (`page_break` — nothing but `id` and
  // `visible:` on the wire) still has the presence binding to edit, which is
  // exactly what a conditional page break is. Only when there is nothing at
  // all does the panel say so.
  if (tabs.length === 0) {
    return (
      <div className="p-3">
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
        {visibility}
        {panelFor(tabs[0])}
      </div>
    );
  }

  return (
    <TabGroup selectedIndex={selected} onChange={(next) => setActive(tabs[next])}>
      {visibility === null ? null : <div className="px-3 pt-3">{visibility}</div>}
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
    </TabGroup>
  );
}
