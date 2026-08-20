// The format-reference usage walk: name → the document places that name it.
// The registry section reads a name's reference COUNT for its impact scope
// ("N箇所で使用"), and rename/delete reuse the same walk to LOCATE references
// and rewrite them, which is why a reference is a structured `FormatRef` (the
// op-addressable path + key drill) rather than a display string.
//
// TWO roots, which is what makes this walk different from the named-style one
// it otherwise mirrors:
//
//   1. `sections` — every binding's `format:`, matched GENERICALLY wherever a
//      map carries that key. `Binding.format` is the ONLY `format:` string in
//      the template wire (items, spans, table columns, char grids and the
//      `bindings:` declaration map all hold a `Binding`), so generic matching
//      reproduces every position the engine resolves and stays complete when a
//      new binding position ships.
//   2. `defaults.formats.<type>` — the per-type document default, which sits
//      OUTSIDE `sections` entirely. Its NAME form is a registry reference; its
//      inline `{ pattern }` form is not a reference at all and is skipped.
//
// A registry name can also be named by definitions' `displayFormat:`, in a
// FILE this walk is not given. Those references are simply not rewritten —
// the same silence a style name's unreachable references get (user decision).
//
// Hostile posture matches the style walk: capped materialization, depth + node
// bounds, never throws, a real `Map` (registry names are attacker strings like
// `__proto__`).

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { MAX_USAGE_DEPTH, MAX_USAGE_NODES } from '../styles/usage';
import { FORMAT_DEFAULT_TYPES } from './model';

const FORMAT_KEY = 'format';

/** A clean structural-path key segment — the same identifier shape the path
 * grammar accepts. A ref reached THROUGH a key that does not match is flagged
 * non-addressable, and a rewrite refuses rather than mis-addressing. */
const SAFE_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** One place a format name is written. `path` is the structural path of the
 * map holding it (absent = the document ROOT, which is where the
 * `defaults.formats.<type>` references live); `keys` drills from there to the
 * scalar. Rename dispatches one `setScalar`, delete one `removeKey`. */
export interface FormatRef {
  readonly path?: string;
  readonly keys: readonly string[];
  /** True when every map-key segment of `path` is a clean identifier, so the
   * path round-trips through the structural grammar to exactly this node. */
  readonly addressable: boolean;
}

/** The usage index: `refs` maps a format name to the references naming it;
 * `truncated` is true when the walk hit its depth/node cap and did NOT visit
 * the whole document. */
export interface FormatUsage {
  readonly refs: Map<string, readonly FormatRef[]>;
  readonly truncated: boolean;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

interface Walk {
  nodes: number;
  truncated: boolean;
  readonly refs: Map<string, FormatRef[]>;
}

/** File one reference under the name it holds (a real Map — names are hostile). */
function push(walk: Walk, name: string, ref: FormatRef): void {
  const list = walk.refs.get(name);
  if (list === undefined) {
    walk.refs.set(name, [ref]);
  } else {
    list.push(ref);
  }
}

/** Walk a materialized value, recording `format:` references. A map records its
 * own `format` key when it holds a string, then recurses into every other
 * child; an array recurses per index. A depth / node bound hit sets `truncated`
 * and stops that branch. */
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
    for (let index = 0; index < value.length; index++) {
      walkValue(walk, value[index], `${path}[${index}]`, depth + 1, addressable);
    }
    return;
  }
  const map = record(value);
  if (map === undefined) {
    return;
  }
  const own = map[FORMAT_KEY];
  if (typeof own === 'string' && own.length > 0) {
    push(walk, own, { path, keys: [FORMAT_KEY], addressable });
  }
  for (const [key, child] of Object.entries(map)) {
    if (key === FORMAT_KEY) {
      continue;
    }
    walkValue(walk, child, `${path}.${key}`, depth + 1, addressable && SAFE_SEGMENT.test(key));
  }
}

/** Record the `defaults.formats.<type>` references. Root-addressed through
 * literal key segments, so they are always addressable; the inline
 * `{ pattern }` form is a definition rather than a reference and is skipped. */
function walkDefaults(walk: Walk, defaults: unknown): void {
  const formats = record(record(defaults)?.formats);
  if (formats === undefined) {
    return;
  }
  for (const type of FORMAT_DEFAULT_TYPES) {
    const value = formats[type];
    if (typeof value === 'string' && value.length > 0) {
      push(walk, value, { keys: ['defaults', 'formats', type], addressable: true });
    }
  }
}

/** Build the format-usage index from template text. `null` only when the text
 * does not materialize to a map (malformed YAML, over the size cap, an alias
 * bomb, a non-map root); a valid template with no references yields a
 * `FormatUsage` with an EMPTY map (distinct from the malformed `null`). */
export function buildFormatUsage(source: string): FormatUsage | null {
  let raw: unknown;
  try {
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
  walkDefaults(walk, root.defaults);
  return { refs: walk.refs, truncated: walk.truncated };
}
