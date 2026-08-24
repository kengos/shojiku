// The format-reference usage walk: name → the document places that name it.
// The registry section reads a name's reference COUNT for its impact scope
// ("N箇所で使用"), and rename/delete reuse the same walk to LOCATE references
// and rewrite them, which is why a reference is a structured `FormatRef` (the
// op-addressable path + key drill) rather than a display string.
//
// THREE roots:
//
//   1. `sections` — every binding's `format:`, matched GENERICALLY wherever a
//      map carries that key. `Binding.format` is the only `format:` string the
//      REGISTRY is reachable from (items, spans, table columns, char grids and
//      the `bindings:` declaration map all hold a `Binding`), so generic
//      matching reproduces every position the engine resolves and stays
//      complete when a new binding position ships. The wire has exactly one
//      other `format:` — `PageNumberItem.format`, a page-number template
//      rather than a name — and the walk skips it by type.
//
//      EVERY string under `sections` is also scanned for `{key:format}` chip
//      references, which the engine resolves through the same dispatch
//      (`chipRefs`). Every string, not every INTERPOLATED string: the engine
//      interpolates a dozen-odd surfaces (item text, span text, link URLs,
//      qr / char-grid / list text, table header labels) and enumerating them
//      would go stale the first time one is added, so the walk scans the lot.
//      A handful of brace-carrying strings are deliberately NOT interpolated —
//      `Binding.placeholder` (drawn verbatim) and a table's `overflow_text`
//      (`{count}` is plain substitution) — and the walk reads those too. That
//      is safe rather than merely tolerable: the dated filter means a false
//      rewrite would need the literal to spell `{<a real dated field key>:<the
//      renamed entry>}`, and it errs toward rewriting, which is visible.
//   2. `document` — the metadata block, interpolated against params like any
//      static text, so it carries chip references too.
//   3. `defaults.formats.<type>` — the per-type document default, which sits
//      OUTSIDE `sections` entirely. Its NAME form is a registry reference; its
//      inline `{ pattern }` form is not a reference at all and is skipped.
//
// WHICH of those are references at all is the structural rule in
// `datedBinding`: the registry is reachable from a dated binding and nothing
// else, so `format: symbol` on a currency binding is that currency's symbol
// variant, not a reference to an entry called `symbol`. The DATED slots of
// `defaults.formats` are references for the same reason; the other four name a
// per-type builtin pick.
//
// A registry name can also be named by definitions' `displayFormat:`, in a
// FILE this walk is not given. Those references are simply not rewritten —
// the same silence a style name's unreachable references get (user decision).
//
// Hostile posture matches the style walk: capped materialization, depth + node
// bounds, never throws, a real `Map` (registry names are attacker strings like
// `__proto__`).

import { MAX_TEMPLATE_BYTES_CEILING, parseTemplate, readTemplate } from '@shojiku/designer-core';
import { record } from '../palette/fieldDisplay';
import type { PaletteGroup } from '../palette/model';
import { FORMAT_KINDS } from './model';
import { NO_DECLARATIONS, push, type Walk, walkValue } from './usageWalk';

/** One place a format name is written. `path` is the structural path of the
 * map holding it (absent = the document ROOT, which is where the
 * `defaults.formats.<type>` references live); `keys` drills from there to the
 * scalar. Rename dispatches one `setScalar`, delete one `removeKey` — except
 * for a CHIP reference, where `text` carries the whole interpolated string the
 * name sits inside: both operations restate that string instead, because the
 * text around the reference has to survive. */
export interface FormatRef {
  readonly path?: string;
  readonly keys: readonly string[];
  /** True when every map-key segment of `path` is a clean identifier, so the
   * path round-trips through the structural grammar to exactly this node. */
  readonly addressable: boolean;
  /** The interpolated string holding this reference (chip references only). */
  readonly text?: string;
}

/** The usage index: `refs` maps a format name to the references naming it;
 * `truncated` is true when the walk hit its depth/node cap and did NOT visit
 * the whole document. */
export interface FormatUsage {
  readonly refs: Map<string, readonly FormatRef[]>;
  readonly truncated: boolean;
}

/** Record the `defaults.formats.<type>` references. Only the DATED slots hold
 * one — `FORMAT_KINDS` is the registry's own kind set, which is exactly the
 * pair the engine consults the registry for. Root-addressed through literal key
 * segments, so they are always addressable; the inline `{ pattern }` form is a
 * definition rather than a reference and is skipped. */
function walkDefaults(walk: Walk, defaults: unknown): void {
  const formats = record(record(defaults)?.formats);
  if (formats === undefined) {
    return;
  }
  for (const type of FORMAT_KINDS) {
    const value = formats[type];
    if (typeof value === 'string' && value.length > 0) {
      push(walk, value, { keys: ['defaults', 'formats', type], addressable: true });
    }
  }
}

/** Build the format-usage index from template text. `groups` is the palette's
 * view of the definitions, which decides which bindings are DATED and so which
 * `format:` values are registry references at all; omitted or `null` it
 * resolves nothing, and every reference is recorded (the walk's behaviour
 * before the rule). `null` result only when the text does not materialize to a
 * map (malformed YAML, over the size cap, an alias bomb, a non-map root); a
 * valid template with no references yields a `FormatUsage` with an EMPTY map
 * (distinct from the malformed `null`). */
export function buildFormatUsage(
  source: string,
  groups: readonly PaletteGroup[] | null = null,
): FormatUsage | null {
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
  const walk: Walk = { nodes: 0, truncated: false, refs: new Map(), groups };
  const base = { depth: 0, addressable: true, scope: null, decls: NO_DECLARATIONS, scopes: [null] };
  walkValue(walk, root.sections, { ...base, path: 'sections' });
  walkValue(walk, root.document, { ...base, path: 'document' });
  walkDefaults(walk, root.defaults);
  return { refs: walk.refs, truncated: walk.truncated };
}
