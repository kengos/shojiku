// What ONE restore point is, and how an untrusted stored one parses back. The
// ring that holds them — and the storage around it — is `snapshots.ts`; this
// module is the entry vocabulary plus its guard, so the shape a hostile
// storage value has to satisfy has one home.

import { MAX_NAME_CHARS, type StoredSampleSet } from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';
import { isInstalledFont, parseStoredSample } from './storedDoc';

/** Coarse upper bound on a stored snapshot's template text, in CHARS — a
 * defensive guard against an absurd hostile storage value, not a precise byte
 * gate (the Designer re-parses at its own byte cap on restore, which is the real
 * enforcement). Sized to the template-byte ceiling an image-bearing document can
 * legitimately reach. */
const MAX_SNAPSHOT_TEXT_CHARS = 8 * 1024 * 1024;

/** Cap on a stored snapshot id (store-generated, short — a timestamp with an
 * optional dedupe suffix); bounds a hostile storage value. */
const MAX_ID_CHARS = 64;

/** One captured restore point. `sample` is absent when the document carried no
 * sample-variant set (a mounted single-param or a blank start). Fonts are
 * MANIFESTS only — the bytes re-fetch through their `url:` pins on restore,
 * exactly as a draft's picked fonts do. */
export interface Snapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly text: string;
  readonly fonts: readonly InstalledFont[];
  readonly sample?: StoredSampleSet;
}

/** What `capture` persists — the snapshot minus its store-assigned id. */
export type SnapshotDraft = Omit<Snapshot, 'id'>;

/** Parse one untrusted stored entry into a Snapshot, or `null` when malformed (a
 * non-object; a bad/oversized id; a non-string name; a non-finite createdAt; a
 * non-string/oversized text; non-font entries; or a present-but-invalid sample).
 * An over-long name is CLIPPED (user-writable storage never yields more than the
 * cap), not rejected. */
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const s = raw as {
    id?: unknown;
    name?: unknown;
    createdAt?: unknown;
    text?: unknown;
    fonts?: unknown;
    sample?: unknown;
  };
  if (typeof s.id !== 'string' || s.id.length === 0 || s.id.length > MAX_ID_CHARS) {
    return null;
  }
  if (typeof s.name !== 'string') {
    return null;
  }
  if (typeof s.createdAt !== 'number' || !Number.isFinite(s.createdAt)) {
    return null;
  }
  if (typeof s.text !== 'string' || s.text.length > MAX_SNAPSHOT_TEXT_CHARS) {
    return null;
  }
  if (!Array.isArray(s.fonts) || !s.fonts.every(isInstalledFont)) {
    return null;
  }
  let sample: StoredSampleSet | undefined;
  if (s.sample !== undefined) {
    const parsed = parseStoredSample(s.sample);
    if (parsed === null) {
      return null;
    }
    sample = parsed;
  }
  const name = s.name.slice(0, MAX_NAME_CHARS);
  const base = {
    id: s.id,
    name,
    createdAt: s.createdAt,
    text: s.text,
    fonts: s.fonts as InstalledFont[],
  };
  return sample === undefined ? base : { ...base, sample };
}
