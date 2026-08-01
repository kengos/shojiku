// The shared named-style usage walk: name → the document references that name
// it. The format toolbar's style picker reads a name's reference COUNT for the
// impact scope ("N箇所で使用中"); the document-defaults / styles panel reuses
// the same walk to LOCATE references for rename/delete, which is why a reference
// is a structured `StyleRef` (the op-addressable map path + the wire key + the
// current name list), not a synthesized display path. A rename/delete rewrites
// each ref with `{ path, keys: [ref.key] }`.
//
// The walk is GENERIC over the `sections` subtree, matching both wire keys
// (`styleNames` and the table row's `alternateStyleNames`) wherever they
// appear. Generic matching reproduces every position the engine's own
// reference check visits (items, spans, mark, container/repeat/repeat_flow
// descent, table row/header/columns/column-cell, header/footer) and stays
// complete when a new position ships — no per-item dispatch to keep in sync.
//
// `truncated` is load-bearing for rename/delete: today's caps stop the walk
// silently on a hostile/huge document, so a rewrite driven by a PARTIAL usage
// map would rename some references and miss others (the half-rename hazard).
// The styles panel refuses the whole operation when `truncated` is set.
//
// Hostile posture matches `buildTree`: capped materialization, depth + node
// bounds, never throws, a real `Map` (style names are attacker strings like
// `__proto__`).

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';

/** Nesting cap — bounds hostile deep nesting / cyclic materialized structure. */
export const MAX_USAGE_DEPTH = 32;

/** Total node cap — bounds the work a hostile/huge document can demand. */
export const MAX_USAGE_NODES = 1024;

const PRIMARY_KEY = 'styleNames';
const ALTERNATE_KEY = 'alternateStyleNames';

/** A clean structural-path key segment: the same identifier shape the path
 * grammar accepts. A map key that does NOT match (a `.`/`[`/space/unicode key)
 * makes an interpolated path either unparseable OR — for an embedded dot —
 * silently ambiguous (it re-splits into two keys), so a ref reached THROUGH
 * such a key is flagged non-addressable and a rewrite must refuse it. */
const SAFE_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The wire key an array of style names is stored under. */
export type StyleRefKey = typeof PRIMARY_KEY | typeof ALTERNATE_KEY;

/** One reference to (potentially several) named styles: the structural `path`
 * of the MAP holding the key — op-addressable as `{ path, keys: [key] }` — the
 * wire `key`, and the current string entries of the array. Rename/delete
 * recompute a new `names` list and dispatch one `setStrings`/`removeKey`. */
export interface StyleRef {
  readonly path: string;
  readonly key: StyleRefKey;
  readonly names: readonly string[];
  /** True when every map-key segment of `path` is a clean identifier, so the
   * path round-trips through the structural grammar to exactly this node. A
   * hostile key along the path makes it ambiguous/unparseable — a rewrite
   * refuses rather than mis-addressing a different node. */
  readonly addressable: boolean;
}

/** The usage index: `refs` maps a style name to the references containing it
 * (its impact scope is `refs.get(name)?.length`); `truncated` is true when the
 * walk hit its depth/node cap and did NOT visit the whole document. */
export interface StyleUsage {
  readonly refs: Map<string, readonly StyleRef[]>;
  readonly truncated: boolean;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Mutable walk state: the node budget, the truncation flag, and the
 * accumulating name → refs map. */
interface Walk {
  nodes: number;
  truncated: boolean;
  readonly refs: Map<string, StyleRef[]>;
}

/** Record one style-name array at `path`/`key`: build a single `StyleRef` and
 * file it under each DISTINCT name it lists (a real Map — names are hostile).
 * A non-array value or an array with no string entries records nothing. */
function recordArray(
  walk: Walk,
  value: unknown,
  path: string,
  key: StyleRefKey,
  addressable: boolean,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  const names = value.filter((entry): entry is string => typeof entry === 'string');
  if (names.length === 0) {
    return;
  }
  const ref: StyleRef = { path, key, names, addressable };
  for (const name of new Set(names)) {
    const list = walk.refs.get(name);
    if (list === undefined) {
      walk.refs.set(name, [ref]);
    } else {
      list.push(ref);
    }
  }
}

/** Walk a materialized value, recording style-name references. A map records
 * its own `styleNames` and `alternateStyleNames` (both keyed at the map's own
 * path — the wire key on the `StyleRef` distinguishes them, so a child map
 * literally named `alternate` can never be confused with a row's alternate
 * slot), then recurses into every other child; an array recurses per index.
 * A depth / node bound hit sets `truncated` and stops that branch. */
function walkValue(
  walk: Walk,
  value: unknown,
  path: string,
  depth: number,
  addressable: boolean,
): void {
  if (depth > MAX_USAGE_DEPTH || walk.nodes >= MAX_USAGE_NODES) {
    walk.truncated = true;
    return;
  }
  walk.nodes += 1;
  if (Array.isArray(value)) {
    // An index segment is always a clean path segment — the safety of the path
    // is unchanged by descending into a sequence.
    for (let index = 0; index < value.length; index++) {
      walkValue(walk, value[index], `${path}[${index}]`, depth + 1, addressable);
    }
    return;
  }
  const map = record(value);
  if (map === undefined) {
    return;
  }
  recordArray(walk, map[PRIMARY_KEY], path, PRIMARY_KEY, addressable);
  recordArray(walk, map[ALTERNATE_KEY], path, ALTERNATE_KEY, addressable);
  for (const [key, child] of Object.entries(map)) {
    if (key === PRIMARY_KEY || key === ALTERNATE_KEY) {
      continue;
    }
    walkValue(walk, child, `${path}.${key}`, depth + 1, addressable && SAFE_SEGMENT.test(key));
  }
}

/** Build the style-usage index from template text. `null` only when the text
 * does not materialize to a map (malformed YAML, over the size cap, an alias
 * bomb, a non-map root); a valid template with no references yields a
 * `StyleUsage` with an EMPTY map (distinct from the malformed `null`). */
export function buildStyleUsage(source: string): StyleUsage | null {
  let raw: unknown;
  try {
    // Editor-held text (an image can push it past the 2 MiB default) → ceiling.
    raw = readTemplate(parseTemplate(source, MAX_TEMPLATE_BYTES_CEILING));
  } catch {
    return null;
  }
  const root = record(raw);
  if (root === undefined) {
    return null;
  }
  const walk: Walk = { nodes: 0, truncated: false, refs: new Map() };
  walkValue(walk, root.sections, 'sections', 0, true);
  return { refs: walk.refs, truncated: walk.truncated };
}
