// The tabbed sidebar frame (the layer tree and the field palette today; the
// sample-data panel joins as a tab later), ported onto Headless UI's Tabs —
// the library owns the tablist semantics (roving tabindex, arrow-key cycling,
// tab↔panel ARIA wiring); the LOOK is plain Tailwind utilities over the
// `--sj-*` tokens. The frame owns only WHICH tab is active (id-based, so a
// tab set change — definitions arriving/leaving — clamps a stranded active id
// to the first tab); tab content is composed by the caller.

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { type ReactNode, useState } from 'react';
import { TOUR_ANCHORS } from '../tutorial/anchors';

export interface SidebarTab {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
}

export interface SidebarProps {
  /** Tabs in display order (non-empty). */
  readonly tabs: readonly SidebarTab[];
  /** Optional control rendered at the RIGHT of the tab row (the collapse
   * toggle, gdoc-style). Caller-composed, so it stays out of the tablist
   * semantics; absent leaves the row exactly as before. */
  readonly trailing?: ReactNode;
  /** Notified with the newly active tab id. The Designer forwards it to the
   * tutorial, whose steps wait on a reader opening a specific tab. */
  readonly onTabChange?: (id: string) => void;
}

const FRAME = 'sj-sidebar flex min-h-0 min-w-0 flex-1 flex-col border-r border-border bg-chrome';

export function Sidebar({ tabs, trailing, onTabChange }: SidebarProps) {
  const [active, setActive] = useState(tabs[0]?.id);
  const activate = (id: string) => {
    setActive(id);
    onTabChange?.(id);
  };
  const index = tabs.findIndex((tab) => tab.id === active);
  const selected = index === -1 ? 0 : index;

  if (tabs.length === 0) {
    return <div className={FRAME} />;
  }
  return (
    <TabGroup
      className={FRAME}
      selectedIndex={selected}
      onChange={(next) => activate(tabs[next].id)}
    >
      {/* The tab row: tabs on the left (flex-wrap so a narrowed pane wraps
          whole labels to a second row rather than clipping them), an optional
          trailing control (the collapse toggle) pinned right. */}
      <div className="flex items-start justify-between gap-1 border-b border-border px-2 pt-2">
        <TabList data-tour={TOUR_ANCHORS.sidebarTabs} className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              className="cursor-pointer whitespace-nowrap rounded-t-sj border border-b-0 border-transparent bg-transparent px-2 py-1 text-sm text-muted data-selected:-mb-px data-selected:border-border data-selected:bg-bg data-selected:text-text"
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
        {trailing !== undefined ? <div className="shrink-0 py-0.5">{trailing}</div> : null}
      </div>
      <TabPanels className="min-h-0 flex-1 overflow-y-auto">
        {tabs.map((tab) => (
          <TabPanel key={tab.id}>{tab.content}</TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
