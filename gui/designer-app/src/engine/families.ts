// Pure extraction of the authorable `fontFamily` values a font pack's
// manifest declares: each face's `family` (a bold/italic variant's parent) or,
// absent that, its `id` (the regular face IS the family). Feeds the format
// toolbar's family dropdown via the boot result — display/authoring strings
// only, never used to compose a URL or path. A malformed manifest yields an
// empty list (the dropdown just offers less), never a throw.

import { parseDocument } from 'yaml';

/** Alias-bomb guard for the (small, assembly-generated) manifest parse. */
const MAX_ALIAS_COUNT = 64;

/** A sane cap on a family id offered to the dropdown; anything longer is a
 * corrupt/hostile manifest entry and is skipped. */
const MAX_FAMILY_CHARS = 120;

/** Parse a small (assembly-generated / shipped) YAML asset to a plain JS map,
 * alias-bomb-capped. `null` on any parse failure or a non-map root. */
function parseMap(text: string): Record<string, unknown> | null {
  let root: unknown;
  try {
    root = parseDocument(text).toJS({ maxAliasCount: MAX_ALIAS_COUNT }) as unknown;
  } catch {
    return null;
  }
  return typeof root === 'object' && root !== null && !Array.isArray(root)
    ? (root as Record<string, unknown>)
    : null;
}

/** A face's authorable family (`family ?? id`, capped), or `null`. */
function faceFamily(face: unknown): string | null {
  if (typeof face !== 'object' || face === null || Array.isArray(face)) {
    return null;
  }
  const record = face as Record<string, unknown>;
  const value = typeof record.family === 'string' ? record.family : record.id;
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FAMILY_CHARS
    ? value
    : null;
}

/** The locale pack's declared default FACE id (`fonts.default`). `null` for a
 * builtin locale (no pack text), a malformed pack, or an out-of-bounds value.
 * Read by `===` comparison only — a hostile `default: __proto__` never indexes
 * a table, it simply matches no face. */
function defaultFaceId(localePackText: string): string | null {
  const fonts = parseMap(localePackText)?.fonts;
  if (typeof fonts !== 'object' || fonts === null || Array.isArray(fonts)) {
    return null;
  }
  const def = (fonts as Record<string, unknown>).default;
  return typeof def === 'string' && def.length > 0 && def.length <= MAX_FAMILY_CHARS ? def : null;
}

/** The locale's DEFAULT `fontFamily`: its pack's `fonts.default` face id resolved
 * to that face's family (`family ?? id`) across the pack manifests. Feeds the
 * document-defaults seed + the cascade mirror's engine-default floor, so an unset
 * `fontFamily` shows the real face the engine paints with. `undefined` when the
 * locale ships no pack text (a builtin — the caller falls back to the first
 * authorable family), the pack is malformed, or the face is in no manifest. The
 * face id is matched by `===`, never used to index a manifest object, so a
 * hostile `default` string is inert. */
export function defaultFamilyFrom(
  localePackText: string | null,
  manifests: Iterable<string>,
): string | undefined {
  if (localePackText === null) {
    return undefined;
  }
  const faceId = defaultFaceId(localePackText);
  if (faceId === null) {
    return undefined;
  }
  for (const manifest of manifests) {
    const faces = parseMap(manifest)?.faces;
    if (!Array.isArray(faces)) {
      continue;
    }
    for (const face of faces) {
      if (
        typeof face === 'object' &&
        face !== null &&
        !Array.isArray(face) &&
        (face as Record<string, unknown>).id === faceId
      ) {
        const family = faceFamily(face);
        if (family !== null) {
          return family;
        }
      }
    }
  }
  return undefined;
}

/** The distinct families a manifest's faces declare, in face order. */
export function familiesFromManifest(manifest: string): readonly string[] {
  const faces = parseMap(manifest)?.faces;
  if (!Array.isArray(faces)) {
    return [];
  }
  const out: string[] = [];
  for (const face of faces) {
    const family = faceFamily(face);
    if (family !== null && !out.includes(family)) {
      out.push(family);
    }
  }
  return out;
}
