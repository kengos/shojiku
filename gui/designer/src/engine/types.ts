// Type-only mirrors of the engine/wasm response shapes the canvas consumes.
// These copy the engine serde names (camelCase) — never an invented parallel
// shape. Sources of truth (keep in sync):
//   RawPage / render bundle  engine/wasm/src/{render,shim}.rs
//   inspect envelope         engine/authoring/src/inspect.rs
//   PlacedBox / BoxRect      engine/layout/src/boxes.rs
//   Diagnostic / Diagnostics engine/diagnostics/src/lib.rs
//   EngineInfo               engine/authoring/src/capabilities.rs
// There is NO runtime code here (coverage-excluded like designer-core's
// wire.ts): these describe what the transport parses out of the engine's JSON.

/** One raw-RGBA page: `width * height * 4` un-premultiplied bytes. */
export interface RawPage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** A rectangle in absolute page coordinates (pt, top-left origin). */
export interface BoxRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One drawn line's optical anchors (pt). */
export interface LineMetric {
  readonly x: number;
  readonly width: number;
  readonly baseline: number;
  readonly capTop: number;
  readonly emTop: number;
  readonly emBottom: number;
}

/** One vertical (vertical writing) column's optical anchors (pt): the column-axis x
 * (`baseline`) plus its em band, with `y`/`height` the drawn extent — the
 * axis-swapped analog of {@link LineMetric}. Present when the engine
 * advertises `inspect.text_metrics.vertical`. */
export interface ColumnMetric {
  readonly y: number;
  readonly height: number;
  readonly baseline: number;
  readonly emLeft: number;
  readonly emRight: number;
}

/** Untagged on the wire: a horizontal item carries `lines`, a vertical
 * one `columns` — switch on the present key. */
export type TextMetrics =
  | { readonly lines: readonly LineMetric[] }
  | { readonly columns: readonly ColumnMetric[] };

/** One laid-out item placement: its structural `path` (the primary key for
 * correlating canvas geometry to a YAML node), an optional authored `id`, and
 * its border/content boxes. */
export interface PlacedBox {
  readonly path: string;
  readonly id?: string;
  readonly border: BoxRect;
  readonly content: BoxRect;
  readonly text?: TextMetrics;
}

/** Per-page box sidecar: `pages[p]` is the boxes laid out on page `p`. */
export interface BoxIndex {
  readonly pages: readonly (readonly PlacedBox[])[];
}

export interface EngineInfo {
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly builtinLocales: readonly string[];
}

/** The `inspect` envelope. `document` (the layout tree) is carried opaquely —
 * the canvas overlays `boxes`, it never re-reads the tree. */
export interface InspectEnvelope {
  readonly engine: EngineInfo;
  readonly document: unknown;
  readonly boxes: BoxIndex;
  readonly margin: readonly [number, number, number, number];
}

export type Severity = 'error' | 'warning' | 'info';

export type ArgValue = string | number | boolean;

export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly path?: string;
  readonly args: Readonly<Record<string, ArgValue>>;
  readonly origin?: string;
}

export interface Diagnostics {
  readonly items: readonly Diagnostic[];
}

/** The stable `code` a wasm host-misuse throw carries (engine/wasm
 * `WasmError::code`). Append-only, mirroring the diagnostics discipline — a
 * newer engine may add codes, so consumers switch on these and fall through
 * to generic handling for an unrecognized one. The runtime-recoverable set a
 * host clamps + retries is `page_out_of_range` (a stale `pageIndex` after an
 * edit shrank the document) and `too_many_raw_pages`. */
export type WasmErrorCode =
  | 'locale_not_set'
  | 'fonts_not_loaded'
  | 'locale_error'
  | 'unknown_font_pack'
  | 'font_error'
  | 'bad_scale'
  | 'render_error'
  | 'page_out_of_range'
  | 'too_many_raw_pages';
