// The cascade LAYERS below one item — the read half of the effective-style
// mirror (`toolbar/effective` resolves a key over them). Gathering is separated
// from resolution because a multi-key resolution (the toolbar's control set,
// the panel's whole decoration tab) reads the document ONCE and then resolves each key
// against the prepared context.
//
// Every layer read is guarded: a throwing/absent/hostile subtree resolves to an
// empty map, so a malformed document degrades to "unset" instead of crashing
// the toolbar. Registry names are attacker strings, so the named-style lookup
// is own-property-guarded — never a prototype walk.

import { formatPath, parsePath, type ReadFn } from '@shojiku/designer-core';
import { display } from '../panel/itemView';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A guarded read narrowed to a map (`undefined` on a throw — a hostile
 * subtree resolves as unset, never a crash). */
function readRecord(read: ReadFn, path: string): Record<string, unknown> | undefined {
  try {
    return record(read(path));
  } catch {
    return undefined;
  }
}

/** The item's named-styles value for `key`: listed order, LATER wins.
 * Registry names are hostile strings — own-property-guarded lookup only. */
export function namedValue(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  key: string,
): { readonly value: string; readonly styleName: string } | null {
  const names = stringList(item.styleNames);
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i];
    if (!Object.hasOwn(registry, name)) {
      continue;
    }
    const value = display(record(registry[name])?.[key]);
    if (value !== '') {
      return { value, styleName: name };
    }
  }
  return null;
}

/** One level's resolved value (own style over named styles) — the engine's
 * per-item resolution, reused for ancestors. */
export function levelValue(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  key: string,
): string {
  const own = display(record(item.style)?.[key]);
  if (own !== '') {
    return own;
  }
  return namedValue(item, registry, key)?.value ?? '';
}

/** The `container`-typed ancestor items of `path`, innermost first. A path
 * that does not parse contributes none (the item layers still resolve). */
function containerAncestors(read: ReadFn, path: string): Record<string, unknown>[] {
  let segments: ReturnType<typeof parsePath>;
  try {
    segments = parsePath(path);
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (let k = segments.length - 2; k > 0; k--) {
    if (segments[k].kind !== 'index') {
      continue;
    }
    const ancestor = readRecord(read, formatPath(segments.slice(0, k + 1)));
    if (ancestor !== undefined && ancestor.type === 'container') {
      out.push(ancestor);
    }
  }
  return out;
}

/** The cascade layers below one item, read ONCE so a multi-key resolution (the
 * panel's whole 装飾 tab, the toolbar's control set) reads the document a single
 * time. */
export interface CascadeContext {
  readonly item: Record<string, unknown>;
  readonly registry: Record<string, unknown>;
  readonly defaults: Record<string, unknown>;
  readonly ancestors: readonly Record<string, unknown>[];
  /** The engine-default floor (below `defaults.style`): an unset inherited key
   * resolves to this real value with origin `engine`. Empty when the caller
   * threads no floor (the toolbar/panel always do; a bare call resolves the
   * floor-less keys to `unset`, unchanged from before). */
  readonly floor: Readonly<Record<string, unknown>>;
}

/** Gather the cascade layers for the item at `path` (own item, styles registry,
 * `defaults.style`, `container` ancestors, and the engine-default `floor`). A
 * hostile/absent layer resolves to an empty map — the per-key resolver then
 * reads it as unset, never a crash. `floor` is an own-property map keyed by
 * style key (hostile registry/pack strings never reach it — the Designer builds
 * it from a fixed literal + a length-clipped host family). */
export function cascadeContext(
  read: ReadFn,
  path: string,
  floor: Readonly<Record<string, unknown>> = {},
): CascadeContext {
  return {
    item: readRecord(read, path) ?? {},
    registry: readRecord(read, 'styles') ?? {},
    defaults: record(readRecord(read, 'defaults')?.style) ?? {},
    ancestors: containerAncestors(read, path),
    floor,
  };
}
