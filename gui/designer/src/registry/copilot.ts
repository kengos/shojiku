// The AI-copilot seam: the request/reply contract of the `suggest:ops` hook
// provider (a HOST forwards the request to its own LLM — API keys never exist
// in GUI code or storage) plus the GUI-side guards over the reply. The reply's
// ops are UNTRUSTED (an LLM emitted them, a host relayed them): the shallow
// sanitizer here refuses the WHOLE reply on any invalid entry — unlike the
// definitions-edit sanitizer's per-entry filter, a partially applied AI
// proposal would silently do something the user never reviewed — and the op
// NAME allowlist is load-bearing: designer-core's `applyOp` dispatches by an
// exhaustive switch with no runtime default, so an unknown name must never
// reach it. Deep validation stays with `applyOp` via the Designer's
// transactional dry-run (fail-closed, byte-exact rollback).

import type { Op } from '@shojiku/designer-core';

/** What the Designer packages for the provider. Field set is append-only (the
 * hook-registry payload governance): a host builds its LLM call from these and
 * must tolerate new optional fields. */
export interface CopilotRequest {
  /** The user's ask, verbatim. */
  readonly prompt: string;
  /** The GUI-authored op-schema contract (`COPILOT_INSTRUCTIONS`) — ship it to
   * the model (as a system prompt or preamble) so the reply matches the ops
   * the validating GUI actually accepts. */
  readonly instructions: string;
  /** The current template YAML. */
  readonly template: string;
  /** The effective definitions YAML (engineer file with edits folded in, or
   * the workshop mode stub), when any exists. */
  readonly definitions?: string;
  /** The selected item's structural path (`sections.body.items[0]`), when a
   * selection exists. */
  readonly selectionPath?: string;
  /** The active sample-variant params JSON. Optional on the wire (a future
   * host may omit it); the Designer always includes it. */
  readonly params?: string;
}

/** What the provider resolves with. `ops` is untrusted — the GUI validates it
 * (shallow sanitize + transactional dry-run) before anything is shown. */
export interface CopilotReply {
  /** Expected: a JSON array of patch ops (see `COPILOT_INSTRUCTIONS`). */
  readonly ops: unknown;
  /** An optional short assistant note, shown (as escaped text) in the review
   * pane beside the diff. */
  readonly note?: string;
}

/** The `suggest:ops` provider signature: one request-response implementation
 * per host (the hook registry's single-slot rule). */
export type CopilotProvider = (request: CopilotRequest) => Promise<CopilotReply>;

/** Cap on a reply's op list — mirrors designer-core's `MAX_BATCH_OPS` (the
 * transactional `applyAll` bound the proposal ultimately applies through). */
export const MAX_COPILOT_OPS = 256;

/** Display cap on the assistant note (a hostile provider must not paint an
 * unbounded wall of text into the review pane). */
export const MAX_COPILOT_NOTE_CHARS = 2000;

/** Every op kind the GUI accepts from a reply — designer-core's full named-op
 * set. A real `Set` lookup (never a plain-object index), so a hostile op name
 * (`constructor`, `__proto__`) can only miss. */
const OP_NAMES: ReadonlySet<string> = new Set([
  'setScalar',
  'setStrings',
  'removeKey',
  'renameKey',
  'putValue',
  'moveItem',
  'duplicateItem',
  'insertItem',
  'removeItem',
]);

/** The op-schema contract the request carries: what the model must emit for
 * the GUI to accept it. English on purpose (the model-facing wire, like the
 * engine's diagnostic messages); the user-facing chrome is localized. */
export const COPILOT_INSTRUCTIONS = `You edit a Shojiku template (YAML) by emitting patch operations.
Reply with a JSON array of operation objects — no YAML, no prose, no markdown fence.
The array is applied transactionally; if any operation is invalid, nothing is applied.
At most 256 operations.

Addressing: "path" is a structural path into the template ("sections.body.items[2]",
"sections.body.items[0].items[1]"); "keys" is a map-key path under it (["box","x"],
["data","key"]). Omitting "path" on setScalar/setStrings/removeKey/renameKey/putValue
addresses the document root ({"op":"setScalar","keys":["page","size"],"value":"A4"}).
Setting auto-creates missing intermediate maps.

Operations:
- {"op":"setScalar","path"?,"keys":[…],"value":string|number|boolean} — set one leaf.
- {"op":"setStrings","path"?,"keys":[…],"values":[string,…]} — set a string list (e.g. styleNames).
- {"op":"removeKey","path"?,"keys":[…]} — remove a key (empty parent maps are pruned).
- {"op":"renameKey","path"?,"keys":[…],"to":string} — rename the addressed map key in place.
- {"op":"putValue","path"?,"keys":[…],"value":object} — set a JSON-shaped subtree at the key.
- {"op":"insertItem","path":"…items","index":n,"value":object} — insert one item (JSON shape,
  e.g. {"type":"text","text":"…","box":{"x":0,"y":0,"w":120,"h":16}}) at index 0..=length.
- {"op":"removeItem","path":"…items","index":n} — remove one item.
- {"op":"moveItem","path":"…items","from":n,"to":n} — reorder within the same sequence.
- {"op":"duplicateItem","path":"…items","index":n} — duplicate one item in place.

Values are plain JSON (finite numbers, plain maps); never YAML text or anchors.
Change only what the user asked for — untouched keys must stay untouched.`;

/** Narrow an untrusted reply's `ops` to a patch-op list, or `null` to refuse
 * the whole reply: not an array, empty, over the cap, or ANY entry that is not
 * a record carrying a known op name. Shallow on purpose — deep validation is
 * the dry-run `applyAll`, which refuses the batch with byte-exact rollback. */
export function sanitizeCopilotOps(raw: unknown): readonly Op[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_COPILOT_OPS) {
    return null;
  }
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null;
    }
    const name = (entry as { readonly op?: unknown }).op;
    if (typeof name !== 'string' || !OP_NAMES.has(name)) {
      return null;
    }
  }
  return raw as readonly Op[];
}
