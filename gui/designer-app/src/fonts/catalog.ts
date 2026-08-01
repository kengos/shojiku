// The Google-Fonts catalog snapshot: type views + the picker's search.
//
// The snapshot is generated at authoring time by `scripts/gen-font-catalog.py`
// and served as a static asset, so the picker never calls a font API at runtime
// — it searches this list and fetches only the bytes the user actually picks.
// Every URL in it is pinned to one google/fonts commit, which is what lets a
// generated pack's sha256 stay true (a moving URL would break the pin).
//
// Pure over the parsed snapshot: no fetch, no DOM.

import { isSafeAssetName } from '../assets/paths';

/** The only licences a generated pack may claim. `buildManifest` writes
 * `redistributable: true` on this basis, so it is enforced at RUNTIME against
 * the fetched snapshot — not just by the type — like every other field the
 * picker depends on. */
const ALLOWED_LICENSES: readonly string[] = ['OFL-1.1', 'Apache-2.0'];

/** One face of a family, as the snapshot records it. The variant keys mirror
 * the engine's manifest wire (absent = normal), and only the four faces the
 * engine can select are ever present. */
export interface CatalogFace {
  readonly file: string;
  readonly url: string;
  readonly weight?: 'bold';
  readonly style?: 'italic';
}

export interface CatalogFamily {
  /** The google/fonts directory name; also the generated pack/family id stem. */
  readonly id: string;
  /** The upstream display name (`Noto Sans JP`) — shown, never used as an id. */
  readonly family: string;
  readonly category: string;
  /** Google's popularity RANK (1 = most popular) — the default sort, so the
   * first screen shows fonts people actually use, not the alphabet. Optional
   * so an older snapshot still works (unranked sorts last). */
  readonly popularity?: number;
  readonly subsets: readonly string[];
  readonly license: 'OFL-1.1' | 'Apache-2.0';
  readonly licenseFile: string;
  readonly licenseUrl: string;
  readonly faces: readonly CatalogFace[];
}

export interface FontCatalog {
  readonly version: 1;
  /** The google/fonts commit every URL in this snapshot is pinned to. */
  readonly ref: string;
  readonly families: readonly CatalogFamily[];
}

/** How many families the picker lists at once. The snapshot holds ~1300; a
 * search that matches most of them must not render every card. */
export const MAX_RESULTS = 60;

/** Whether a snapshot entry is structurally usable. The snapshot is a build
 * artifact, but it is fetched at runtime like any asset, so the picker re-checks
 * what it depends on rather than trusting the file: ids must pass the same
 * charset guard as any other asset name (they become URL segments and pack
 * directory names), and a family with no faces has nothing to install. */
export function isUsableFamily(family: CatalogFamily): boolean {
  return (
    isSafeAssetName(family.id) &&
    isSafeAssetName(family.licenseFile) &&
    ALLOWED_LICENSES.includes(family.license) &&
    family.faces.length > 0 &&
    family.faces.every((face) => isSafeAssetName(face.file))
  );
}

/** Sort key: popularity rank ascending (1 = most popular), unranked last,
 * ties broken by id so the order is deterministic whatever the snapshot's
 * file order. */
function byPopularity(a: CatalogFamily, b: CatalogFamily): number {
  const rankA = a.popularity ?? Number.MAX_SAFE_INTEGER;
  const rankB = b.popularity ?? Number.MAX_SAFE_INTEGER;
  return rankA !== rankB ? rankA - rankB : a.id.localeCompare(b.id);
}

/** Filter the catalog for the picker: a case-insensitive substring match on the
 * display name, optionally narrowed to one subset, sorted by popularity, and
 * capped at `MAX_RESULTS` — so the empty query shows the subset's most-used
 * fonts first and search reaches the whole catalog. */
export function searchFamilies(
  catalog: FontCatalog,
  query: string,
  subset?: string,
): readonly CatalogFamily[] {
  const needle = query.trim().toLowerCase();
  const matches = catalog.families.filter(
    (family) =>
      isUsableFamily(family) &&
      (subset === undefined || family.subsets.includes(subset)) &&
      (needle === '' || family.family.toLowerCase().includes(needle)),
  );
  return matches.sort(byPopularity).slice(0, MAX_RESULTS);
}

/** Look up a family by snapshot id; `undefined` when absent or unusable. */
export function familyById(catalog: FontCatalog, id: string): CatalogFamily | undefined {
  const family = catalog.families.find((f) => f.id === id);
  return family !== undefined && isUsableFamily(family) ? family : undefined;
}

/** The subsets present across the catalog, sorted — the picker's filter list. */
export function catalogSubsets(catalog: FontCatalog): readonly string[] {
  const seen = new Set<string>();
  for (const family of catalog.families) {
    for (const subset of family.subsets) {
      seen.add(subset);
    }
  }
  return [...seen].sort();
}
