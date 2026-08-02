// Reports the open document's name + save status + rename callback to the app
// shell's header (which carries the gdoc-style title stack), and clears it on
// unmount so returning to the catalog / list drops it. The app header owns the
// title, so the embedded Designer's own title bar is unused in-app. These are
// the editor's LAST effects, and stay so: called at the tail of the wiring
// order.

import { useCallback, useEffect, useRef } from 'react';
import type { HeaderDoc } from './AppHeader';

export interface HeaderReportOptions {
  readonly effectiveName: string | undefined;
  readonly titleSaveStatus: HeaderDoc['saveStatus'];
  readonly onRename: (name: string) => void;
  readonly onHeaderDocChange: ((doc: HeaderDoc | null) => void) | undefined;
}

export function useHeaderReport({
  effectiveName,
  titleSaveStatus,
  onRename,
  onHeaderDocChange,
}: HeaderReportOptions): void {
  // A STABLE rename callback over a latest-ref of the handler: reported into
  // the header's `HeaderDoc`, so its identity must not churn per render or the
  // report effect below would re-fire into a setState loop. The ref is
  // refreshed each render (the handler closes over changing state); the stable
  // wrapper reads it at interaction time, always seeing the latest closure.
  const renameImplRef = useRef(onRename);
  useEffect(() => {
    renameImplRef.current = onRename;
  });
  const reportRename = useCallback((name: string) => renameImplRef.current(name), []);

  useEffect(() => {
    onHeaderDocChange?.({
      name: effectiveName,
      saveStatus: titleSaveStatus,
      onRename: reportRename,
    });
    return () => onHeaderDocChange?.(null);
  }, [effectiveName, titleSaveStatus, onHeaderDocChange, reportRename]);
}
