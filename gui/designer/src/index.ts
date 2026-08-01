// The embeddable React Designer component: the canvas (engine transport seam,
// debounced preview loop, RGBA underlay + box overlay + path-keyed selection),
// the property/diagnostics/palette panels over the per-language catalog,
// undo/redo + validate-before-save, and the assembled `Designer` surface. It
// re-exports the headless core it drives.
//
// The package's public surface is grouped by AREA, one barrel per area under
// `exports/` (the same areas the code map splits by): what PAINTS the document
// (`canvas`), the editing SURFACES around it (`panels`), the document-CONTENT
// models a host persists or feeds in (`document`), the app CHROME (`chrome`),
// and the integrator HOOK seams (`registry`). Only the assembled component, the
// editor session and the version marker are exported here directly.

import { Editor } from '@shojiku/designer-core';

// The serializable patch-op value type (definition edits persist as ops in the
// app's draft envelope; sanitized on restore via `sanitizeDefsEdits`).
export type { Op } from '@shojiku/designer-core';
// Configurable template-size cap helpers (designer-core), surfaced for hosts
// that expose the cap as a user/editor setting (e.g. the app's prefs).
export {
  clampTemplateMaxBytes,
  MAX_TEMPLATE_BYTES,
  MAX_TEMPLATE_BYTES_CEILING,
} from '@shojiku/designer-core';
// The assembled component + its host-injection surfaces.
export { Designer, type DesignerProps } from './Designer';
export { type EditorController, useEditor } from './editor/useEditor';
export * from './exports/canvas';
export * from './exports/chrome';
export * from './exports/document';
export * from './exports/panels';
export * from './exports/registry';
export { Editor };

/** Version marker for the component shell. */
export const DESIGNER_VERSION = '0.0.0';
