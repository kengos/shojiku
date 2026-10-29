// The `FieldSpec` vocabulary (see `fieldSpec.ts`), and the kinds a node with
// one scalar `type` reads as.

import type { CatalogNode } from './defs';

/** The bounds a number is held to, on the resolved pt for a length. */
export interface FieldBounds {
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly maximum?: number;
}

/** What control edits a value. `null` (absent) is never a kind of its own: a
 * nullable node takes its non-null arm's kind, and clearing removes the key. */
export type FieldSpec =
  /** A closed set of strings (`enum`, or a `oneOf` of string `const`s). */
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  /** A `$ref` to `Length`: a pt number or a length string. */
  | { readonly kind: 'length'; readonly bounds: FieldBounds }
  /** A number. An `integer` reads as one too, with no mark of its own: today
   * no listed surface has an integer key, so a renderer that comes to one
   * must step it by whole numbers itself. */
  | { readonly kind: 'number'; readonly bounds: FieldBounds }
  /** A number marked `x-shojiku-value-kind: fraction`: 0 to 1, shown as %. */
  | { readonly kind: 'percent' }
  | { readonly kind: 'boolean' }
  /** A string marked `x-shojiku-value-kind: color`: an `#rrggbb` string. */
  | { readonly kind: 'color' }
  /** A string marked `x-shojiku-ref`: it names something defined elsewhere
   * (`dataKey`, `format`, `style`, `item`). */
  | { readonly kind: 'ref'; readonly ref: string }
  /** Any other string. */
  | { readonly kind: 'text' }
  /** One value for all four sides, or a `top`/`right`/`bottom`/`left` map;
   * `scalar` is the one-value arm's kind. */
  | { readonly kind: 'sides'; readonly scalar: FieldSpec }
  /** A `$ref` the caller edits with its own editor, named by `$defs` name. */
  | { readonly kind: 'composite'; readonly name: string }
  /** An `additionalProperties` map of named entries, each an object of
   * `entry` fields. */
  | { readonly kind: 'map'; readonly entry: readonly CatalogField[] }
  /** Anything else: shown, never written. */
  | { readonly kind: 'opaque' };

/** One key of an object node, with what the engine says about it. */
export interface CatalogField {
  readonly key: string;
  readonly spec: FieldSpec;
  /** The capability key a host must report for the key to exist;
   * `undefined` = always on. */
  readonly capability: string | undefined;
  /** Whether the object is invalid without it. */
  readonly required: boolean;
  /** The value absence stands for, in wire form; `undefined` = none stated. */
  readonly initial: unknown;
}

export const OPAQUE: FieldSpec = { kind: 'opaque' };

/** The kind of a node whose `type` is the one scalar `type`. */
export function scalarSpec(node: CatalogNode, type: string | undefined): FieldSpec {
  switch (type) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'number':
    case 'integer':
      return node['x-shojiku-value-kind'] === 'fraction'
        ? { kind: 'percent' }
        : { kind: 'number', bounds: boundsOf(node) };
    case 'string':
      return stringSpec(node);
    default:
      return OPAQUE;
  }
}

function stringSpec(node: CatalogNode): FieldSpec {
  if (node['x-shojiku-value-kind'] === 'color') {
    return { kind: 'color' };
  }
  const ref = node['x-shojiku-ref'];
  return ref === undefined ? { kind: 'text' } : { kind: 'ref', ref };
}

/** The one type a `type` keyword names besides `null`, if exactly one. */
export function nonNullType(type: CatalogNode['type']): string | undefined {
  const types = (typeof type === 'string' ? [type] : (type ?? [])).filter((t) => t !== 'null');
  return types.length === 1 ? types[0] : undefined;
}

export function boundsOf(node: CatalogNode): FieldBounds {
  return { minimum: node.minimum, exclusiveMinimum: node.exclusiveMinimum, maximum: node.maximum };
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
