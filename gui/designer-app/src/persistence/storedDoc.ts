// The payload-field vocabulary the three stores share: what a persisted or
// host-served document's fields look like when they come back as UNTRUSTED
// values. A draft lives in user-writable localStorage, a snapshot beside it,
// and a mounted host's JSON carries the same shapes over the wire — so the
// guards belong to none of those three stores in particular. Field-level by
// design: one corrupted or hostile entry becomes a clean miss at the caller,
// never a crash deeper in (the fetch layer re-checks the urls a font manifest
// carries).

import {
  MAX_PARAMS_BYTES,
  MAX_VARIANTS,
  type StoredSampleSet,
  type StoredVariant,
} from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Whether a parsed value is a structurally valid installed font. */
export function isInstalledFont(value: unknown): value is InstalledFont {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const font = value as Record<string, unknown>;
  return (
    isString(font.packId) &&
    isString(font.familyId) &&
    isString(font.displayName) &&
    isString(font.manifest) &&
    isString(font.licenseFile) &&
    isString(font.licenseText)
  );
}

/** Parse a stored sample-variant set from an untrusted payload. Returns the
 * validated set, or `null` when it is malformed (the whole record is then a
 * clean miss, never a partial restore): a non-object; a non-string `active`; a
 * non-array `variants`; an entry without a string `id`/`text`; a present-
 * but-non-string `name`; a duplicate id (two entries would both answer to one
 * switch/edit); an over-cap count; an over-byte text; or an `active` that
 * names no variant. */
export function parseStoredSample(raw: unknown): StoredSampleSet | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const s = raw as { active?: unknown; variants?: unknown };
  if (!isString(s.active) || !Array.isArray(s.variants)) {
    return null;
  }
  if (s.variants.length === 0 || s.variants.length > MAX_VARIANTS) {
    return null;
  }
  const variants: StoredVariant[] = [];
  const seen = new Set<string>();
  for (const entry of s.variants) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null;
    }
    const v = entry as { id?: unknown; text?: unknown; name?: unknown };
    if (!isString(v.id) || !isString(v.text) || v.text.length > MAX_PARAMS_BYTES) {
      return null;
    }
    if (v.name !== undefined && !isString(v.name)) {
      return null;
    }
    if (seen.has(v.id)) {
      return null;
    }
    seen.add(v.id);
    variants.push(
      v.name === undefined ? { id: v.id, text: v.text } : { id: v.id, text: v.text, name: v.name },
    );
  }
  if (!variants.some((v) => v.id === s.active)) {
    return null;
  }
  return { active: s.active, variants };
}
