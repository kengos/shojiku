// What a named-format operation RESULTS IN — the vocabulary every registry
// surface shares: the plan a create / rename / delete / edit produces, the
// closed set of reasons one can be refused, and the refusal → chrome-catalog
// mapping. Its own module so the refusal set stays exhaustive in ONE place:
// `REFUSAL_MESSAGE_KEY` is typed by `FormatOpRefusal`, so a new reason cannot
// ship without its message key.
//
// A plan is whole-or-nothing by construction: a refusal carries ops nowhere, so
// a surface that forgets to check `ok` cannot half-apply a rewrite.

import type { Op } from '@shojiku/designer-core';

/** Why a create / rename / delete / edit was refused.
 *
 * `reserved_name` and `empty_pattern` are the two this set does NOT share with
 * the styles registry. A field-type name cannot name a format
 * (`reserved_format_name`), and `NamedFormat.pattern` is a REQUIRED wire field
 * — authoring an entry without one produces a template the engine cannot
 * parse, which no gate would report because the op succeeds and the YAML is
 * valid. */
export type FormatOpRefusal =
  | 'empty_name'
  | 'duplicate_name'
  | 'reserved_name'
  | 'too_many_formats'
  | 'empty_pattern'
  | 'truncated_usage'
  | 'unaddressable_ref'
  | 'batch_too_large'
  | 'document_too_large';

/** A refusal reason → chrome catalog key, so the mapping is exhaustive in one
 * place.
 *
 * Four of them point at the STYLES catalog entries on purpose. Those four
 * messages are about the DOCUMENT and the rewrite ("too large to rewrite
 * references safely", "a reference could not be located", "too many references
 * to rewrite in one step", "that name is already in use") rather than about
 * named styles, and they are word-for-word what this surface needs. Minting a
 * second key with the same value in all six catalogs is exactly the duplicate
 * that no gate catches and that then drifts apart. */
export const REFUSAL_MESSAGE_KEY: Record<FormatOpRefusal, string> = {
  empty_name: 'formats.error.emptyName',
  duplicate_name: 'styles.error.duplicateName',
  reserved_name: 'formats.error.reservedName',
  too_many_formats: 'formats.error.tooMany',
  empty_pattern: 'formats.error.emptyPattern',
  truncated_usage: 'styles.error.truncated',
  unaddressable_ref: 'styles.error.unaddressable',
  batch_too_large: 'styles.error.batchTooLarge',
  document_too_large: 'formats.error.documentTooLarge',
};

/** A planned registry operation: a batch of ops to apply as one undo step, or a
 * refusal that changes nothing. */
export type FormatOpPlan =
  | { readonly ok: true; readonly ops: readonly Op[] }
  | { readonly ok: false; readonly reason: FormatOpRefusal };

/** Build a refusal plan. */
export function refuse(reason: FormatOpRefusal): FormatOpPlan {
  return { ok: false, reason };
}
