// The GUI-derived advisories the diagnostics panel shows beside the engine's
// own. Derived from the LAST-GOOD inspect, exactly like the pages the canvas
// paints: this is a read-only display, so it rides through a failing re-render
// rather than flickering empty on every keystroke. Nothing here drives a
// write, so no freshness gate is owed.

import { useMemo } from 'react';
import { findTextCollisions, type TextCollision } from '../diagnostics/collisions';
import { hasCapability } from '../panel/itemPanelProps';
import type { PreviewState } from '../preview/reducer';

/** Items whose drawn text lands on another item's. An engine that does not
 * advertise `inspect.text_metrics` sends no line metrics, so the honest
 * result there is silence rather than a guess from box geometry. */
export function useAdvisories(
  preview: PreviewState,
  capabilities: readonly string[] | undefined,
): readonly TextCollision[] {
  const boxes = preview.lastGood?.inspect?.boxes;
  const enabled = hasCapability(capabilities, 'inspect.text_metrics');
  return useMemo(() => (enabled ? findTextCollisions(boxes) : []), [boxes, enabled]);
}
