/* tslint:disable */
/* eslint-disable */

/**
 * The JS-facing engine handle. Fonts/assets/locale are injected once and
 * retained; each render only re-passes the source strings.
 */
export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Injects one bundled asset's bytes under its template-referenced path.
     */
    addAssetFile(rel: string, bytes: Uint8Array): void;
    /**
     * Adds one face file's bytes to a declared pack.
     */
    addFontFile(pack_id: string, file: string, bytes: Uint8Array): void;
    /**
     * Declares an injected font pack by id + its `manifest.yml` source.
     */
    addFontPack(id: string, manifest: string): void;
    /**
     * The engine capability + version JSON. Static — no session needed.
     */
    static capabilities(): string;
    /**
     * The JSON array of `{ file, url? }` a declared pack's manifest lists —
     * the file-name form plus each face's optional fetch hint, for a host
     * that must fetch a pinned pack's bytes itself. `url` is omitted when the
     * manifest carries none.
     */
    fontFacesNeeded(pack_id: string): string;
    /**
     * The JSON array of face file names a declared pack's manifest lists —
     * what the host fetches and injects via `addFontFile`.
     */
    fontFilesNeeded(pack_id: string): string;
    /**
     * The JSON array of font pack ids this locale needs.
     */
    fontPacksNeeded(): string;
    /**
     * Builds the retained font store from the injected packs (sha256 +
     * embedding verified).
     */
    loadFonts(): void;
    /**
     * The preview-path load: builds the store from whatever packs are injected
     * so far and returns the JSON array of the locale's `uses` pack ids that
     * were absent, so the host can fetch + re-inject them and reload when a
     * `missing_glyph` diagnostic appears. The primary pack is still required.
     */
    loadFontsSubset(): string;
    /**
     * A fresh engine with no locale, fonts, or assets.
     */
    constructor();
    /**
     * Renders the real PDF deliverable: `{ ok, pdf: Uint8Array, diagnostics:
     * string }`. Same argument order as the preview ops minus the ones a PDF
     * has no use for — no `scale` (vector output) and no `pageIndex` (a PDF
     * is the whole document). A document problem resolves with `ok: false`,
     * empty bytes and the explaining diagnostics; it never throws.
     */
    renderPdf(template: string, params: string, definitions?: string | null): any;
    /**
     * Renders to PNG pages (the export form): `{ ok, pages: Uint8Array[],
     * inspect: string|null, diagnostics: string }`. `pageIndex` (0-based,
     * optional) renders only that page; omit it for every page.
     */
    renderPng(template: string, params: string, definitions: string | null | undefined, scale: number, page_index?: number | null): any;
    /**
     * Renders to raw RGBA pages (the canvas form): `{ ok, pages: { width,
     * height, rgba: Uint8Array }[], inspect: string|null, diagnostics }`.
     * `pageIndex` (0-based, optional) renders only that page; omitted, every
     * page is returned, capped so uncompressed pages cannot exhaust the heap.
     */
    renderRaw(template: string, params: string, definitions: string | null | undefined, scale: number, page_index?: number | null): any;
    /**
     * Resolves and stores the locale pack (builtin id, with an optional
     * overlay/standalone YAML string).
     */
    setLocale(id: string, overlay?: string | null): void;
    /**
     * Validates the source strings, returning the diagnostics JSON
     * (`{ "items": [...] }`). Argument order matches the render ops:
     * template, params, definitions.
     */
    validate(template: string, params?: string | null, definitions?: string | null): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_addAssetFile: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_addFontFile: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly engine_addFontPack: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_capabilities: () => [number, number, number, number];
    readonly engine_fontFacesNeeded: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_fontFilesNeeded: (a: number, b: number, c: number) => [number, number, number, number];
    readonly engine_fontPacksNeeded: (a: number) => [number, number, number, number];
    readonly engine_loadFonts: (a: number) => [number, number];
    readonly engine_loadFontsSubset: (a: number) => [number, number, number, number];
    readonly engine_new: () => number;
    readonly engine_renderPdf: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly engine_renderPng: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly engine_renderRaw: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly engine_setLocale: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly engine_validate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
