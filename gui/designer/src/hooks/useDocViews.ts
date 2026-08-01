// The two fullscreen views that take over the whole editor area — document
// settings and the data-item editor — and their mutual exclusion. Both are
// Designer-local UI state, never in the template. Opening either clears the
// selection (they are the no-selection surfaces); any later selection closes
// the document view.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocSection } from '../panel/docSections';
import type { DefaultsSection } from '../panel/OriginBadge';

export interface DocViewsOptions {
  readonly selection: string | null;
  readonly clearSelection: () => void;
}

export interface DocViews {
  readonly docViewOpen: boolean;
  readonly dataViewOpen: boolean;
  /** The section a jump targets (the nonce re-triggers a repeat jump to the
   * same section); null = opened without a target. */
  readonly docFocus: { readonly section: DocSection; readonly nonce: number } | null;
  /** Live open flags for the window shortcut handler (which subscribes once and
   * must read the current state, not the value closed over at subscribe time). */
  readonly docViewOpenRef: { readonly current: boolean };
  readonly dataViewOpenRef: { readonly current: boolean };
  readonly openDocView: (section?: DocSection) => void;
  readonly closeDocView: () => void;
  readonly openDataView: () => void;
  readonly closeDataView: () => void;
  /** A style field's origin hint jumps into the view at the owning section
   * (`defaults`/`styles` are both `DocSection`s). */
  readonly navigateDefaults: (section: DefaultsSection) => void;
}

export function useDocViews({ selection, clearSelection }: DocViewsOptions): DocViews {
  // The fullscreen document-settings view: opened by the 「whole-document」 tree
  // root row, the File-menu 「document settings…」 entry, or a style field's origin-hint
  // jump. `docFocus` scrolls the view to the section a jump targets.
  const [docViewOpen, setDocViewOpen] = useState(false);
  const docViewOpenRef = useRef(docViewOpen);
  docViewOpenRef.current = docViewOpen;
  const [docFocus, setDocFocus] = useState<{
    readonly section: DocSection;
    readonly nonce: number;
  } | null>(null);
  const docFocusNonce = useRef(0);
  // The fullscreen data-item editor — mutually exclusive with the document view
  // (opening one closes the other); both take over the whole editor area.
  const [dataViewOpen, setDataViewOpen] = useState(false);
  const dataViewOpenRef = useRef(dataViewOpen);
  dataViewOpenRef.current = dataViewOpen;
  const openDocView = useCallback(
    (section?: DocSection) => {
      clearSelection();
      setDataViewOpen(false);
      if (section !== undefined) {
        docFocusNonce.current += 1;
        setDocFocus({ section, nonce: docFocusNonce.current });
      }
      setDocViewOpen(true);
    },
    [clearSelection],
  );
  const closeDocView = useCallback(() => setDocViewOpen(false), []);
  const openDataView = useCallback(() => {
    clearSelection();
    setDocViewOpen(false);
    setDataViewOpen(true);
  }, [clearSelection]);
  const closeDataView = useCallback(() => setDataViewOpen(false), []);
  const navigateDefaults = useCallback(
    (section: DefaultsSection) => openDocView(section),
    [openDocView],
  );

  // Any selection (a tree row, a diagnostic jump, an insert's auto-select, an
  // inline-edit request) closes the document-settings view — it is the
  // no-selection surface, and selecting an item means the user wants the canvas
  // + property panel back. Opening the view clears the selection first, so this
  // never fires against the open state itself.
  useEffect(() => {
    if (selection !== null) {
      setDocViewOpen(false);
    }
  }, [selection]);

  return {
    docViewOpen,
    dataViewOpen,
    docFocus,
    docViewOpenRef,
    dataViewOpenRef,
    openDocView,
    closeDocView,
    openDataView,
    closeDataView,
    navigateDefaults,
  };
}
