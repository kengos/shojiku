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
import type { ItemView } from './itemView';
import { StyleSection } from './StyleSection';

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

/** The tabs that apply to an item, in fixed content→decoration→placement order. `box` is always
 * present (every placed item has a box), so the result is never empty. */
export function applicableTabs(view: ItemView): PanelTab[] {
  const tabs: PanelTab[] = [];
  if (CONTENT_TAB_TYPES.has(view.type)) {
    tabs.push('content');
  }
  if (STYLED_TYPES.has(view.type)) {
    tabs.push('style');
  }
  tabs.push('box');
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
    ) : (
      <BoxSection {...props} />
    );

  // A single-tab item (box-only: line, and other pure-geometry items) skips the
  // tablist chrome — a lone tab is noise.
  if (tabs.length === 1) {
    return <div className="p-3">{panelFor(tabs[0])}</div>;
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
    </TabGroup>
  );
}
