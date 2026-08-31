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
  /** The box is reserved and the DOCUMENT decided nothing would paint there.
   * Two causes, not one: the item's `visible:` predicate did not hold, or the
   * box belongs to a `header.visuallyHidden` table header. An authored
   * `opacity: 0` is NOT one of them — that is the author's own paint choice,
   * so do not ghost a merely faint item. The geometry is real — this is where
   * the item WOULD have drawn — so the canvas ghosts it rather than showing an
   * unexplained gap. A COLLAPSED item emits no box at all, so it is reachable
   * from the layer tree rather than the canvas. Absent on every engine that
   * predates the key, and on every document that triggers neither cause. */
  readonly hidden?: boolean;
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

/** Where a format variant's spelling comes from. Mirrors the engine's
 * `FormatOrigin` (`engine/authoring/src/formats.rs`). The distinction is
 * load-bearing for the panel: only a `registry` name is the document's own,
 * so only it breaks when the registry is renamed. */
export type FormatOrigin = 'builtin' | 'pack' | 'registry';

/** One pickable format variant with what it renders for THIS document. The
 * samples come from the engine — the GUI never formats. */
export interface FormatVariant {
  readonly spelling: string;
  readonly origin: FormatOrigin;
  /** One entry for every type but `quantity`, which is plural-aware and so
   * samples both arms. */
  readonly samples: readonly string[];
  /** Whether picking this variant DISCARDS the time part of the value — only
   * ever true on the `datetime` entry, where the pack's date table is
   * resolved after its own and a date-only pattern is offered and honoured
   * without warning. The engine MEASURES it (it renders the exemplar at two
   * times of day and compares), so it holds for a third-party pack and for
   * the document's own `formats:` entries. */
  readonly dropsTime: boolean;
}

/** One field type's pickable vocabulary. `fixed` marks the types that have
 * no named variants at all (`number` / `percentage` / `quantity`), where the
 * panel shows the rendering and offers no control. */
export interface FormatTypeEntry {
  readonly fieldType: string;
  readonly fixed: boolean;
  readonly variants: readonly FormatVariant[];
}

/** Why a pattern probe was not run. */
export type ProbeRefusal = 'patternTooLong' | 'tooManyProbes';

/** What one pattern probe rendered, or why it was refused. `warning` is the
 * engine's ENGLISH default — the engine never translates, so a consumer with
 * a catalog renders its own. */
export interface ProbeResult {
  readonly sample: string;
  readonly warning: string | null;
  readonly refused: ProbeRefusal | null;
}

/** What picking a `defaults.locale` DOES, as the engine's own rendered output
 * — the answer to `localeFacts`. The Designer composes none of it: a locale
 * panel that explained a pick with strings of its own could drift from what
 * the page prints, which is the defect this seam exists to remove. */
export interface LocaleFacts {
  /** The pack the engine actually resolved, by its OWN id — not necessarily
   * the tag that was asked for. */
  readonly id: string;
  /** The engine's dated exemplar through this locale's default rendering. */
  readonly date: string;
  /** The number exemplar, long enough to show the grouping RULE rather than
   * only the separator. */
  readonly number: string;
  /** The ISO code an amount takes when the document names none. EMPTY when
   * the pack declares none — a caller then claims nothing about currency. */
  readonly currencyDefault: string;
  /** The currency exemplar at the document's own currency, or at the pack's
   * default. It carries that currency's fraction digits. */
  readonly amount: string;
}

/** The format catalog for one (template, locale) pair. */
export interface FormatCatalog {
  readonly types: readonly FormatTypeEntry[];
  readonly probes: readonly ProbeResult[];
}

/** A pattern the panel wants previewed before it is authored. Only `date`
 * and `datetime` have a pattern form. */
export interface PatternProbe {
  readonly fieldType: 'date' | 'datetime';
  readonly pattern: string;
}
