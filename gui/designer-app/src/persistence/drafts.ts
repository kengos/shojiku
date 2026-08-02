// Per-document draft persistence over an injected `Storage` (localStorage in
// the browser, a fake in tests) — the local implementation of the provider
// seam's `TemplateStore`. This module is the storage side only: which key a
// document's draft lives under, and the read/write/clear around it. What a
// draft IS, and how an untrusted envelope parses back into one, is
// `draftEnvelope.ts`. A write that trips the storage quota returns a typed
// failure the app surfaces; a corrupted entry is pruned on read.

import type { SaveOutcome, TemplateStore } from '@shojiku/designer';
import { buildEnvelope, type Draft, parseEnvelope } from './draftEnvelope';

const KEY_PREFIX = 'shojiku.draft.v1.';

function keyFor(docKey: string): string {
  return `${KEY_PREFIX}${docKey}`;
}

/** A draft store scoped to one `Storage`. Implements the provider seam's
 * `TemplateStore` (async by contract; storage itself is synchronous). */
export class DraftStore implements TemplateStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /** Persist a document's draft. A quota/serialization failure is returned as
   * a typed outcome, never thrown. */
  async save(docKey: string, draft: Draft): Promise<SaveOutcome> {
    try {
      this.storage.setItem(keyFor(docKey), JSON.stringify(buildEnvelope(draft)));
      return { ok: true };
    } catch {
      return { ok: false, kind: 'error' };
    }
  }

  /** Read a document's draft. Resolves `null` when absent or corrupted (a bad
   * envelope is pruned so it can't wedge every future load). */
  async load(docKey: string): Promise<Draft | null> {
    const raw = this.storage.getItem(keyFor(docKey));
    if (raw === null) {
      return null;
    }
    try {
      const draft = parseEnvelope(JSON.parse(raw) as unknown);
      if (draft !== null) {
        return draft;
      }
    } catch {
      // fall through to the corrupted-entry cleanup
    }
    this.storage.removeItem(keyFor(docKey));
    return null;
  }

  /** Drop a document's draft (after the user discards it, or after a
   * successful save to a mounted host makes the working copy redundant). */
  clear(docKey: string): void {
    this.storage.removeItem(keyFor(docKey));
  }
}
