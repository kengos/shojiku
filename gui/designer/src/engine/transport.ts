// The engine transport seam: the host-injection point through which the canvas
// gets preview pixels + inspect boxes + diagnostics. v1 is browser WASM
// (wasmTransport.ts); a Worker or server-preview transport is a FUTURE host
// implementing this same interface — the GUI never grows a parallel rendering
// path. The interface is async so a Worker transport slots in without touching
// callers (the WASM adapter resolves synchronously).

import type {
  ArgValue,
  Diagnostics,
  FormatCatalog,
  InspectEnvelope,
  LocaleFacts,
  PatternProbe,
  RawPage,
  WasmErrorCode,
} from './types';

/** A render outcome: pages to paint, the inspect envelope to overlay, and the
 * diagnostics to surface. `ok: false` means parse/validate failed — `pages` is
 * empty and `diagnostics` explains; it is NEVER signalled by a throw. */
export interface RenderOutcome {
  readonly ok: boolean;
  readonly pages: readonly RawPage[];
  readonly inspect: InspectEnvelope | null;
  readonly diagnostics: Diagnostics;
}

/** A PDF render outcome: the real deliverable's bytes plus the diagnostics
 * that describe the document it came from. `ok: false` means parse/validate
 * failed — `pdf` is empty and `diagnostics` explains; like `RenderOutcome`,
 * never signalled by a throw. There is no inspect envelope: the canvas already
 * holds a fresh one, and a PDF export has no overlay to place. */
export interface PdfOutcome {
  readonly ok: boolean;
  readonly pdf: Uint8Array;
  readonly diagnostics: Diagnostics;
}

export interface RenderOptions {
  /** Device pixels per pt — the overlay must scale by the SAME value. */
  readonly scale: number;
  /** 0-based page to render alone; omit for every page. */
  readonly pageIndex?: number;
}

export interface EngineTransport {
  validate(template: string, params?: string, definitions?: string): Promise<Diagnostics>;
  renderRaw(
    template: string,
    params: string,
    definitions: string | undefined,
    options: RenderOptions,
  ): Promise<RenderOutcome>;
  /** Render the real PDF deliverable. OPTIONAL: a transport over an engine
   * without the `wasm.render.pdf` capability (or a host that renders PDFs
   * elsewhere) simply omits it, and the Designer hides the action — the
   * feature gate is capability + presence, never a version sniff. */
  renderPdf?(
    template: string,
    params: string,
    definitions: string | undefined,
  ): Promise<PdfOutcome>;
  /** The format catalog: the pickable display variants per field type, each
   * with an engine-rendered sample, plus one result per requested pattern
   * probe. OPTIONAL for the same reason `renderPdf` is — a transport over an
   * engine without the `format.catalog` capability omits it, and the panel
   * falls back to offering wire spellings with no samples. Presence, never a
   * version sniff. */
  formatCatalog?(template: string, probes: readonly PatternProbe[]): Promise<FormatCatalog>;
  /** What picking `localeId` does to a date, a number and an amount, under
   * this template's own `defaults.currency`.
   *
   * `overlay` is the locale pack's YAML — the host holds it, because which
   * packs a deployment ships is a host fact; `undefined` asks for a builtin.
   * The engine loads it for this call alone and never touches the locale the
   * session renders through, which is deliberately a DIFFERENT one: a
   * document's `defaults.locale` is the CLI/MCP render fallback, and a panel
   * explaining it must be able to describe a locale the preview is not using.
   *
   * OPTIONAL for the same reason `formatCatalog` is — an engine without the
   * `locale.facts` capability omits it and the panel explains nothing rather
   * than guessing. Presence, never a version sniff. */
  localeFacts?(template: string, localeId: string, overlay?: string): Promise<LocaleFacts>;
}

/** A transport-level failure: an engine host-misuse throw (e.g. rendering
 * before `loadFonts`) or a malformed engine response. The preview loop renders
 * it as an error state — it never escapes as an uncaught throw.
 *
 * When the engine threw a typed host-misuse error, `code` + `args` carry its
 * stable code and typed values (mirroring the diagnostics discipline), so a
 * host branches on `code` — e.g. clamps a `page_out_of_range` and re-renders —
 * instead of matching the localizable `message`. Both are absent when the
 * throw was untyped (a malformed response, or an older engine that threw a
 * bare string). `code` is typed as the known set for ergonomics; an
 * unrecognized code from a newer engine still rides through as its string. */
export class TransportError extends Error {
  readonly code?: WasmErrorCode;
  readonly args?: Readonly<Record<string, ArgValue>>;

  constructor(
    message: string,
    fields?: { code?: WasmErrorCode; args?: Readonly<Record<string, ArgValue>> },
  ) {
    super(message);
    this.name = 'TransportError';
    this.code = fields?.code;
    this.args = fields?.args;
  }
}
