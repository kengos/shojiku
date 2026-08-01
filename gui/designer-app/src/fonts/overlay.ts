// Composing the locale overlay that tells the engine to load a picked pack.
//
// A locale's `fonts.uses` names the packs to load. The engine deep-merges an
// overlay per key with SEQUENCES REPLACING (not appending), so an overlay that
// adds a pack must restate the WHOLE list — the current `uses` plus the new
// ids. `fonts.default` and `fonts.fallback` are left untouched: the merge keeps
// the base's values for keys the overlay omits, so a picked font is available
// to `fontFamily:` without becoming the locale's default face.
//
// Two shapes arrive here: `null` (a builtin locale like ja-JP, whose overlay we
// create) and an existing pack text (a shipped locale like zh-TW, which is a
// WHOLE pack and must be preserved key-for-key). Parsing and re-emitting the
// existing text keeps everything we do not touch.

import { Document, parseDocument } from 'yaml';

/** The billion-laughs cap for a locale pack text, mirroring designer-core's
 * template read. The pack is our own asset, but it is fetched at runtime. */
const MAX_ALIAS_COUNT = 100;

/** Compose the overlay for a locale, setting `fonts.uses` to exactly `uses`.
 *
 * `existing` is the locale's current overlay text (a shipped pack), or `null`
 * for a builtin with no pack file. The result is always a complete overlay the
 * engine can merge. */
export function composeOverlay(existing: string | null, uses: readonly string[]): string {
  const doc = existing === null ? new Document({}) : parseDocument(existing);
  if (doc.contents === null) {
    doc.contents = doc.createNode({});
  }
  doc.setIn(['fonts', 'uses'], doc.createNode([...uses]));
  return doc.toString({ lineWidth: 0 });
}

/** Read a locale pack's declared `fonts.uses`, for callers that need the base
 * list without asking the engine. Returns `[]` when the text has none (a
 * builtin's overlay may legitimately omit the block). */
export function readUses(text: string): readonly string[] {
  const value = parseDocument(text).toJS({ maxAliasCount: MAX_ALIAS_COUNT }) as unknown;
  const uses = (value as { fonts?: { uses?: unknown } } | null)?.fonts?.uses;
  return Array.isArray(uses) ? uses.filter((id): id is string => typeof id === 'string') : [];
}
