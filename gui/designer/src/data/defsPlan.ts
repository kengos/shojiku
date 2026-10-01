// The definitions-edit PLAN side: adding a fresh item (a field, group, table or
// list) anywhere in the tree, and the restore
// guard over a persisted edit list. Both sit at the untrusted boundary — one
// takes a name the user typed, the other a value read back from user-writable
// storage — so they are pure, own-property-guarded and total (a refusal, never
// a throw). The metadata reads and op builders live beside them in
// `definitionsEdit.ts`; the apply path is that file's `applyDefinitionOps`.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { MAX_FIELD_NAME_CHARS } from '../insert/fieldModel';
import { DEFINITION_TYPES } from './definitionsEdit';
import type { DefsNode } from './defsTree';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Cap on a restored edit list — user-writable storage must not smuggle an
 * unbounded op array into every render's re-apply. Mirrors designer-core's
 * batch bound. */
export const MAX_DEFS_EDITS = 256;

/** Narrow a persisted (user-writable, hostile) value to a definition-edit op
 * list: an array of records carrying a string `op`, count-capped. Deep
 * validation stays with designer-core's `applyOp` — a structurally plausible
 * but invalid op is refused there and skipped by `applyDefinitionOps`.
 * Anything else degrades to no edits. */
export function sanitizeDefsEdits(raw: unknown): readonly Op[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .slice(0, MAX_DEFS_EDITS)
    .filter(
      (entry): entry is Op =>
        typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).op === 'string',
    );
}

/** Typed refusals the add-item form surfaces (`data.error.*` chrome keys). */
export type AddFieldRefusal =
  | 'empty_name'
  | 'name_too_long'
  | 'key_exists'
  | 'name_has_dot'
  | 'name_invisible';

export type AddFieldPlan =
  | { readonly ok: true; readonly op: Op; readonly keysPath: readonly string[] }
  | { readonly ok: false; readonly reason: AddFieldRefusal };

/** What the add form can create: the four scalar types plus the three
 * containers. */
export const ADD_KINDS = [...DEFINITION_TYPES, 'group', 'table', 'list'] as const;
export type AddKind = (typeof ADD_KINDS)[number];

/** Characters that draw NOTHING: controls (`\p{Cc}`), format characters
 * (`\p{Cf}`), the line/paragraph separators (`\p{Zl}`, `\p{Zp}`) and every
 * `Default_Ignorable_Code_Point` — the Unicode class of "renders as nothing",
 * which also holds letters that LOOK blank (the Hangul fillers, U+3164) and
 * invisible marks (U+034F). Such a name renders like another one, or like
 * nothing. Named by CLASS, not by listing members.
 *
 * Exceptions, by reason: the two joiners (U+200C/U+200D) carry meaning in
 * Indic scripts and emoji sequences, and the variation selectors
 * (`\p{Variation_Selector}`) pick a glyph variant — the ideographic ones
 * (U+E0100–U+E01EF) are how a Japanese name spells its exact kanji. */
const DRAWS_NOTHING = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const VARIATION_SELECTOR = /\p{Variation_Selector}/u;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;

/** Whether `name` holds a character that draws nothing, the exceptions aside.
 * Checked per character (the joiners are compared by code point — a character
 * class holding a joiner reads as a joined sequence). */
function hasInvisible(name: string): boolean {
  for (const ch of name) {
    const point = Number(ch.codePointAt(0));
    if (point === ZWNJ || point === ZWJ || VARIATION_SELECTOR.test(ch)) {
      continue;
    }
    if (DRAWS_NOTHING.test(ch)) {
      return true;
    }
  }
  return false;
}

/** The schema a fresh item of each kind starts as. A container carries no empty
 * `properties: {}` — a flow map would make every later child flow-style; the
 * first child creates a block map. */
function freshSchema(kind: AddKind): { [key: string]: SnippetValue } {
  switch (kind) {
    case 'group':
      return { type: 'object' };
    case 'table':
      return { type: 'array', items: { type: 'object' } };
    case 'list':
      return { type: 'array', items: { type: 'string' } };
    default:
      return { type: kind };
  }
}

/** The keys path of a container's `properties` map: the root's, a group's own,
 * or a table's ROW object's. */
function propertiesPath(parent: DefsNode): string[] {
  return parent.kind === 'table'
    ? [...parent.keysPath, 'items', 'properties']
    : [...parent.keysPath, 'properties'];
}

function refusalOf(name: string): AddFieldRefusal | null {
  if (name === '') {
    return 'empty_name';
  }
  if (name.length > MAX_FIELD_NAME_CHARS) {
    return 'name_too_long';
  }
  if (name.includes('.')) {
    // A binding path is dotted through the properties, so a dotted NAME is a
    // field no binding can reach.
    return 'name_has_dot';
  }
  return hasInvisible(name) ? 'name_invisible' : null;
}

/** Whether the DOCUMENT's map at `keys` already holds `name` — read from the
 * text, never from the (display-capped) tree. */
function holds(defsText: string, keys: readonly string[], name: string): boolean {
  let node: unknown;
  try {
    node = readTemplate(parseTemplate(defsText));
  } catch {
    return false;
  }
  for (const key of keys) {
    const map = record(node);
    node = map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
  }
  const map = record(node);
  return map !== undefined && Object.hasOwn(map, name);
}

/** Plan a fresh item inside `parent` (the root, a group, or a table's rows): ONE
 * `putValue` of its starting schema, carrying `title` when a label was given.
 * Returns the OP so the Designer coalesces it into its edit list like every
 * other definition edit; names are authored through `createNode` (no structural
 * injection). Works even when the sample data is read-only (a mounted host). */
export function addFieldPlan(
  defsText: string,
  parent: DefsNode,
  label: string,
  name: string,
  kind: AddKind,
): AddFieldPlan {
  const trimmed = name.trim();
  const refusal = refusalOf(trimmed);
  if (refusal !== null) {
    return { ok: false, reason: refusal };
  }
  const keys = propertiesPath(parent);
  if (holds(defsText, keys, trimmed)) {
    return { ok: false, reason: 'key_exists' };
  }
  const title = label.trim();
  const value = { ...freshSchema(kind), ...(title === '' ? {} : { title }) };
  const keysPath = [...keys, trimmed];
  return { ok: true, op: { op: 'putValue', keys: keysPath, value }, keysPath };
}
