// The anchor registry: every id a coach mark can point at, in ONE place, and
// the DOM lookup that resolves one. Chrome carries the id as `data-tour`; a
// drift test pins every course step's anchor against this list, so a renamed
// control fails the suite instead of silently un-pointing a step.

/** Every `data-tour` id the Designer chrome carries. */
export const TOUR_ANCHORS = {
  menuInsert: 'menu-insert',
  menuFile: 'menu-file',
  menuHelp: 'menu-help',
  toolbarBold: 'toolbar-bold',
  toolbarFontSize: 'toolbar-font-size',
  toolbarAlign: 'toolbar-align',
  toolbarStyles: 'toolbar-styles',
  sidebarTabs: 'sidebar-tabs',
  dataEditorGear: 'data-editor-gear',
  panel: 'panel',
  panelTabs: 'panel-tabs',
  diagnostics: 'diagnostics',
  containerPicker: 'container-picker',
} as const;

export type TourAnchorId = (typeof TOUR_ANCHORS)[keyof typeof TOUR_ANCHORS];

/** Every registered id, for the drift test and the runtime membership guard. */
export const TOUR_ANCHOR_IDS: readonly string[] = Object.values(TOUR_ANCHORS);

/** A rectangle in viewport coordinates — what a coach mark needs to position
 * itself. Kept structural (not a DOMRect) so pure tests can supply one. */
export interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Resolve an anchor id to its on-screen rectangle. Returns null when the
 * control is not mounted (a step pointing at a closed dialog) — the caller
 * falls back to a centered bubble rather than pointing at nothing.
 *
 * The id is escaped before it reaches `querySelector`: ids are authored data,
 * and a step (or a future AI-authored topic) carrying a quote or backslash must
 * not become a selector injection or a thrown `SyntaxError`. Escaping is done
 * here rather than with `CSS.escape`, which jsdom does not implement — a
 * runtime-conditional escape would leave a branch no environment can cover. */
export function anchorRect(id: string, root: ParentNode = document): AnchorRect | null {
  // Inside a double-quoted attribute selector, only `"` and `\` are special.
  const escaped = id.replace(/["\\]/g, '\\$&');
  const el = root.querySelector(`[data-tour="${escaped}"]`);
  if (el === null) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}
