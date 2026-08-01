// Named restore points ("実験する前に取っておく") over an injected `Storage` — a
// per-document ring of user-named snapshots of the working copy (template text +
// picked-font MANIFESTS + the sample-variant set). SEPARATE from the draft store
// (drafts.ts) so a snapshot survives the working copy returning to pristine (a
// cleared draft): a restore point is a deliberate, named capture, not the
// autosaved working copy. Restore replaces the working copy after a confirm;
// points are deleted explicitly — the ring never silently evicts a named one.
// This module is the ring and its storage; one point's shape and its guard live
// in `snapshotEntry.ts`. A corrupted entry is DROPPED (never thrown into the
// UI); a quota failure is a typed outcome.

import { parseSnapshot, type Snapshot, type SnapshotDraft } from './snapshotEntry';

const KEY_PREFIX = 'shojiku.snapshot.v1.';

/** The ring size — a small fixed set of named restore points per document. */
export const MAX_SNAPSHOTS = 10;

/** The typed result of a capture: success (with the assigned snapshot), the ring
 * is full (the user must delete one first), or a storage failure (e.g. quota). */
export type CaptureOutcome =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly kind: 'full' | 'error' };

function keyFor(docKey: string): string {
  return `${KEY_PREFIX}${docKey}`;
}

/** A snapshot store scoped to one `Storage`. Async by seam convention (storage
 * itself is synchronous); a future host could implement the same shape over a
 * network. */
export class SnapshotStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /** The document's restore points, newest first. A corrupted envelope is pruned
   * so it can't wedge every future read; individual malformed entries are
   * dropped, keeping the valid ones. */
  async list(docKey: string): Promise<readonly Snapshot[]> {
    return this.read(docKey);
  }

  /** Capture the current working copy as a named restore point. Refuses when the
   * ring is full (`full`) or the storage write fails (`error`, e.g. quota) —
   * never throws. On success the new point is prepended (newest first). */
  async capture(docKey: string, draft: SnapshotDraft): Promise<CaptureOutcome> {
    const existing = this.read(docKey);
    if (existing.length >= MAX_SNAPSHOTS) {
      return { ok: false, kind: 'full' };
    }
    const snapshot: Snapshot = { id: this.nextId(draft.createdAt, existing), ...draft };
    const next = [snapshot, ...existing];
    try {
      this.storage.setItem(keyFor(docKey), JSON.stringify({ v: 1, snapshots: next }));
      return { ok: true, snapshot };
    } catch {
      return { ok: false, kind: 'error' };
    }
  }

  /** Delete one restore point by id. An unknown id is a no-op (no write); an
   * emptied ring drops its storage key. A failed shrink write is swallowed (the
   * point simply reappears on the next read — never a thrown error into the UI). */
  async remove(docKey: string, id: string): Promise<void> {
    const existing = this.read(docKey);
    const next = existing.filter((s) => s.id !== id);
    if (next.length === existing.length) {
      return;
    }
    if (next.length === 0) {
      this.storage.removeItem(keyFor(docKey));
      return;
    }
    try {
      this.storage.setItem(keyFor(docKey), JSON.stringify({ v: 1, snapshots: next }));
    } catch {
      // A shrink can't trip quota; swallow any other write failure.
    }
  }

  private read(docKey: string): Snapshot[] {
    const raw = this.storage.getItem(keyFor(docKey));
    if (raw === null) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.storage.removeItem(keyFor(docKey));
      return [];
    }
    if (typeof parsed !== 'object' || parsed === null) {
      this.storage.removeItem(keyFor(docKey));
      return [];
    }
    const env = parsed as { v?: unknown; snapshots?: unknown };
    if (env.v !== 1 || !Array.isArray(env.snapshots)) {
      this.storage.removeItem(keyFor(docKey));
      return [];
    }
    const out: Snapshot[] = [];
    for (const entry of env.snapshots) {
      if (out.length >= MAX_SNAPSHOTS) {
        break;
      }
      const snap = parseSnapshot(entry);
      if (snap !== null) {
        out.push(snap);
      }
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  /** A unique id for a new point: its creation timestamp, disambiguated with a
   * numeric suffix when two captures land in the same millisecond. */
  private nextId(createdAt: number, existing: readonly Snapshot[]): string {
    const used = new Set(existing.map((s) => s.id));
    const base = String(createdAt);
    if (!used.has(base)) {
      return base;
    }
    let n = 1;
    while (used.has(`${base}-${n}`)) {
      n += 1;
    }
    return `${base}-${n}`;
  }
}
