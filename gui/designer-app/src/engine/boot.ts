// Engine bootstrap: prepare a wasm Engine for the browser preview by injecting
// the locale's PRIMARY font packs and running the lenient subset load, so the
// first paint never blocks on the heavy rare-glyph fallback. Pure over an
// already-constructed engine + an injected FontSource, so it is unit-coverable
// against a fake engine; the real Engine comes from wasmModule.ts (browser) or
// the node integration test.

import type { FontIndex } from '../assets/manifest';
import type { ByteProgress } from '../loading/progress';
import { defaultFamilyFrom, familiesFromManifest } from './families';
import { type FontSource, packIdsByTier } from './fontSource';
import type { WasmFullEngine } from './wasmModule';

/** The capability the subset (lenient) load path requires. Gated on the parsed
 * key list, never a version sniff. */
export const SUBSET_CAPABILITY = 'wasm.fonts.subset';

export interface BootParams {
  readonly engine: WasmFullEngine;
  /** The engine's capability keys (parsed from the static `capabilities()`). */
  readonly capabilities: readonly string[];
  /** BCP 47 locale tag driving the pack chain (e.g. `ja-JP`). */
  readonly localeTag: string;
  readonly localeOverlay?: string | null;
  readonly index: FontIndex;
  readonly fonts: FontSource;
  /** Reports the cumulative face bytes injected so far, against the total the
   * index says the primary packs will transfer. Called once with `loaded: 0`
   * before the first fetch (so a bar can show its total immediately) and again
   * as each face lands. Optional: the node integration tests and the boot's own
   * unit tests do not always care. */
  readonly onProgress?: (progress: ByteProgress) => void;
}

export interface BootResult {
  /** The pack ids the subset load skipped (declared by the locale but not yet
   * injected) — the gate the preview loop upgrades on `missing_glyph`. */
  readonly absentPackIds: readonly string[];
  /** The full set of the locale's fetchable packs (primary + lazy). The
   * engine CONSUMES injected packs on each load, so an upgrade must re-inject
   * this whole set, not just the absent ones — this is the re-inject list. */
  readonly packIds: readonly string[];
  /** The authorable `fontFamily` values across the locale's packs (lazy ones
   * included — authoring a lazy family rides the `unknown_font_family`
   * upgrade), in pack/face order. Seeds the format toolbar's family
   * dropdown. */
  readonly familyIds: readonly string[];
  /** The locale's DEFAULT `fontFamily` — the engine's `fonts.default` face
   * resolved to its family (the document-defaults seed + cascade-mirror floor,
   * so an unset family shows the real face). Derived from the locale pack's
   * `fonts.default` when it ships one, else the first authorable family (the
   * builtin-locale convention: the default face is the first pack's regular
   * face). `undefined` only when the locale offers no families at all. */
  readonly defaultFamily: string | undefined;
}

/** A boot-time failure (capability missing, or a needed pack absent from the
 * index). Distinct from a document diagnostic — it is a host/build problem. */
export class BootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootError';
  }
}

/** The default when a caller does not want progress — a real (called) function,
 * so the optional callback needs no `?.` at each report site. */
const NO_PROGRESS = (): void => {};

/** Face byte sizes for the given packs, keyed `<packId>/<file>`.
 *
 * A Map, not a plain object: the file names come from a fetched `manifest.yml`,
 * so a hostile face name (`constructor`) must not resolve through a prototype.
 * Built by walking the index and filtering, so there is no lookup-by-id that
 * could miss. */
function faceSizes(index: FontIndex, packIds: readonly string[]): Map<string, number> {
  const wanted = new Set(packIds);
  const sizes = new Map<string, number>();
  for (const [packId, pack] of Object.entries(index.packs)) {
    if (!wanted.has(packId)) {
      continue;
    }
    for (const [file, entry] of Object.entries(pack.files)) {
      sizes.set(`${packId}/${file}`, entry.size);
    }
  }
  return sizes;
}

/** Inject the primary packs and run the lenient subset load. The lazy (heavy)
 * packs are deliberately NOT injected here — the subset load reports them as
 * absent and the preview loop fetches them on demand.
 *
 * The byte total comes from the INDEX rather than from the transfers: the engine
 * asks for every face a pack's manifest declares, and the index is built from
 * the same pack directory, so the two coincide for every shipped pack. Deriving
 * it up front is what keeps the reported ratio monotonic — discovering the total
 * pack by pack would make the bar jump backwards as it grew. If the two ever
 * diverged, an unfetched indexed face would leave the bar short of 100%, never
 * past it; the stage transition is what marks the fonts stage done. */
export async function bootEngine(params: BootParams): Promise<BootResult> {
  const {
    engine,
    capabilities,
    localeTag,
    localeOverlay,
    index,
    fonts,
    onProgress = NO_PROGRESS,
  } = params;
  if (!capabilities.includes(SUBSET_CAPABILITY)) {
    throw new BootError(`engine lacks the ${SUBSET_CAPABILITY} capability`);
  }
  engine.setLocale(localeTag, localeOverlay ?? null);

  const neededList = JSON.parse(engine.fontPacksNeeded()) as string[];
  const needed = new Set(neededList);
  const manifests = new Map<string, string>();
  const primary = packIdsByTier(index, 'primary').filter((id) => needed.has(id));
  const sizes = faceSizes(index, primary);
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  let loaded = 0;
  onProgress({ loaded, total });
  for (const packId of primary) {
    const manifest = await fonts.manifest(packId);
    manifests.set(packId, manifest);
    engine.addFontPack(packId, manifest);
    const files = JSON.parse(engine.fontFilesNeeded(packId)) as string[];
    for (const file of files) {
      engine.addFontFile(packId, file, await fonts.face(packId, file));
      // A face the index does not carry contributes nothing rather than
      // throwing: the fetch above already refused an unindexed face, so this
      // only covers an index/manifest divergence.
      loaded += sizes.get(`${packId}/${file}`) ?? 0;
      onProgress({ loaded, total });
    }
  }

  const absent = JSON.parse(engine.loadFontsSubset()) as string[];
  const packIds = neededList.filter((id) => Object.hasOwn(index.packs, id));
  // The family dropdown's seed: every locale pack's authorable families, lazy
  // packs included (their manifests are a small fetch; the face bytes stay
  // lazy). A manifest fetch failure just offers fewer names — never a boot
  // failure.
  const familyIds: string[] = [];
  for (const packId of packIds) {
    let manifest = manifests.get(packId);
    if (manifest === undefined) {
      try {
        manifest = await fonts.manifest(packId);
      } catch {
        continue;
      }
      manifests.set(packId, manifest);
    }
    for (const family of familiesFromManifest(manifest)) {
      if (!familyIds.includes(family)) {
        familyIds.push(family);
      }
    }
  }
  // The locale's default family: exact from the pack's `fonts.default` when it
  // ships one (zh-TW/…), else the first authorable family (a builtin locale —
  // ja-JP/en-US — whose default face is the first pack's regular face).
  const defaultFamily =
    defaultFamilyFrom(localeOverlay ?? null, manifests.values()) ?? familyIds[0];
  return { absentPackIds: absent, packIds, familyIds, defaultFamily };
}
