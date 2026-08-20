// The per-item editor's prop contract, as a leaf module: the tab sections
// beside `ItemPanel.tsx` each take the WHOLE `ItemPanelProps` (the shell spreads
// it), so the interface cannot live in the shell without every section importing
// its own parent. Nothing here renders — the shell and its sections are the
// components.

import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import type { PaletteGroup } from '../palette/model';
import type { ItemView } from './itemView';
import type { DefaultsSection } from './OriginBadge';
import type { PlacementGeometry } from './placementGeometry';

export interface ItemPanelProps {
  readonly controller: EditorController;
  readonly path: string;
  readonly view: ItemView;
  readonly fontFamilies: readonly string[];
  readonly capabilities?: readonly string[];
  /** The engine's format catalog — what each pickable spelling actually
   * RENDERS. `null` before the first answer, and permanently on a transport
   * that cannot answer: the picker then lists spellings with no samples. */
  readonly formatCatalog?: FormatCatalog | null;
  /** The engine-default floor (docs/engine/style.md) — an unset inherited style
   * key resolves to its real engine default (the default origin), so a font-less title's
   * size hint shows `10` instead of blank. Threaded to the cascade mirror. */
  readonly floor?: Readonly<Record<string, unknown>>;
  readonly paletteGroups: readonly PaletteGroup[] | null;
  readonly params: string;
  /** The active canvas grid step (pt) — the box steppers' increment. 0/off
   * falls back to a 1pt step. Designer-local UI state, never in the template. */
  readonly gridStep: number;
  /** The resolved-geometry inputs for the placement tab's auto/fixed modes (inspect
   * boxes + margins + freshness). `null` until the first render lands or when
   * the geometry is stale — the box fields then degrade to plain editing. */
  readonly geometry?: PlacementGeometry | null;
  readonly onReplaceImage?: (path: string, currentSrcLength: number) => void;
  /** workshop mode: open the create-data-field modal. The picker hands its
   * own commit up so a created field binds THIS item. The tail shows only on a
   * DOCUMENT-scope data.key picker (a fresh top-level key is meaningless inside
   * a row scope). Absent = no tail (engineer schema). */
  readonly onCreateField?: (bindKey: (key: string) => void) => void;
  /** Open the horizontal column-editor sheet for a selected table. */
  readonly onOpenColumnSheet?: () => void;
  /** Jump from a style field's origin hint to the document-settings surface. */
  readonly onNavigateDefaults?: (section: DefaultsSection) => void;
  /** Open the glossary from a section's `?` help popover "learn more". */
  readonly onOpenGlossary?: () => void;
  /** Jump the shared selection (the parent card's select-parent). */
  readonly onSelectPath?: (path: string) => void;
  /** Highlight a container's outline+chip on canvas (parent-card hover);
   * `null` clears. */
  readonly onHighlight?: (path: string | null) => void;
  /** wrap-in-container — wrap this item in a new container. The
   * keyboard-reachable companion to the canvas/tree right-click; present only
   * when the selection is wrappable (an item-list entry). */
  readonly onWrap?: (path: string) => void;
}

/** Whether the engine backing this session carries a capability key. An absent
 * list means the bundled engine (which has every key the GUI gates on) — never
 * version-sniff. */
export function hasCapability(capabilities: readonly string[] | undefined, key: string): boolean {
  return capabilities === undefined || capabilities.includes(key);
}
