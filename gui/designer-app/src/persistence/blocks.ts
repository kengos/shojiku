// The reusable-block library store over an injected `Storage` (localStorage in
// the browser, a fake in tests). UNLIKE the per-document draft, the block
// library is APP-GLOBAL — one key holds every saved block, shared across
// documents — so a block saved from an invoice is insertable into a receipt.
// Wrapped in a versioned envelope so a schema bump is detectable; a corrupted
// entry degrades to a clean empty library (the sanitizer salvages the valid
// blocks), never a thrown parse error into the UI. A write that trips the
// storage quota returns a typed failure the app surfaces.

import { type SavedBlock, type SaveOutcome, sanitizeBlocks } from '@shojiku/designer';

const KEY = 'shojiku.blocks.v1';

interface BlockEnvelope {
  readonly v: 1;
  readonly blocks: readonly SavedBlock[];
}

/** A block library scoped to one `Storage`. Synchronous — localStorage is, and
 * the library is a single small key read once per editor mount. */
export class BlockStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /** Read the saved block library. Returns the sanitized blocks (hostile /
   * corrupted entries dropped), or an empty library when absent or unparseable —
   * the raw value is left in place so a future schema can still inspect it. */
  load(): readonly SavedBlock[] {
    const raw = this.storage.getItem(KEY);
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) {
        return [];
      }
      return sanitizeBlocks((parsed as { blocks?: unknown }).blocks);
    } catch {
      return [];
    }
  }

  /** Persist the block library. A quota/serialization failure is returned as a
   * typed outcome, never thrown. */
  save(blocks: readonly SavedBlock[]): SaveOutcome {
    const envelope: BlockEnvelope = { v: 1, blocks };
    try {
      this.storage.setItem(KEY, JSON.stringify(envelope));
      return { ok: true };
    } catch {
      return { ok: false, kind: 'error' };
    }
  }
}
