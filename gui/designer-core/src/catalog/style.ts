// The style reads over the key catalog (see `defs.ts`): which style keys a
// surface takes, and what the engine says about each one.

import { defs, itemBranch } from './defs';

/** What the engine says about one `Style` key. */
export interface StyleKeyFacts {
  /** The value it takes at the document root when nothing authors it, in its
   * wire form; `undefined` where absence is the value (no fill, no family). */
  readonly initial: unknown;
  readonly inherited: boolean;
  /** The bounds a numeric key is held to (on the resolved pt for a length);
   * a value outside them is replaced by the engine, with a warning. */
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly maximum?: number;
}

/** Every `Style` key the engine takes, in the catalog's (alphabetical) order. */
export function styleKeys(): readonly string[] {
  return Object.keys(defs().Style.properties);
}

/** The engine's facts for one `Style` key, or `undefined` for a key it does not
 * take. */
export function styleKeyFacts(key: string): StyleKeyFacts | undefined {
  const { properties } = defs().Style;
  if (!Object.hasOwn(properties, key)) {
    return undefined;
  }
  const node = properties[key];
  return {
    initial: node['x-shojiku-initial'],
    inherited: node['x-shojiku-inherited'] === true,
    minimum: node.minimum,
    exclusiveMinimum: node.exclusiveMinimum,
    maximum: node.maximum,
  };
}

/** The style keys that change what an item of `type` draws — painted by it, or
 * inherited into what it holds — in `Style` field order. Empty for a type that
 * takes no `style:` (a `line` strokes with its own shape) or that the catalog
 * does not know. */
export function itemStyleKeys(type: string): readonly string[] {
  return itemBranch(type)?.['x-shojiku-style-keys'] ?? [];
}

/** The style keys a rich-text span paints with, in `Style` field order. */
export function spanStyleKeys(): readonly string[] {
  return defs().Span['x-shojiku-style-keys'];
}

/** Where an item of `type` starts a style key somewhere other than its root
 * initial value (a form mark's 1 pt outline, a table's middle-aligned cells).
 * A `null` value means the item derives it (a char_grid sizes its glyphs from
 * the cell). */
export function itemInitialOverrides(type: string): Readonly<Record<string, unknown>> {
  return itemBranch(type)?.['x-shojiku-initial-overrides'] ?? {};
}
