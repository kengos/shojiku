// How a key is edited, read from its catalog node's shape (see `defs.ts`):
// one `FieldSpec` kind per control a generic property renderer has. Only the
// shape and the `x-shojiku-*` keywords decide the kind — never a key's name —
// so a key the engine adds gets a control without a GUI table naming it.

import { type CatalogNode, defNode, type ObjectNode, refName } from './defs';
import {
  boundsOf,
  type CatalogField,
  type FieldSpec,
  isString,
  nonNullType,
  OPAQUE,
  scalarSpec,
} from './fieldKinds';

/** The `$defs` names a caller edits with editors of its own — anything with
 * `has`, so an editor registry `Map` serves as it is. */
export type CompositeNames = Pick<ReadonlySet<string>, 'has'>;

/** How deep `$ref`s, nullable wrappers, sides arms and map entries nest
 * before a node reads as `opaque` — the catalog's recursive shapes (a data
 * definition's `properties` map of definitions) would otherwise never end. */
export const MAX_SPEC_DEPTH = 8;

const LENGTH = 'Length';
const SIDES = 'bottom,left,right,top';

/** The kind of `node`, with every `$ref` resolved against the catalog. A
 * `$ref` whose `$defs` name is in `composites` stops there as `composite`. */
export function fieldSpec(node: CatalogNode, composites: CompositeNames): FieldSpec {
  return specAt(node, composites, 0);
}

/** The fields `keys` name on `node`, in `keys` order. */
export function objectFields(
  node: ObjectNode,
  keys: readonly string[],
  composites: CompositeNames,
  depth = 0,
): readonly CatalogField[] {
  return keys.map((key) => {
    const child = node.properties[key];
    return {
      key,
      spec: specAt(child, composites, depth),
      capability: child['x-shojiku-capability'],
      required: node.required?.includes(key) === true,
      initial: child['x-shojiku-initial'],
    };
  });
}

function specAt(node: CatalogNode, composites: CompositeNames, depth: number): FieldSpec {
  if (depth > MAX_SPEC_DEPTH) {
    return OPAQUE;
  }
  if (node.$ref !== undefined) {
    return refSpec(node, node.$ref, composites, depth);
  }
  if (node.anyOf !== undefined) {
    return nullableSpec(node, node.anyOf, composites, depth);
  }
  if (node.oneOf !== undefined) {
    return unionSpec(node, node.oneOf, composites, depth);
  }
  if (node.enum !== undefined) {
    return isEnum(node.enum) ? { kind: 'enum', values: node.enum } : OPAQUE;
  }
  return typedSpec(node, composites, depth);
}

/** A `$ref`: a composite or `Length` by name, else the target with the
 * referring node's own keywords (bounds, markers) laid over it. */
function refSpec(
  node: CatalogNode,
  ref: string,
  composites: CompositeNames,
  depth: number,
): FieldSpec {
  const name = refName(ref);
  if (name !== undefined && composites.has(name)) {
    return { kind: 'composite', name };
  }
  if (name === LENGTH) {
    return { kind: 'length', bounds: boundsOf(node) };
  }
  const target = defNode(ref);
  if (target === undefined) {
    return OPAQUE;
  }
  const { $ref: _, ...own } = node;
  return specAt({ ...target, ...own }, composites, depth + 1);
}

/** `anyOf: [X, null]` is a nullable X; any other `anyOf` is opaque. */
function nullableSpec(
  node: CatalogNode,
  anyOf: readonly CatalogNode[],
  composites: CompositeNames,
  depth: number,
): FieldSpec {
  const arms = anyOf.filter((arm) => arm.type !== 'null');
  if (arms.length !== 1) {
    return OPAQUE;
  }
  const { anyOf: _, ...own } = node;
  return specAt({ ...arms[0], ...own }, composites, depth + 1);
}

/** A `oneOf` of string consts is an enum; `oneOf [scalar, per-side map]` is
 * `sides`, with the union's own keywords (bounds) laid over the scalar arm. */
function unionSpec(
  node: CatalogNode,
  oneOf: readonly CatalogNode[],
  composites: CompositeNames,
  depth: number,
): FieldSpec {
  const values = oneOf.map((arm) => arm.const);
  if (isEnum(values)) {
    return { kind: 'enum', values };
  }
  const scalars = oneOf.filter(
    (arm) =>
      Object.keys(arm.properties ?? {})
        .sort()
        .join() !== SIDES,
  );
  if (scalars.length === 1 && oneOf.length === 2) {
    const { oneOf: _, ...own } = node;
    return { kind: 'sides', scalar: specAt({ ...scalars[0], ...own }, composites, depth + 1) };
  }
  return OPAQUE;
}

function typedSpec(node: CatalogNode, composites: CompositeNames, depth: number): FieldSpec {
  const type = nonNullType(node.type);
  return type === 'object'
    ? mapSpec(node.additionalProperties, composites, depth)
    : scalarSpec(node, type);
}

/** An object is editable only as a map of named entries whose own keys the
 * catalog lists; a fixed-key object is opaque. An entry is a plain `$ref` or
 * an inline object — a nullable or keyword-carrying entry, which the catalog
 * does not write, reads as opaque. */
function mapSpec(
  entry: CatalogNode | boolean | undefined,
  composites: CompositeNames,
  depth: number,
): FieldSpec {
  if (typeof entry !== 'object') {
    return OPAQUE;
  }
  const target = entry.$ref === undefined ? entry : defNode(entry.$ref);
  const properties = target?.properties;
  if (properties === undefined) {
    return OPAQUE;
  }
  const object = { ...target, properties };
  return {
    kind: 'map',
    entry: objectFields(object, Object.keys(properties), composites, depth + 1),
  };
}

/** A non-empty list of strings: the values of a select. */
function isEnum(values: readonly unknown[]): values is readonly string[] {
  return values.length > 0 && values.every(isString);
}
