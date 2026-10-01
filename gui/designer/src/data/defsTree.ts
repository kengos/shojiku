// The definitions TREE the data-item editor's rail shows and edits through: every
// schema node — the root, object groups, tables (an array of objects), lists (an
// array of plain values) and leaf fields, at any depth.
//
// Each node carries the `keysPath` it was FOUND at, recorded while walking. Ops
// address the document through that path and nothing else, so a node's address
// can never drift from where the walk read it (re-deriving it from a dotted id
// mis-addressed a table nested in another table's rows).
//
// Pure and hostile-input safe like the palette's walk beside it: one parse
// through the same `parseTemplate`/`readTemplate`, own-property reads, depth and
// node caps, `null` for text that does not parse to a map with `properties`.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { MAX_WALK_DEPTH } from '../palette/caps';
import { record } from '../palette/fieldDisplay';
import type { PaletteField } from '../palette/model';
import { leafField } from '../palette/schemaWalk';
import { SELECTION_SEP } from './editorModel';

export type NodeKind = 'root' | 'field' | 'group' | 'table' | 'list';

/** Most nodes one tree shows. A DISPLAY cap: no write is decided from a
 * truncated walk (a node's `required` reads its parent's FULL list). */
export const MAX_TREE_NODES = 1024;

export interface DefsNode {
  /** Selection identity: the keys path joined by `SELECTION_SEP` (`''` = root).
   * Display-only — ops address the document through `keysPath`. */
  readonly id: string;
  readonly keysPath: readonly string[];
  /** The data name (the property key); `''` for the root. */
  readonly name: string;
  /** The authored `title`, `''` when unset. */
  readonly label: string;
  readonly kind: NodeKind;
  /** The raw wire `type`, `''` when unset or not a string. */
  readonly type: string;
  /** Whether the parent's `required` list names this node. */
  readonly required: boolean;
  /** Where the parent's `required` list lives; `null` for the root. */
  readonly requiredListPath: readonly string[] | null;
  /** The parent's full `required` list (strings only); empty for the root. */
  readonly parentRequired: readonly string[];
  /** Property names from the params root (a table's rows add no segment). */
  readonly dataPath: readonly string[];
  /** `dataPath` of the innermost table/list whose ROWS carry this node; `null`
   * at document scope. */
  readonly scope: readonly string[] | null;
  /** The palette's leaf view (label fallback, enum options) — fields only. */
  readonly leaf: PaletteField | null;
  readonly children: readonly DefsNode[];
}

interface Parent {
  readonly propertiesPath: readonly string[];
  readonly requiredListPath: readonly string[];
  readonly required: readonly string[];
  readonly dataPath: readonly string[];
  readonly scope: readonly string[] | null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function kindOf(schema: Record<string, unknown>): Exclude<NodeKind, 'root'> {
  if (schema.type === 'object') {
    return 'group';
  }
  if (schema.type === 'array') {
    return record(schema.items)?.type === 'object' ? 'table' : 'list';
  }
  return 'field';
}

/** The children of a container: a group's own `properties`, or a table's ROW
 * object (`items.properties` — the rows open a scope). A field or a list has
 * none. */
function childrenOf(
  node: DefsNode,
  schema: Record<string, unknown>,
  depth: number,
  budget: { left: number },
): DefsNode[] {
  if (node.kind !== 'group' && node.kind !== 'table') {
    return [];
  }
  const table = node.kind === 'table';
  const holder = table ? record(schema.items) : schema;
  const at = table ? [...node.keysPath, 'items'] : node.keysPath;
  const frame: Parent = {
    propertiesPath: [...at, 'properties'],
    requiredListPath: [...at, 'required'],
    required: stringList(holder?.required),
    dataPath: node.dataPath,
    scope: table ? node.dataPath : node.scope,
  };
  return walk(frame, record(holder?.properties), depth + 1, budget);
}

function walk(
  parent: Parent,
  properties: Record<string, unknown> | undefined,
  depth: number,
  budget: { left: number },
): DefsNode[] {
  const out: DefsNode[] = [];
  if (properties === undefined || depth > MAX_WALK_DEPTH) {
    return out;
  }
  for (const name of Object.keys(properties)) {
    const schema = record(properties[name]);
    if (schema === undefined || budget.left <= 0) {
      continue;
    }
    budget.left -= 1;
    const keysPath = [...parent.propertiesPath, name];
    const dataPath = [...parent.dataPath, name];
    const kind = kindOf(schema);
    const base: DefsNode = {
      id: keysPath.join(SELECTION_SEP),
      keysPath,
      name,
      label: str(schema.title),
      kind,
      type: str(schema.type),
      required: parent.required.includes(name),
      requiredListPath: parent.requiredListPath,
      parentRequired: parent.required,
      dataPath,
      scope: parent.scope,
      leaf: kind === 'field' ? leafField(dataPath.join('.'), name, schema) : null,
      children: [],
    };
    out.push({ ...base, children: childrenOf(base, schema, depth, budget) });
  }
  return out;
}

/** Read the definitions text as a tree rooted at the document. `null` when the
 * text does not parse to a map whose `properties` is a map or absent
 * (malformed, over the size cap, an alias bomb, the retired v1 `groups:`
 * form); a map with no `properties` is an empty dictionary. */
export function readDefsTree(defsText: string): DefsNode | null {
  let raw: unknown;
  try {
    raw = readTemplate(parseTemplate(defsText));
  } catch {
    return null;
  }
  const root = record(raw);
  if (root === undefined || Object.hasOwn(root, 'groups')) {
    return null;
  }
  // No `properties` at all is a legal, empty dictionary (the engine defaults
  // it); a `properties` that is not a map is not one.
  const properties = root.properties === undefined ? {} : record(root.properties);
  if (properties === undefined) {
    return null;
  }
  const frame: Parent = {
    propertiesPath: ['properties'],
    requiredListPath: ['required'],
    required: stringList(root.required),
    dataPath: [],
    scope: null,
  };
  return {
    id: '',
    keysPath: [],
    name: '',
    label: str(root.title),
    kind: 'root',
    type: str(root.type),
    required: false,
    requiredListPath: null,
    parentRequired: [],
    dataPath: [],
    scope: null,
    leaf: null,
    children: walk(frame, properties, 0, { left: MAX_TREE_NODES }),
  };
}
