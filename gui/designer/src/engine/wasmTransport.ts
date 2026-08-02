// The browser-WASM transport: a thin adapter over the `engine/wasm` `Engine`
// (a prepared instance — locale + fonts already injected host-side). It never
// re-measures or re-renders; it marshals strings in and parses the engine's
// JSON out, guarding every field. Two failure modes both become a
// `TransportError` the preview loop renders (never an uncaught throw):
//   - the engine host-misuse throw (e.g. render before `loadFonts`), and
//   - a malformed engine response (wrong shape / bad RGBA buffer length),
//     guarded field by field in `wasmResponse.ts`.

import { throwFields } from './errors';
import { type EngineTransport, TransportError } from './transport';
import { toDiagnostics, toOutcome, toPdfOutcome } from './wasmResponse';

/** The subset of the `engine/wasm` `Engine` this transport calls. Typed
 * structurally so the gitignored build artifact (`engine/wasm/pkg`) is never a
 * static import of the GUI package. */
export interface WasmEngine {
  validate(template: string, params?: string | null, definitions?: string | null): string;
  renderRaw(
    template: string,
    params: string,
    definitions: string | null | undefined,
    scale: number,
    pageIndex?: number | null,
  ): unknown;
  /** Present only on an engine advertising `wasm.render.pdf`. */
  renderPdf?(template: string, params: string, definitions: string | null | undefined): unknown;
}

/** Build an `EngineTransport` over a prepared wasm `Engine`. */
export function createWasmTransport(engine: WasmEngine): EngineTransport {
  return {
    async validate(template, params, definitions) {
      let json: string;
      try {
        json = engine.validate(template, params ?? null, definitions ?? null);
      } catch (cause) {
        const { message, code, args } = throwFields(cause);
        throw new TransportError(message, { code, args });
      }
      return toDiagnostics(json);
    },
    async renderRaw(template, params, definitions, options) {
      let raw: unknown;
      try {
        raw = engine.renderRaw(
          template,
          params,
          definitions ?? null,
          options.scale,
          options.pageIndex ?? null,
        );
      } catch (cause) {
        const { message, code, args } = throwFields(cause);
        throw new TransportError(message, { code, args });
      }
      return toOutcome(raw);
    },
    // Presence mirrors the engine's: an older module without `renderPdf` (or a
    // future non-wasm transport) leaves the key undefined, which is exactly
    // what the Designer's feature gate reads.
    ...(typeof engine.renderPdf === 'function'
      ? {
          async renderPdf(template, params, definitions) {
            let raw: unknown;
            try {
              raw = engine.renderPdf?.(template, params, definitions ?? null);
            } catch (cause) {
              const { message, code, args } = throwFields(cause);
              throw new TransportError(message, { code, args });
            }
            return toPdfOutcome(raw);
          },
        }
      : {}),
  };
}
