// What the DOCUMENT says a border is: the engine's `borderWidth`/`borderColor`/
// `borderStyle` are each a SCALAR (all four sides) OR a per-side
// `{ top/right/bottom/left }` map, and they are NON-inherited (cascade =
// own > named styles only). The panel's generic style resolution
// (`effective.ts`) flattens every value through `display()`, which drops a map
// to `''` — so borders need this dedicated resolver.
//
// Reads resolve the cascade-EFFECTIVE per-side state (for the diagram) plus the
// item's OWN raw form and the below-own cascade (which `borderOps` needs for
// minimal-wire writes). The cascade primitives are shared with `borderRadius`,
// which resolves the same own > named-styles chain for a single length.

import type { ReadFn } from '@shojiku/designer-core';
import { allBlank, type SideMap, uniform } from './borderSides';
import type { BorderProp, BorderView } from './borderTypes';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A finite, non-negative width; anything else (negative, non-finite, string,
 * array) reads as 0 = off — a hostile in-memory value never crashes the read. */
function sideWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** A string side value (color/style); anything else reads as `''` = unset. */
function sideString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Parse a raw `borderWidth` value into per-side numbers. Scalar → all sides;
 * map → per side (missing/hostile side = 0); anything else → all 0. */
function parseWidth(raw: unknown): SideMap<number> {
  if (typeof raw === 'number') {
    return uniform(sideWidth(raw));
  }
  const map = record(raw);
  if (map === undefined) {
    return uniform(0);
  }
  return {
    top: sideWidth(map.top),
    right: sideWidth(map.right),
    bottom: sideWidth(map.bottom),
    left: sideWidth(map.left),
  };
}

/** Parse a raw `borderColor`/`borderStyle` value into per-side strings. */
function parseStr(raw: unknown): SideMap<string> {
  if (typeof raw === 'string') {
    return uniform(raw);
  }
  const map = record(raw);
  if (map === undefined) {
    return uniform('');
  }
  return {
    top: sideString(map.top),
    right: sideString(map.right),
    bottom: sideString(map.bottom),
    left: sideString(map.left),
  };
}

/** The item's own raw value for a border key (`undefined` = the key is absent
 * from the item's own `style`). */
export function ownValue(item: Record<string, unknown>, key: string): unknown {
  return record(item.style)?.[key];
}

/** The below-own (named-style) raw value for a border key: listed order, LATER
 * wins. Registry names are hostile strings — own-property-guarded lookup only. */
export function namedValue(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  key: string,
): { readonly raw: unknown; readonly styleName: string } | null {
  const names = stringList(item.styleNames);
  for (let i = names.length - 1; i >= 0; i--) {
    const name = names[i];
    if (!Object.hasOwn(registry, name)) {
      continue;
    }
    const raw = record(registry[name])?.[key];
    if (raw !== undefined) {
      return { raw, styleName: name };
    }
  }
  return null;
}

/** Resolve one border property over the item + registry, parsed with `parse`. */
function resolveProp<T>(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  key: string,
  parse: (raw: unknown) => SideMap<T>,
): BorderProp<T> {
  const ownRaw = ownValue(item, key);
  const ownPresent = ownRaw !== undefined;
  const named = namedValue(item, registry, key);
  const cascade = parse(named?.raw);
  if (ownPresent) {
    return { effective: parse(ownRaw), origin: 'own', styleName: '', ownRaw, ownPresent, cascade };
  }
  if (named !== null) {
    return {
      effective: cascade,
      origin: 'style',
      styleName: named.styleName,
      ownRaw,
      ownPresent: false,
      cascade,
    };
  }
  return {
    effective: parse(undefined),
    origin: 'unset',
    styleName: '',
    ownRaw,
    ownPresent: false,
    cascade,
  };
}

export function readRecord(read: ReadFn, path: string): Record<string, unknown> {
  try {
    return record(read(path)) ?? {};
  } catch {
    return {};
  }
}

/** Resolve the full border view for the item at `path`. */
export function readBorder(read: ReadFn, path: string): BorderView {
  const item = readRecord(read, path);
  const registry = readRecord(read, 'styles');
  return {
    width: resolveProp(item, registry, 'borderWidth', parseWidth),
    color: resolveProp(item, registry, 'borderColor', parseStr),
    style: resolveProp(item, registry, 'borderStyle', parseStr),
  };
}

/** Whether the item draws any border at all (any side with a width). */
export function hasAnyBorder(view: BorderView): boolean {
  return !allBlank(view.width.effective, 0);
}
