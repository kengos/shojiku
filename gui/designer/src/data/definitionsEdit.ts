// The pure definitions-edit model: the keys path of a palette field's schema
// node, the metadata reads at that path, the op builders that edit it (label /
// type / format / description), the coalescing rule, and the transient-Editor
// apply helper. Adding a field and the persisted-edit restore guard live in
// `defsPlan.ts`.
//
// Definitions become EDITABLE in the data-item editor (reversing the old
// read-only seam). Every edit is a serializable, root-addressed `Op` on the
// definitions YAML (AI parity — an agent emits the same op), and edits are
// CST-preserving: they run through a throwaway designer-core `Editor`, so
// comments and untouched keys survive byte-exact. This file is pure TS (no
// React), hostile-input safe: reads are own-property-guarded and never throw.

import { Editor, type Op, parseTemplate, readTemplate } from '@shojiku/designer-core';
import type { PaletteGroup } from '../palette/model';

/** The closed scalar-type vocabulary the type picker offers — the base JSON-schema
 * types a leaf field can carry. Structural types (`object`/`array`) are groups,
 * not editable leaf fields, so they never appear here. Picking is safe. */
export const DEFINITION_TYPES = ['string', 'number', 'integer', 'boolean'] as const;
export type DefinitionType = (typeof DEFINITION_TYPES)[number];

/** The SEMANTIC `format:` values a definitions field may declare, per base
 * type.
 *
 * `format:` on a definitions field is the data-semantic type refiner — it
 * feeds the engine's `(type, format)` table (`Schema::mapped`) and decides
 * which formatter the field renders through. It is NOT the display variant:
 * that is `displayFormat:`, a placement `format:`, or `defaults.formats`.
 *
 * The engine's table is closed, and an unrecognised value is treated as a
 * generation hint and NEVER warns — so offering a display variant or a
 * `formats:` registry name here would give the author a control that writes a
 * key and silently does nothing.
 */
export const SEMANTIC_FORMATS: Readonly<Record<DefinitionType, readonly string[]>> = {
  string: ['date', 'date-time', 'image'],
  number: ['currency', 'percentage', 'quantity'],
  integer: ['currency', 'percentage', 'quantity'],
  // No semantic format refines a boolean.
  boolean: [],
};

/** The semantic formats for a field whose declared type the panel cannot
 * resolve. Looked up own-property-guarded — the type is a document-derived
 * string, so a prototype name must not reach an inherited entry. */
export function semanticFormats(type: string): readonly string[] {
  return Object.hasOwn(SEMANTIC_FORMATS, type) ? SEMANTIC_FORMATS[type as DefinitionType] : [];
}

/** Whether the field's authored `format:` is one the type-refiner select
 * already offers. The wire vocabulary is OPEN — an unknown value is a
 * generation hint that leaves the base type alone — so a `false` here means
 * the editor must show the authored value rather than the not-set row. An
 * empty format is `true`: the not-set row is exactly what it means. */
export function isSemanticFormat(def: DefinitionField): boolean {
  const offered = semanticFormats(def.type === '' ? 'string' : def.type);
  return def.format === '' || offered.includes(def.format);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Interleave `properties` before each dotted key segment, mirroring the schema
 * shape (`properties.customer.properties.name`). */
function interleave(segs: readonly string[]): string[] {
  const out: string[] = [];
  for (const seg of segs) {
    out.push('properties', seg);
  }
  return out;
}

/** The root-addressed keys path of a palette field's schema node. A non-array
 * group's field is a dotted full key under nested `properties`; an array group's
 * row field lives under the array's `items.properties` (the group id may itself
 * be a dotted nested-array id). */
export function fieldKeysPath(group: PaletteGroup, fieldKey: string): string[] {
  const fieldSegs = fieldKey.split('.');
  if (!group.isArray) {
    return interleave(fieldSegs);
  }
  return [...interleave(group.id.split('.')), 'items', ...interleave(fieldSegs)];
}

/** One field's editable definition metadata (raw wire values, `''` when unset). */
export interface DefinitionField {
  readonly title: string;
  readonly type: string;
  readonly format: string;
  readonly description: string;
}

const EMPTY_FIELD: DefinitionField = { title: '', type: '', format: '', description: '' };

/** Read the raw schema node at a keys path — own-property guarded, never throws.
 * A missing node, a hostile prototype segment, or unparseable definitions all
 * degrade to all-empty. */
export function readDefinitionField(
  defsText: string,
  keysPath: readonly string[],
): DefinitionField {
  let node: unknown;
  try {
    node = readTemplate(parseTemplate(defsText));
  } catch {
    return EMPTY_FIELD;
  }
  for (const key of keysPath) {
    const rec = record(node);
    if (rec === undefined || !Object.hasOwn(rec, key)) {
      return EMPTY_FIELD;
    }
    node = rec[key];
  }
  const schema = record(node);
  if (schema === undefined) {
    return EMPTY_FIELD;
  }
  return {
    title: str(schema.title),
    type: str(schema.type),
    format: str(schema.format),
    description: str(schema.description),
  };
}

/** Set (or clear, when empty) a scalar leaf under a field's schema node. `null`
 * when unchanged — a mere blur must author nothing. */
function scalarLeafOp(
  keysPath: readonly string[],
  leaf: string,
  current: string,
  next: string,
): Op | null {
  if (next === current) {
    return null;
  }
  const keys = [...keysPath, leaf];
  return next === '' ? { op: 'removeKey', keys } : { op: 'setScalar', keys, value: next };
}

export function titleOp(keysPath: readonly string[], current: string, next: string): Op | null {
  return scalarLeafOp(keysPath, 'title', current, next);
}

export function typeOp(keysPath: readonly string[], current: string, next: string): Op | null {
  return scalarLeafOp(keysPath, 'type', current, next);
}

export function formatOp(keysPath: readonly string[], current: string, next: string): Op | null {
  return scalarLeafOp(keysPath, 'format', current, next);
}

export function descriptionOp(
  keysPath: readonly string[],
  current: string,
  next: string,
): Op | null {
  return scalarLeafOp(keysPath, 'description', current, next);
}

/** Apply definition-edit ops to the definitions text, CST-preserving, via a
 * throwaway `Editor`. Ops apply INDIVIDUALLY and a refused one is skipped —
 * each targets its own coalesced leaf, and in workshop mode the base is
 * re-inferred per render, so an op can legally miss (a `removeKey` clearing a
 * label the base never authored). A transactional batch here would let that
 * one benign miss silently drop EVERY other edit from the view. Fail-closed on
 * malformed/oversized text (returned unchanged, never a throw); an empty list
 * is the identity. */
export function applyDefinitionOps(defsText: string, ops: readonly Op[]): string {
  if (ops.length === 0) {
    return defsText;
  }
  let editor: Editor;
  try {
    editor = Editor.create(defsText);
  } catch {
    return defsText;
  }
  for (const op of ops) {
    editor.apply(op);
  }
  return editor.text();
}

/** The coalescing identity of a definition-edit op — its `keys` path (every
 * definition edit is a keyed op); a keyless op (never emitted here) keys by its
 * whole shape so it can never collide with a real edit. */
function opTarget(op: Op): string {
  return 'keys' in op ? JSON.stringify(op.keys) : JSON.stringify(['@', op.op]);
}

/** Coalesce a definition-edit op into an ordered list keyed by its target:
 * re-editing the same leaf replaces its prior op (so the list stays bounded to
 * the distinct edited leaves) while preserving first-seen order. */
export function coalesceDefsEdit(edits: readonly Op[], op: Op): Op[] {
  const key = opTarget(op);
  const out = edits.filter((existing) => opTarget(existing) !== key);
  out.push(op);
  return out;
}
