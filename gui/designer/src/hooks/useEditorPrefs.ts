// The editor's own view preferences — the base grid step and the left tool
// pane's width/collapsed state. Designer-local UI state seeded from the host's
// persisted values and NEVER written into the template; a settled change is
// reported back for the host to persist.

import { useCallback, useState } from 'react';
import { normalizeGridStep } from '../canvas/plan';
import { clampSidebarWidth } from '../sidebar/width';

export interface EditorPrefsOptions {
  readonly defaultGridStep: number | undefined;
  readonly onGridStepChange: ((step: number) => void) | undefined;
  readonly defaultSidebarWidth: number | undefined;
  readonly onSidebarWidthChange: ((width: number) => void) | undefined;
}

export interface EditorPrefs {
  readonly gridStep: number;
  readonly changeGridStep: (value: number) => void;
  readonly sidebarWidth: number;
  readonly setSidebarWidth: (width: number) => void;
  readonly commitSidebarWidth: (width: number) => void;
  readonly sidebarCollapsed: boolean;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
}

export function useEditorPrefs({
  defaultGridStep,
  onGridStepChange,
  defaultSidebarWidth,
  onSidebarWidthChange,
}: EditorPrefsOptions): EditorPrefs {
  // The editor base grid step (pt; 0 = off) — Designer-local UI state seeded
  // from the host's persisted value, NEVER written into the template.
  const [gridStep, setGridStep] = useState(() => normalizeGridStep(defaultGridStep));
  const changeGridStep = useCallback(
    (value: number) => {
      const step = normalizeGridStep(value);
      setGridStep(step);
      onGridStepChange?.(step);
    },
    [onGridStepChange],
  );

  // The left tool-pane's width (px) — Designer-local UI state (like gridStep),
  // seeded from the host's persisted value (clamped) and NEVER written into the
  // template. The drag handle updates it live; a settled width persists via the
  // host callback. Collapsed is session-local (not persisted) — the toggle hides
  // the pane to give the canvas room.
  const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(defaultSidebarWidth));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const commitSidebarWidth = useCallback(
    (width: number) => {
      setSidebarWidth(width);
      onSidebarWidthChange?.(width);
    },
    [onSidebarWidthChange],
  );

  return {
    gridStep,
    changeGridStep,
    sidebarWidth,
    setSidebarWidth,
    commitSidebarWidth,
    sidebarCollapsed,
    setSidebarCollapsed,
  };
}
