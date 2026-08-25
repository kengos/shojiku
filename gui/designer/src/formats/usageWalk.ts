// The recursive half of the format-usage walk (`usage.ts` owns the reference
// shape and the entry point): how one node is visited, and the two pieces of
// CONTEXT a reference needs before it can be judged — the enclosing row scope,
// and the declaration map serving this item's interpolations.
//
// Split out because the walk carries that context through every arm while the
// entry point only needs the roots.

import { ARRAY_SOURCE_TYPES, bindingKey, bindingScope } from '../palette/bindingRefs';
import { record } from '../palette/fieldDisplay';
import type { PaletteGroup } from '../palette/model';
import { MAX_USAGE_DEPTH, MAX_USAGE_NODES } from '../styles/usage';
import { type Declaration, narrowDeclarations } from '../text/declModel';
import { chipFormats } from './chipRefs';
import { datedBinding, datedChip } from './datedBinding';
import type { FormatRef } from './usage';

const FORMAT_KEY = 'format';

/** The ONE item type whose `format:` is not a binding's. `PageNumberItem.format`
 * is a page-number TEMPLATE (`"{page} / {pages}"`, plain substitution in
 * `layout/engine/band.rs`), never a registry name — so recording it would file a
 * junk reference, and a rename could rewrite the template itself. */
const PAGE_NUMBER_TYPE = 'page_number';

/** The sub-template keys under which a source's bindings become row-relative —
 * the same set the picker's scope resolution uses. */
const SCOPE_KEYS = new Set(['columns', 'cell', 'item']);

export const NO_DECLARATIONS: ReadonlyMap<string, Declaration> = new Map();

/** A clean structural-path key segment — the same identifier shape the path
 * grammar accepts. A ref reached THROUGH a key that does not match is flagged
 * non-addressable, and a rewrite refuses rather than mis-addressing. */
const SAFE_SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface Walk {
  nodes: number;
  truncated: boolean;
  readonly refs: Map<string, FormatRef[]>;
  /** The definitions view the dated-binding rule resolves types against;
   * `null` (no definitions) makes every type unresolvable, so the walk
   * degrades to recording everything — its behaviour before the rule. */
  readonly groups: readonly PaletteGroup[] | null;
}

/** Where the walk currently is: the structural position plus that context. */
interface Site {
  readonly path: string;
  readonly depth: number;
  readonly addressable: boolean;
  readonly scope: string | null;
  readonly decls: ReadonlyMap<string, Declaration>;
  /** The scopes a CHIP in this position could resolve against — the ambient
   * one, the enclosing source's own (a `list`'s per-entry text reads its array
   * ENTRY), and document scope (a header label, a `scope: document` escape).
   * See `datedChip`: the walk answers from the whole SET rather than betting
   * on one, because betting can DROP a live reference. */
  readonly scopes: readonly (string | null)[];
}

/** The candidate scopes, most-specific first, with duplicates dropped. */
function scopesFor(ambient: string | null, source: string | null): (string | null)[] {
  return [...new Set<string | null>([ambient, source, null])];
}

/** File one reference under the name it holds (a real Map — names are hostile). */
export function push(walk: Walk, name: string, ref: FormatRef): void {
  const list = walk.refs.get(name);
  if (list === undefined) {
    walk.refs.set(name, [ref]);
  } else {
    list.push(ref);
  }
}

/** Whether the walk may still visit this node; a bound hit sets `truncated`. */
function budget(walk: Walk, depth: number): boolean {
  if (depth > MAX_USAGE_DEPTH || walk.nodes >= MAX_USAGE_NODES) {
    walk.truncated = true;
    return false;
  }
  walk.nodes += 1;
  return true;
}

/** The chip references one interpolated string carries. `keys` is the drill
 * from `site.path` to the string (empty for an array ELEMENT, which has no key
 * to drill through — such a reference is recorded non-addressable so the
 * rewrite refuses whole rather than half-applying). */
function scanText(walk: Walk, text: string, site: Site, keys: readonly string[]): void {
  if (!budget(walk, site.depth)) {
    return;
  }
  const { formats, capped } = chipFormats(text);
  if (capped) {
    // Past `MAX_TEXT_EXPRS` the GUI's parser reads further expressions as
    // literals while the engine keeps interpolating them, so references may
    // sit beyond what this scan can see — and a reference the walk never
    // RECORDS cannot be refused by addressability, since there is nothing to
    // refuse. Marking the whole index truncated is the existing contract for
    // "this walk did not see everything", and it makes rename/delete stand
    // down rather than half-apply.
    walk.truncated = true;
  }
  const named = new Set<string>();
  for (const chip of formats) {
    const decl = site.decls.get(chip.name);
    // Both readings of the name: through its declaration, and as the params
    // key itself — the engine takes the second wherever the declaration map
    // does not reach it (a column label's does not).
    const keys = [...new Set([decl?.key ?? chip.name, chip.name])];
    if (datedChip(walk.groups, site.scopes, keys)) {
      named.add(chip.format);
    }
  }
  const addressable = site.addressable && keys.length > 0;
  for (const name of named) {
    push(walk, name, { path: site.path, keys, addressable, text });
  }
}

/** The scope and declarations this map's CHILDREN see: an array source opens a
 * row scope under its sub-template keys, and an ITEM (anything carrying a
 * `type:`) serves its own `bindings:` map to every string beneath it — spans
 * included, exactly as the engine's declaration resolution does. */
function inner(map: Record<string, unknown>, site: Site): Pick<Site, 'scope' | 'decls'> {
  if (typeof map.type !== 'string') {
    return { scope: site.scope, decls: site.decls };
  }
  const key = bindingKey(map.data);
  return {
    scope: ARRAY_SOURCE_TYPES.has(map.type) && key !== undefined ? key : site.scope,
    decls: narrowDeclarations(map.bindings),
  };
}

/** Walk a materialized value, recording `format:` and chip references. A map
 * records its own `format` key when it holds a string AND the binding it sits
 * on is dated, then recurses into every other child; an array recurses per
 * index. A depth / node bound hit sets `truncated` and stops that branch. */
export function walkValue(walk: Walk, value: unknown, site: Site): void {
  if (!budget(walk, site.depth)) {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const at: Site = { ...site, path: `${site.path}[${index}]`, depth: site.depth + 1 };
      const entry: unknown = value[index];
      if (typeof entry === 'string') {
        scanText(walk, entry, { ...at, addressable: false }, []);
      } else {
        walkValue(walk, entry, at);
      }
    }
    return;
  }
  const map = record(value);
  if (map === undefined) {
    return;
  }
  const own = map[FORMAT_KEY];
  if (
    typeof own === 'string' &&
    own.length > 0 &&
    map.type !== PAGE_NUMBER_TYPE &&
    datedBinding(walk.groups, bindingScope(map, site.scope), bindingKey(map))
  ) {
    push(walk, own, { path: site.path, keys: [FORMAT_KEY], addressable: site.addressable });
  }
  const context = inner(map, site);
  for (const [key, child] of Object.entries(map)) {
    if (key === FORMAT_KEY) {
      continue;
    }
    const scope = SCOPE_KEYS.has(key) ? context.scope : site.scope;
    const at: Site = {
      ...context,
      path: `${site.path}.${key}`,
      depth: site.depth + 1,
      addressable: site.addressable && SAFE_SEGMENT.test(key),
      scope,
      scopes: scopesFor(scope, context.scope),
    };
    if (typeof child === 'string') {
      scanText(walk, child, { ...at, path: site.path }, [key]);
    } else {
      walkValue(walk, child, at);
    }
  }
}
