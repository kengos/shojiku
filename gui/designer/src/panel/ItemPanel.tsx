// The per-item editor, split into content / decoration / placement tabs. PropertyPanel routes a
// real item here; this file owns the tabbed layout only — each tab's body is a
// section module beside it (`ContentSection` / `StyleSection` / `BoxSection`, or
// a type's own placement editor), the prop contract they all take is
// `itemPanelProps.ts`, and which tabs a type gets is `panelTabs.ts`. Every edit is the
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
import { ContentSection } from './ContentSection';
import type { ItemPanelProps } from './itemPanelProps';
import { hasCapability } from './itemPanelProps';
import { LinePointsEditor } from './LinePointsEditor';
import { LinkField } from './LinkField';
import { readLinePoints } from './linePoints';
import { applicableTabs, type PanelTab, placementBody, tabLessNoteKey } from './panelTabs';
import { bindingScopeFor, pickerOptions, scopeAuthorable } from './pickerModel';
import { RepeatSection } from './RepeatSection';
import { StyleSection } from './StyleSection';
import { VisibilitySection } from './VisibilitySection';

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
    ) : placementBody(view.type) === 'repeatGrid' ? (
      <RepeatSection {...props} />
    ) : placementBody(view.type) === 'points' ? (
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
  // Only when there is nothing at all — an engine without `item.visible` —
  // does the panel say so in words.
  if (tabs.length === 0) {
    return (
      <div className="p-3">
        {/* A page break DRAWS nothing, so the canvas answers the insert only by
         * gaining a page — a change a first-time reader misses, leaving them on
         * a panel that says nothing about what they just made. One line saying
         * what the item DOES is the whole affordance it needs, and when the
         * break is a no-op that line says THAT instead. It is the only type
         * that reaches this branch (`tabLessNoteKey`). */}
        <p className="m-0 mb-3 text-muted text-sm">{t(tabLessNoteKey(props.path))}</p>
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
