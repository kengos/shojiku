// Planning a data-name RENAME as one action over three documents: the
// definitions (the edit list, `defsRestructure.ts`), this template's references
// (`refs/rewrite.ts`), and the key in every sample variant (`sample/rekey.ts`).
//
// Pure and refused WHOLE: nothing is applied unless all three halves can be,
// and each half is measured against the cap it will be re-parsed under — the
// template against the session's `maxBytes` (an op batch has no byte gate of
// its own; an over-cap document would only fail later, on undo), each variant
// against `MAX_PARAMS_BYTES`, the definitions against the definitions cap. The
// rename itself only ever names the node by its keys path from the tree walk.

import { Editor, MAX_TEMPLATE_BYTES, type Op } from '@shojiku/designer-core';
import { MAX_PARAMS_BYTES } from '../sample/model';
import { renameSampleKey } from '../sample/rekey';
import type { SampleSet } from '../sample/variants';
import { coalesceDefsEdit } from './definitionsEdit';
import type { DefsCompanion } from './defsHistory';
import { type AddFieldRefusal, holds, MAX_DEFS_EDITS, nameRefusal } from './defsPlan';
import { renameInEdits } from './defsRestructure';
import type { DefsNode } from './defsTree';
import { refsUnder, relativeKey } from './refs/match';
import { type RewriteRefusal, rewritePlan } from './refs/rewrite';
import type { RefIndex } from './refs/types';

/** Everything a rename / delete reads, as it is NOW. */
export interface RestructureInput {
  /** The effective definitions text (base + edits). */
  readonly definitions: string;
  /** The engineer definitions file the edits apply over (`undefined` in a
   * workshop / blank start, whose base follows the sample data). */
  readonly base: string | undefined;
  readonly edits: readonly Op[];
  readonly templateText: string;
  readonly refs: RefIndex | null;
  /** The session's template-size cap. */
  readonly maxBytes: number;
  readonly sampleSet: SampleSet;
}

export type RestructureRefusal =
  | AddFieldRefusal
  | RewriteRefusal
  | 'same_name'
  | 'walk_truncated'
  | 'too_large'
  | 'edit_cap';

/** A planned rename / delete: what each document becomes. */
export interface Restructure {
  readonly templateOps: readonly Op[];
  readonly sampleSet: SampleSet;
  readonly edits: readonly Op[];
  readonly companion: DefsCompanion;
  /** Where the node is afterwards (`null` = gone). */
  readonly keysPath: readonly string[] | null;
}

export type RestructurePlan =
  | ({ readonly ok: true } & Restructure)
  | { readonly ok: false; readonly reason: RestructureRefusal };

const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** The refusals a typed name earns before anything is planned — cheap enough
 * to run on every keystroke (the name rules, an unchanged or taken name, and
 * the two that ask the template: a `{key}` that could not spell it, and a
 * `bindings:` name that would capture it). */
export function renameRefusal(
  input: Pick<RestructureInput, 'definitions' | 'refs'>,
  node: DefsNode,
  name: string,
): RestructureRefusal | null {
  const refusal = nameRefusal(name);
  if (refusal !== null) {
    return refusal;
  }
  if (name === node.name) {
    return 'same_name';
  }
  if (holds(input.definitions, node.keysPath.slice(0, -1), name)) {
    return 'key_exists';
  }
  return templateHalf(input.refs, node, name).reason;
}

function templateHalf(
  refs: RefIndex | null,
  node: DefsNode,
  name: string,
): { readonly ops: readonly Op[]; readonly reason: RestructureRefusal | null } {
  if (refs === null || refs.truncated) {
    return { ops: [], reason: 'walk_truncated' };
  }
  const from = relativeKey(node);
  const to = [...from.split('.').slice(0, -1), name].join('.');
  const plan = rewritePlan(refsUnder(refs.refs, node), { frame: node.scope ?? [], from, to }, name);
  return plan.ok ? { ops: plan.ops, reason: null } : { ops: [], reason: plan.reason };
}

/** The text after `ops` on a scratch editor, or `null` when the text does not
 * parse or the batch is refused. */
export function applyScratch(text: string, ops: readonly Op[], maxBytes: number): string | null {
  if (ops.length === 0) {
    return text;
  }
  try {
    const scratch = Editor.create(text, { maxBytes });
    return scratch.applyAll(ops).ok ? scratch.text() : null;
  } catch {
    return null;
  }
}

/** `set` with `rewrite` applied to every variant's text; the same set (and the
 * same variant objects) where nothing changed. */
export function mapVariants(
  set: SampleSet,
  rewrite: (text: string, id: string) => string,
): SampleSet {
  let changed = false;
  const variants = set.variants.map((variant) => {
    const text = rewrite(variant.text, variant.id);
    if (text === variant.text) {
      return variant;
    }
    changed = true;
    return { ...variant, text };
  });
  return changed ? { ...set, variants } : set;
}

/** The template and sample halves alone — what an undo re-applies in reverse. */
export function cascadePlan(
  input: RestructureInput,
  node: DefsNode,
  name: string,
):
  | { readonly ok: true; readonly templateOps: readonly Op[]; readonly sampleSet: SampleSet }
  | {
      readonly ok: false;
      readonly reason: RestructureRefusal;
    } {
  const template = templateHalf(input.refs, node, name);
  if (template.reason !== null) {
    return { ok: false, reason: template.reason };
  }
  const result = applyScratch(input.templateText, template.ops, input.maxBytes);
  if (result === null || bytes(result) > input.maxBytes) {
    return { ok: false, reason: 'too_large' };
  }
  const sampleSet = mapVariants(input.sampleSet, (text) =>
    renameSampleKey(text, node.keysPath, name),
  );
  if (sampleSet.variants.some((variant) => variant.text.length > MAX_PARAMS_BYTES)) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true, templateOps: template.ops, sampleSet };
}

/** Plan renaming `node` to `name` across the three documents. */
export function planRename(input: RestructureInput, node: DefsNode, name: string): RestructurePlan {
  const refusal = renameRefusal(input, node, name);
  if (refusal !== null) {
    return { ok: false, reason: refusal };
  }
  const cascade = cascadePlan(input, node, name);
  if (!cascade.ok) {
    return cascade;
  }
  const keysPath = [...node.keysPath.slice(0, -1), name];
  let edits = renameInEdits(input.edits, input.base, node.keysPath, name);
  // A required node keeps its place in its parent's `required` list, renamed.
  const listPath = node.required ? node.requiredListPath : null;
  if (listPath !== null) {
    const values = node.parentRequired.map((entry) => (entry === node.name ? name : entry));
    edits = coalesceDefsEdit(edits, { op: 'setStrings', keys: [...listPath], values });
  }
  if (edits.length > MAX_DEFS_EDITS) {
    return { ok: false, reason: 'edit_cap' };
  }
  const renamed = { op: 'renameKey', keys: node.keysPath, to: name } as const;
  const defs = applyScratch(input.definitions, [renamed], MAX_TEMPLATE_BYTES);
  if (defs === null || bytes(defs) > MAX_TEMPLATE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const companion: DefsCompanion = { kind: 'rename', keysPath, name: node.name };
  const { templateOps, sampleSet } = cascade;
  return { ok: true, templateOps, sampleSet, edits, companion, keysPath };
}
