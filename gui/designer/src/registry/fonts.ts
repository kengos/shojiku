// The font side of the hook surface: the `FontSource` interface every host
// implementation satisfies (the app's static asset tree, the picked-font
// library, an integrator package's own source), the `init:fonts` collecting
// context, and the deterministic chain composer boot uses. sha256 verification
// stays engine-side at injection — a source only supplies bytes.

/** What the boot/lazy flow needs from a font pack: its manifest text and each
 * declared face's bytes. */
export interface FontSource {
  manifest(packId: string): Promise<string>;
  face(packId: string, file: string): Promise<Uint8Array>;
}

/** A picked/pinned font pack as persistence carries it: the generated
 * manifest (the artifact the export kit ships) plus its licence, never the
 * face bytes (pins re-fetch them). */
export interface InstalledFont {
  readonly packId: string;
  /** The `fontFamily` value that selects this family. */
  readonly familyId: string;
  /** The upstream display name, for chrome only. */
  readonly displayName: string;
  /** The generated `manifest.yml` text — the artifact the export kit ships. */
  readonly manifest: string;
  readonly licenseFile: string;
  readonly licenseText: string;
}

/** The `init:fonts` context: contribute a boot-scoped font source. Sources are
 * consulted in contribution order, BEFORE the per-session picked-font library
 * (which stays session-scoped and never rides the registry). */
export interface FontsInitContext {
  addSource(source: FontSource): void;
}

/** The host-side collector behind an `init:fonts` emit: hand `ctx` to `emit`,
 * `close()` when the emit settles, then read `sources()`. A contribution after
 * close throws — the boot composition is not mutable after boot. */
export interface FontsCollector {
  readonly ctx: FontsInitContext;
  close(): void;
  sources(): readonly FontSource[];
}

export function collectFontSources(): FontsCollector {
  const collected: FontSource[] = [];
  let closed = false;
  return {
    ctx: {
      addSource(source) {
        if (closed) {
          throw new Error('init:fonts has already fired — register during the event, not later');
        }
        collected.push(source);
      },
    },
    close() {
      closed = true;
    },
    sources() {
      return [...collected];
    },
  };
}

/** Compose sources into one: each call tries the sources in order and the
 * first fulfilled answer wins; a source's rejection falls through to the next.
 * When every source rejects (or none exist), the last rejection — or a
 * "no source" error — propagates, so a real failure stays visible. */
export function chainFontSources(sources: readonly FontSource[]): FontSource {
  const chained = [...sources];
  async function first<T>(call: (source: FontSource) => Promise<T>, what: string): Promise<T> {
    let lastError: unknown = new Error(`no font source resolved ${what}`);
    for (const source of chained) {
      try {
        return await call(source);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
  return {
    manifest: (packId) => first((source) => source.manifest(packId), `manifest ${packId}`),
    face: (packId, file) => first((source) => source.face(packId, file), `face ${packId}/${file}`),
  };
}
