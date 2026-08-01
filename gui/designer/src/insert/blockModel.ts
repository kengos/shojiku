// Pure model for the reusable-block (snippet-library) feature: a saved block is
// a NAMED serialized node snippet — the same `SnippetValue` `insertItem` takes —
// so saving reads the selected node and inserting is a plain `insertItem` (AI
// parity holds; no new document mutation path). Framework-free (like the other
// insert models) so every rule is exhaustively unit-testable; the store and the
// dialogs stay thin over it. The block library is APP-GLOBAL (cross-document),
// distinct from the per-document draft — a host injects it through the Designer
// props, the standalone app backs it with localStorage.

import { isSnippetValue, type SnippetValue } from '@shojiku/designer-core';
import type { InsertGroup, MenuEntry } from './insertMenu';

/** One saved block: a stable id (React keys / dedupe / delete target — never a
 * plain-object index), the user's display name (rendered as a menu label), and
 * the snippet a click inserts. */
export interface SavedBlock {
  readonly id: string;
  readonly name: string;
  readonly value: SnippetValue;
}

/** Library caps. The count bounds the menu length and localStorage weight; the
 * name cap bounds a menu label. Both are re-enforced on restore (hostile
 * storage), so the runtime library is always within them. */
export const MAX_BLOCKS = 50;
export const MAX_BLOCK_NAME_CHARS = 60;

/** Typed refusals the save dialog localizes (`block.error.*`). `empty_name` /
 * `name_too_long` / `name_exists` come from the form; `over_cap` from a full
 * library; `not_savable` from a selection whose node cannot become a snippet;
 * `insert_failed` from the Designer's `insertItem` op (a hostile document). */
export type BlockRefusal =
  | 'empty_name'
  | 'name_too_long'
  | 'name_exists'
  | 'over_cap'
  | 'not_savable'
  | 'insert_failed';

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters from hostile stored names is the intent.
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const RESERVED_IDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** The snippet a selected node becomes, or `null` when it cannot be one: a
 * missing read (`undefined`), a non-object leaf, or a subtree over the snippet
 * depth/node caps. The read node is already a materialized plain value, so this
 * only fails on shape/size — the same rule `insertItem` enforces, reused. */
export function blockFromNode(value: unknown): SnippetValue | null {
  // A block is a whole item node — a map. A bare scalar/array read is never a
  // savable element even though it is a valid snippet shape.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return isSnippetValue(value) ? value : null;
}

/** Whether a name is free to use, against the current library's names
 * (case-sensitive — the user chose the exact text). */
function nameTaken(name: string, blocks: readonly SavedBlock[]): boolean {
  return blocks.some((b) => b.name === name);
}

/** Validate the save form against the current library. `null` = good to go. */
export function validateBlockName(
  name: string,
  blocks: readonly SavedBlock[],
): BlockRefusal | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'empty_name';
  }
  if (trimmed.length > MAX_BLOCK_NAME_CHARS) {
    return 'name_too_long';
  }
  if (nameTaken(trimmed, blocks)) {
    return 'name_exists';
  }
  return null;
}

/** The smallest free `block-<n>` id for a fresh block (stable + deterministic,
 * mirrors the sample-variant `user-<n>` scheme). */
function freshBlockId(blocks: readonly SavedBlock[]): string {
  const taken = new Set(blocks.map((b) => b.id));
  let n = 1;
  while (taken.has(`block-${n}`)) {
    n += 1;
  }
  return `block-${n}`;
}

/** The save outcome — every branch here so the dialog stays a thin dispatcher. */
export type BlockSaveOutcome =
  | { readonly ok: true; readonly blocks: readonly SavedBlock[]; readonly block: SavedBlock }
  | { readonly ok: false; readonly refusal: BlockRefusal };

/** Add a named block to the library: validate the name, cap the count, mint a
 * fresh id. The value is the already-validated snippet from `blockFromNode`. */
export function addBlock(
  blocks: readonly SavedBlock[],
  name: string,
  value: SnippetValue,
): BlockSaveOutcome {
  const refusal = validateBlockName(name, blocks);
  if (refusal !== null) {
    return { ok: false, refusal };
  }
  if (blocks.length >= MAX_BLOCKS) {
    return { ok: false, refusal: 'over_cap' };
  }
  const block: SavedBlock = { id: freshBlockId(blocks), name: name.trim(), value };
  return { ok: true, blocks: [...blocks, block], block };
}

/** Drop a block by id (a no-op miss is fine — a stale delete target). */
export function removeBlock(blocks: readonly SavedBlock[], id: string): readonly SavedBlock[] {
  return blocks.filter((b) => b.id !== id);
}

/** Narrow an untrusted persisted block list into safe blocks (the restore guard,
 * like `sanitizeDefsEdits`): each entry needs a non-empty non-reserved string id,
 * a string name (control chars stripped, capped, empty → dropped), and a value
 * that is a snippet within caps; duplicate ids and the over-cap tail are dropped.
 * Non-array input yields no blocks; deep validation still re-runs at insert. */
export function sanitizeBlocks(raw: unknown): SavedBlock[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: SavedBlock[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (out.length >= MAX_BLOCKS) {
      break;
    }
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const rec = entry as Record<string, unknown>;
    const { id, name, value } = rec;
    if (typeof id !== 'string' || id === '' || RESERVED_IDS.has(id) || seen.has(id)) {
      continue;
    }
    if (typeof name !== 'string') {
      continue;
    }
    const cleanName = name.replace(CONTROL_RE, '').trim().slice(0, MAX_BLOCK_NAME_CHARS);
    if (cleanName === '') {
      continue;
    }
    if (!isSnippetValue(value)) {
      continue;
    }
    seen.add(id);
    out.push({ id, name: cleanName, value });
  }
  return out;
}

/** The insert-menu reusable-blocks group: the always-present save-selection
 * entry, one row per saved block (its NAME is the label — user data rendered as
 * React text), and the manage entry when there is anything to manage. The group
 * itself is appended only when the host armed block persistence (the Designer's
 * gate), so an empty library still shows the save affordance, never a dead
 * control-free group. */
export function blockInsertGroup(blocks: readonly SavedBlock[]): InsertGroup {
  const entries: MenuEntry[] = [{ kind: 'saveBlock', labelKey: 'insert.saveBlock' }];
  for (const block of blocks) {
    entries.push({ kind: 'block', blockId: block.id, name: block.name });
  }
  if (blocks.length > 0) {
    entries.push({ kind: 'manageBlock', labelKey: 'insert.manageBlock' });
  }
  return { labelKey: 'insert.group.reuseBlock', entries };
}
