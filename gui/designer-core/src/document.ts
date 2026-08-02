// The template document: the YAML source held as an `eemeli/yaml` CST Document
// so edits preserve comments, key order, and formatting (round-trip fidelity is
// the adoption gate). Parsing the CST holds anchors/aliases as nodes without
// expanding them, so it is inherently bomb-safe; alias expansion (and the cap
// that guards against "billion laughs") happens only when a value view is
// materialized in `readTemplate`.

import { type Document, isNode, parseDocument } from 'yaml';

export class TemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

/** Default cap on template source size (bytes). Templates are small; this
 * bounds the parser against a hostile multi-megabyte document. The cap is
 * configurable (inline images push a template past it) but never disappears —
 * a raised limit is clamped to `MAX_TEMPLATE_BYTES_CEILING`. */
export const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;

/** Absolute upper bound on the configurable template-size cap (bytes). A host
 * or editor may raise the limit toward this ceiling to hold inline images, but
 * never past it: the hostile-input bound is fixed. Aligned with the engine's
 * per-asset `AssetPolicy` default (8 MiB), so no single inlined image can
 * exceed what the engine would itself accept. */
export const MAX_TEMPLATE_BYTES_CEILING = 8 * 1024 * 1024;

/** Cap on YAML alias expansions applied when materializing a value view — the
 * `eemeli/yaml` guard against alias-bomb ("billion laughs") inputs. */
export const MAX_ALIAS_COUNT = 100;

/** Clamp a requested template-size cap into `[MAX_TEMPLATE_BYTES,
 * MAX_TEMPLATE_BYTES_CEILING]`. Fail-closed: a non-finite / non-positive
 * request (a hostile host value, a garbage stored pref) resolves to the
 * default, never a larger or absent bound. The editor and the app's cap pref
 * both route through this so the two never drift. */
export function clampTemplateMaxBytes(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return MAX_TEMPLATE_BYTES;
  }
  return Math.min(Math.max(value, MAX_TEMPLATE_BYTES), MAX_TEMPLATE_BYTES_CEILING);
}

/** Parse template source into a CST document under a byte cap. `maxBytes`
 * defaults to `MAX_TEMPLATE_BYTES`; a non-finite / non-positive value falls
 * back to the default, and any value is clamped down to
 * `MAX_TEMPLATE_BYTES_CEILING` (the hostile-input bound is absolute). Throws
 * `TemplateParseError` when the source is over the resolved cap or the YAML is
 * malformed. */
export function parseTemplate(source: string, maxBytes: number = MAX_TEMPLATE_BYTES): Document {
  const limit =
    Number.isFinite(maxBytes) && maxBytes > 0
      ? Math.min(maxBytes, MAX_TEMPLATE_BYTES_CEILING)
      : MAX_TEMPLATE_BYTES;
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > limit) {
    throw new TemplateParseError(`template exceeds ${limit} bytes`);
  }
  const doc = parseDocument(source);
  const [firstError] = doc.errors;
  if (firstError !== undefined) {
    throw new TemplateParseError(firstError.message);
  }
  return doc;
}

/** Serialize a template document to its canonical YAML text — the ONE
 * serialization home for the Designer (snapshots, saves, preset normalization
 * all route through it, never `String(doc)` directly). Folding is disabled
 * (`lineWidth: 0`) so authored long lines survive: the `eemeli/yaml` default
 * folds at 80 columns, which would rewrite large hand-authored templates on
 * the first write. The form this produces is a fixed point —
 * `serializeTemplate(parseTemplate(s)) === s` once `s` is canonical — which the
 * bundled presets are stored at so a template-engineer's first-edit diff stays
 * clean (the adoption gate). */
export function serializeTemplate(doc: Document): string {
  return doc.toString({ lineWidth: 0 });
}

/** A plain-JS read snapshot of the document for the property panel's read side.
 * The CST — not this view — owns round-trip; never serialize this back. Throws
 * `TemplateParseError` if materializing the view exceeds the alias cap (an
 * alias bomb). */
export function readTemplate(doc: Document): unknown {
  try {
    return doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (cause) {
    throw new TemplateParseError(String(cause));
  }
}

/** Materialize the subtree at `yamlPath` (the property panel's per-node read):
 * a missing node reads as `undefined`, a present one as a plain-JS view under
 * the SAME alias cap as `readTemplate` (every materialization is an alias-bomb
 * surface). The view is display-only — never spread or merged into another
 * object, and never serialized back (the CST owns round-trip). Throws
 * `TemplateParseError` when the subtree exceeds the alias cap. */
export function readNode(doc: Document, yamlPath: readonly (string | number)[]): unknown {
  const node = doc.getIn(yamlPath, true);
  if (node === undefined) {
    return undefined;
  }
  if (!isNode(node)) {
    // A RAW scalar leaf, not a node: `map.set(key, value)` stores an op's
    // `ScalarValue` as-is when the key's previous value was a collection (a
    // `columns` track list rewritten to a count), so the pair holds a plain
    // string/number/boolean. It is already the plain-JS view — return it, or a
    // legally-written leaf reads as missing.
    return node;
  }
  try {
    return node.toJS(doc, { maxAliasCount: MAX_ALIAS_COUNT });
  } catch (cause) {
    throw new TemplateParseError(String(cause));
  }
}
