// The lazy font-fetch loop: after the primary-lineup first paint, a preview
// whose document needs an absent (heavy) pack reports it via a diagnostic; this
// fetches the absent packs in the background, injects them, reloads the subset
// store, and signals the app to re-render with the upgraded fonts. The trigger
// is (`missing_glyph` OR `unknown_font_family`) — the typed diagnostic CODE
// (never message parsing) — intersected with the non-empty absent set.
//
// Both codes matter: a rare-glyph document produces `missing_glyph` (the loaded
// faces lack a glyph), but a preset that AUTHORS a lazy-tier `fontFamily` never
// does — the family is absent at boot, so the engine reports
// `unknown_font_family` and falls back to a face that HAS the glyphs. Widening
// the trigger to that code is correct precisely because the absent set is
// non-empty: fetching the heavy pack is the right disambiguation even when the
// unknown family is a genuine typo, since after the upgrade the diagnostic
// either clears (it was the lazy pack) or persists truthfully (it was a typo).
//
// A single-flight guard fetches the WHOLE absent set once and never retries
// after success/error. The fetch set is the boot-derived pack list, NEVER
// derived from the diagnostic's `family` arg — a hostile `fontFamily` string can
// select only WHETHER the fixed, same-origin fetch happens once, never WHAT is
// fetched.

import {
  type Diagnostics,
  type EngineTransport,
  type PatternProbe,
  type PdfOutcome,
  type RenderOptions,
  type RenderOutcome,
  TransportError,
} from '@shojiku/designer';
import type { FontSource } from './fontSource';
import type { WasmFullEngine } from './wasmModule';

/** The diagnostic code that signals a glyph was absent from the loaded faces. */
export const MISSING_GLYPH = 'missing_glyph';

/** The diagnostic code that signals a `fontFamily` matched no loaded family or
 * face id (the engine fell back to the default face). A preset authoring a
 * lazy-tier family emits this — not `missing_glyph` — until its pack loads. */
export const UNKNOWN_FONT_FAMILY = 'unknown_font_family';

export type LazyStatus = 'idle' | 'fetching' | 'upgraded' | 'error';

export interface LazyFontLoaderDeps {
  readonly engine: WasmFullEngine;
  readonly fonts: FontSource;
  /** The full set of packs to (re-)inject on upgrade, read at RUN time. The
   * engine consumes injected packs on each load, so upgrading re-injects ALL
   * of them (primary + the previously-absent lazy packs), not just the absent
   * ones — and it is a function because the set can grow after boot: a font
   * picked from the catalog joins it, and a snapshot taken at construction
   * would silently drop that pack from the rebuilt store. */
  readonly packIds: () => readonly string[];
  /** The pack ids the boot subset load skipped — the gate: an upgrade only
   * fires when this is non-empty (there is a heavy pack still to load). */
  readonly absentPackIds: readonly string[];
}

function hasUpgradeTrigger(diagnostics: Diagnostics): boolean {
  return diagnostics.items.some((d) => d.code === MISSING_GLYPH || d.code === UNKNOWN_FONT_FAMILY);
}

/** Holds the fetch→inject→reload state for the absent font packs. Stable across
 * transport-identity swaps (the app keeps ONE loader), so once `upgraded` it
 * never re-fetches and a fresh transport wrapper is a no-op. */
export class LazyFontLoader {
  private readonly deps: LazyFontLoaderDeps;
  private inflight: Promise<boolean> | null = null;
  status: LazyStatus = 'idle';
  error: string | null = null;
  /** Set by the app to drive its loading indicator / error banner; fired on
   * every status transition. Assignable after construction so the loader can be
   * built at boot (before React mounts) and subscribed to later. */
  onStatusChange?: (status: LazyStatus, error: string | null) => void;

  constructor(deps: LazyFontLoaderDeps) {
    this.deps = deps;
  }

  private setStatus(status: LazyStatus, error: string | null): void {
    this.status = status;
    this.error = error;
    this.onStatusChange?.(status, error);
  }

  /** React to a render's diagnostics. Resolves `true` exactly once — when the
   * absent packs have been fetched, injected, and the store reloaded (the app
   * then swaps the transport to re-render). Otherwise resolves `false`. */
  observe(diagnostics: Diagnostics): Promise<boolean> {
    if (this.status === 'fetching' && this.inflight !== null) {
      return this.inflight;
    }
    if (this.status !== 'idle') {
      return Promise.resolve(false);
    }
    if (this.deps.absentPackIds.length === 0 || !hasUpgradeTrigger(diagnostics)) {
      return Promise.resolve(false);
    }
    this.setStatus('fetching', null);
    this.inflight = this.run();
    return this.inflight;
  }

  /** Force the whole declared pack set into the store, whatever the last
   * render's diagnostics said. The PREVIEW tolerates an absent lazy pack (its
   * glyphs fall back and the loop upgrades later); the PDF must not — it is
   * the deliverable a user downloads, so it is rendered only once every
   * declared pack is loaded. A caller MUST check `status` after awaiting:
   * `false` means either "nothing to load" (fine) or "the load FAILED"
   * (`status === 'error'` — the PDF must then be refused, or it would embed
   * fallback glyphs and stop being byte-identical to the CLI's output).
   *
   * Single-flight like `observe`, but a previous ERROR is retried: this runs
   * because the user explicitly asked for a PDF. Resolves `true` when it
   * actually upgraded (the caller then re-renders the preview too). */
  ensureLoaded(): Promise<boolean> {
    if (this.status === 'fetching' && this.inflight !== null) {
      return this.inflight;
    }
    if (this.status === 'upgraded' || this.deps.absentPackIds.length === 0) {
      return Promise.resolve(false);
    }
    this.setStatus('fetching', null);
    this.inflight = this.run();
    return this.inflight;
  }

  private async run(): Promise<boolean> {
    const { engine, fonts, packIds } = this.deps;
    try {
      // Re-inject the FULL set: the boot load consumed the primary packs, so
      // the store must be rebuilt from every pack (primary + the now-fetched
      // heavy ones) before the reload.
      for (const packId of packIds()) {
        engine.addFontPack(packId, await fonts.manifest(packId));
        const files = JSON.parse(engine.fontFilesNeeded(packId)) as string[];
        for (const file of files) {
          engine.addFontFile(packId, file, await fonts.face(packId, file));
        }
      }
      engine.loadFontsSubset();
      this.setStatus('upgraded', null);
      return true;
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }
}

/** Wrap an inner transport so each render observes its diagnostics and, when the
 * lazy packs finish loading, calls `onUpgraded` (the app swaps transport
 * identity to re-render). The wrapper never blocks the render it returns — the
 * upgrade runs in the background.
 *
 * **Everything this wrapper does not WRAP passes through**, which is why the
 * body opens by spreading `inner` rather than by listing its members. An
 * enumerated forwarder over an interface with OPTIONAL members is invisible to
 * line coverage — a method it forgets has no line to leave uncovered — and this
 * one forgot `formatCatalog` for its whole life: the standalone app therefore
 * shipped with no format catalog and no pattern probe at all, so every picker
 * lost its engine-rendered samples, a locale pack's own variants were
 * unreachable, and the pattern field's token chips and live preview never
 * appeared. The spread makes forwarding the default for the object-literal
 * transports this repository builds.
 *
 * A member still needs naming here for either of TWO reasons, and the second is
 * the one that is easy to forget: when the wrapper has something to ADD to it,
 * and when it must survive a class-shaped inner transport. A spread copies OWN
 * properties, so an implementation whose methods sit on a prototype gets
 * nothing from it — `validate` and `renderRaw` are delegated explicitly for
 * that reason, and `renderPdf`, `formatCatalog` and `localeFacts` each get a
 * presence-mirrored named arm. So the spread is a floor, not a guarantee: a NEW optional method
 * left to it alone would reach every transport here and none that is
 * class-shaped, which is how this wrapper lost `formatCatalog` in the first
 * place. */
export function createLazyFontTransport(params: {
  readonly inner: EngineTransport;
  readonly loader: LazyFontLoader;
  readonly onUpgraded: () => void;
}): EngineTransport {
  const { inner, loader, onUpgraded } = params;
  // Captured once so the presence check NARROWS it — calling through
  // `inner.formatCatalog?.()` inside the closure would leave an unreachable
  // undefined arm behind the guard that already excluded it.
  const askCatalog = inner.formatCatalog;
  const askFacts = inner.localeFacts;
  return {
    ...inner,
    validate: (template, p, definitions) => inner.validate(template, p, definitions),
    renderRaw: async (
      template: string,
      p: string,
      definitions: string | undefined,
      options: RenderOptions,
    ): Promise<RenderOutcome> => {
      const outcome = await inner.renderRaw(template, p, definitions, options);
      void loader.observe(outcome.diagnostics).then((upgraded) => {
        if (upgraded) {
          onUpgraded();
        }
      });
      return outcome;
    },
    // The PDF path waits for the FULL font set before rendering (see
    // `ensureLoaded`), so a downloaded deliverable never carries fallback
    // glyphs. When that load FAILS, the render is REFUSED — the CLI in the
    // same state (a pack it cannot load) fails too, and a silently degraded
    // PDF is the exact trust gap this feature exists to close. The throw is a
    // TransportError, which the Designer's action already renders as its
    // failed notice. Presence still mirrors the inner transport's.
    ...(inner.renderPdf !== undefined
      ? {
          renderPdf: async (
            template: string,
            p: string,
            definitions: string | undefined,
          ): Promise<PdfOutcome> => {
            if (await loader.ensureLoaded()) {
              onUpgraded();
            }
            if (loader.status === 'error') {
              // `error` is always set alongside the 'error' status (its type
              // stays nullable only for the other states), so it interpolates
              // directly — no fallback branch a test could never reach.
              throw new TransportError(
                `font packs could not be loaded for the PDF render: ${loader.error}`,
              );
            }
            // Non-null: the key exists only when the inner transport has it,
            // and the wrapper is built once per inner transport.
            return (inner.renderPdf as NonNullable<EngineTransport['renderPdf']>)(
              template,
              p,
              definitions,
            );
          },
        }
      : {}),
    // A catalog query is not a render: nothing to observe, no fonts to wait
    // for. The lazy loop has nothing to add, so this is a pass-through — named
    // anyway so it survives an inner transport whose methods live on a
    // prototype, where the spread above copies nothing. Presence mirrors the
    // inner transport's, exactly as `renderPdf` does.
    ...(askCatalog !== undefined
      ? {
          formatCatalog: (template: string, probes: readonly PatternProbe[]) =>
            askCatalog.call(inner, template, probes),
        }
      : {}),
    // Same reasoning as the catalog: a locale query renders nothing and waits
    // for no font, so there is nothing to add — and it is named anyway, for
    // the prototype-shaped inner transport the spread cannot reach.
    ...(askFacts !== undefined
      ? {
          localeFacts: (template: string, localeId: string, overlay?: string) =>
            askFacts.call(inner, template, localeId, overlay),
        }
      : {}),
  };
}
