// Which collapsible panel sections are open — Designer-local UI state, like the
// grid step: never written into the template, never persisted, gone on reload.
//
// It cannot live in the sections themselves. The panel's tab bodies UNMOUNT
// when another tab is chosen (Headless UI `TabPanel`), and the panel swaps its
// whole body between the item, cell and no-selection branches, so a section's
// own `useState` would forget the reader's choice on a tab switch alone. The
// provider sits at the Designer root, which outlives both; a section mounted
// with no provider above it (a standalone test, a host rendering one section)
// falls back to state of its own.

import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

/** Every collapsible section, as one closed vocabulary — a typo is a type error
 * rather than a section that silently shares nobody's state. */
export type SectionId =
  | 'table.columns'
  | 'table.rows'
  | 'table.pages'
  | 'table.empty'
  | 'table.groups'
  | 'table.style'
  | 'table.text'
  | 'table.border'
  | 'table.headerBand'
  | 'table.bodyBand'
  | 'table.conditions'
  | 'table.styleNames';

interface SectionOpenStore {
  readonly overrides: ReadonlyMap<SectionId, boolean>;
  readonly set: (id: SectionId, open: boolean) => void;
}

const SectionOpenContext = createContext<SectionOpenStore | null>(null);

export function SectionOpenProvider({ children }: { readonly children: ReactNode }) {
  const [overrides, setOverrides] = useState<ReadonlyMap<SectionId, boolean>>(() => new Map());
  const set = useCallback((id: SectionId, open: boolean) => {
    setOverrides((prev) => new Map(prev).set(id, open));
  }, []);
  return (
    <SectionOpenContext.Provider value={{ overrides, set }}>{children}</SectionOpenContext.Provider>
  );
}

/** The section's open state and its toggle. `defaultOpen` answers until the
 * reader first toggles the section; after that the reader's choice wins for as
 * long as the provider lives. */
export function useSectionOpen(id: SectionId, defaultOpen: boolean): [boolean, () => void] {
  const store = useContext(SectionOpenContext);
  const [local, setLocal] = useState(defaultOpen);
  if (store === null) {
    return [local, () => setLocal((v) => !v)];
  }
  const open = store.overrides.get(id) ?? defaultOpen;
  return [open, () => store.set(id, !open)];
}
