// What a named-style operation RESULTS IN — the vocabulary every styles surface
// shares: the plan a create / rename / delete / field-edit / capture produces,
// the closed set of reasons one can be refused, and the refusal → chrome-catalog
// mapping. Its own module because six consumers name it across two areas (the
// registry model's two op modules, the manager, the form, and the
// selection-capture pair under `styles/`), and because the refusal set must stay
// exhaustive in ONE place: `REFUSAL_MESSAGE_KEY` is typed by `StyleOpRefusal`,
// so a new reason cannot ship without its message key.
//
// A plan is whole-or-nothing by construction: a refusal carries ops nowhere, so
// a surface that forgets to check `ok` cannot half-apply a rewrite.

import type { Op } from '@shojiku/designer-core';

/** Why a create/rename/delete/capture/update was refused (the surfaces map each
 * to a localized message via `REFUSAL_MESSAGE_KEY`). `nothing_captured` is
 * capture/update-only (the selection carries no inline props to register). */
export type StyleOpRefusal =
  | 'empty_name'
  | 'duplicate_name'
  | 'too_many_styles'
  | 'truncated_usage'
  | 'unaddressable_ref'
  | 'batch_too_large'
  | 'nothing_captured';

/** A refusal reason → chrome catalog key, shared by every styles surface (the
 * registry manager and the selection-capture modal) so the mapping is
 * exhaustive in one place. */
export const REFUSAL_MESSAGE_KEY: Record<StyleOpRefusal, string> = {
  empty_name: 'styles.error.emptyName',
  duplicate_name: 'styles.error.duplicateName',
  too_many_styles: 'styles.error.tooMany',
  truncated_usage: 'styles.error.truncated',
  unaddressable_ref: 'styles.error.unaddressable',
  batch_too_large: 'styles.error.batchTooLarge',
  nothing_captured: 'styles.error.nothingCaptured',
};

/** A planned registry operation: a batch of ops to apply as one undo step, or a
 * refusal that changes nothing. */
export type StyleOpPlan =
  | { readonly ok: true; readonly ops: readonly Op[] }
  | { readonly ok: false; readonly reason: StyleOpRefusal };

/** Build a refusal plan (shared by the registry op modules and the capture
 * model). */
export function refuse(reason: StyleOpRefusal): StyleOpPlan {
  return { ok: false, reason };
}
