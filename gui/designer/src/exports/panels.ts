// Public surface of the editing SURFACES around the canvas: the property panel
// and its page-setup model, the diagnostics list, the field palette, and the
// document-outline trio (layer tree / breadcrumb / tabbed sidebar).
// Re-exported wholesale by the package index.

// The GUI-derived advisories half of the diagnostics list: the panel prop's
// types, plus the pure model behind them so a host mounting the panel
// directly can build the list rather than reimplement the rule.
export {
  type CollisionItem,
  findTextCollisions,
  type TextCollision,
} from '../diagnostics/collisions';
export { DiagnosticsPanel, type DiagnosticsPanelProps } from '../diagnostics/DiagnosticsPanel';
// Field-palette model (pure; the read-only definitions view + the
// used-in-template correlation).
export { type BindingRef, readBindings } from '../palette/bindings';
export { FieldPalette, type FieldPaletteProps } from '../palette/FieldPalette';
export { filterGroups } from '../palette/filter';
export { type PaletteField, type PaletteGroup, readDefinitionsView } from '../palette/model';
export { buildUsage, fieldUsage, groupUsage, type UsageIndex } from '../palette/usage';
export { buildStyleFloor, ENGINE_STYLE_DEFAULTS } from '../panel/engineDefaults';
export { PageSetup, type PageSetupProps } from '../panel/PageSetup';
export { PropertyPanel, type PropertyPanelProps } from '../panel/PropertyPanel';
// Page-setup model + reference data (pure; reused by any host building its own
// document-settings surface): what the setup READS, then what an edit WRITES.
export {
  type CustomDims,
  type Orientation,
  type PageView,
  readPageView,
  sizeLabel,
} from '../panel/pageSetupModel';
export { customDimOp, customUnitOps, orientationOp, selectSizeOp } from '../panel/pageSetupOps';
export {
  CUSTOM,
  type DimensionParts,
  type NamedSize,
  namedSize,
  PAGE_SIZE_NAMES,
  PAGE_SIZES,
  SIZE_UNITS,
  type SizeUnit,
  thumbnailGeometry,
} from '../panel/pageSizes';
export { Sidebar, type SidebarProps, type SidebarTab } from '../sidebar/Sidebar';
export {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from '../sidebar/width';
export { Breadcrumb, type BreadcrumbProps } from '../tree/Breadcrumb';
export { type KindIcon, kindIcon } from '../tree/kindIcons';
// Layer tree / breadcrumb / tabbed sidebar (the document outline surfaces)
// and the pure outline model behind them.
export { LayerTree, type LayerTreeProps } from '../tree/LayerTree';
export { kindName, nodeLabel, SECTION_PREFIX } from '../tree/labels';
export { buildTree, type TreeNode, type TreeView } from '../tree/model';
export {
  dropIndexFor,
  type MoveItemOp,
  moveOpFor,
  type RowRect,
  seqPosition,
} from '../tree/reorder';
export { breadcrumbChain } from '../tree/selection';
