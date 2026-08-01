// What a stored draft LOOKS LIKE, in both directions. A draft holds the edited
// template YAML, the picked fonts' MANIFESTS (never their bytes — localStorage
// cannot carry a font; the manifest's `url:` pins are how the bytes come back
// on reload), and, for a mounted host's document, the revision token the
// working copy was based on. It rides a versioned envelope so a schema bump is
// detectable and a corrupted entry degrades to a clean miss (never a thrown
// parse error into the UI). Reading and writing that envelope live together
// here so the shape has ONE home; `drafts.ts` owns only the storage around it.

import {
  DEFAULT_VARIANT_ID,
  MAX_NAME_CHARS,
  type Op,
  type StoredSampleSet,
  sanitizeDefsEdits,
  type TemplateDoc,
} from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';
import { isInstalledFont, isString, parseStoredSample } from './storedDoc';

/** What a draft carries. `fonts` is empty when nothing was picked; `sample` and
 * `definitions` carry the editable sample-variant set and (blank-start) its
 * inferred stub; `name` is the user's header rename (absent = the preset / host
 * display name). */
export type Draft = TemplateDoc;

interface DraftEnvelope {
  readonly v: 6;
  readonly text: string;
  readonly fonts: readonly InstalledFont[];
  readonly rev?: string;
  readonly sample?: StoredSampleSet;
  readonly definitions?: string;
  readonly definitionsEdits?: readonly Op[];
  readonly name?: string;
}

/** The current-version envelope for a draft — optional parts are omitted
 * entirely rather than stored as `undefined`. */
export function buildEnvelope(draft: Draft): DraftEnvelope {
  return {
    v: 6,
    text: draft.text,
    fonts: draft.fonts,
    ...(draft.rev !== undefined ? { rev: draft.rev } : {}),
    ...(draft.sample !== undefined ? { sample: draft.sample } : {}),
    ...(draft.definitions !== undefined ? { definitions: draft.definitions } : {}),
    ...(draft.definitionsEdits !== undefined ? { definitionsEdits: draft.definitionsEdits } : {}),
    ...(draft.name !== undefined ? { name: draft.name } : {}),
  };
}

/** Parse a stored envelope into a Draft: the current v6 shape (v5 + the
 * definition-edit ops), the v4/v5 shapes (fonts + optional sample-variant set
 * + definitions text (+ v5's rename)), the v3 shape (a single `params` string
 * upgraded to a one-variant default set), the v2 shape (fonts, no sample), or
 * the v1 text-only shape (upgraded to an empty font list — losing a user's
 * draft over a schema bump is worse than losing its font picks, which v1 never
 * had). Anything else — an envelope whose sample/definitions/edit-list is
 * present but malformed — is corrupted (a clean miss). */
export function parseEnvelope(parsed: unknown): Draft | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const envelope = parsed as {
    v?: unknown;
    text?: unknown;
    fonts?: unknown;
    rev?: unknown;
    params?: unknown;
    sample?: unknown;
    definitions?: unknown;
    definitionsEdits?: unknown;
    name?: unknown;
  };
  if (!isString(envelope.text)) {
    return null;
  }
  if (envelope.v === 1) {
    return { text: envelope.text, fonts: [] };
  }
  const fontsOk = Array.isArray(envelope.fonts) && envelope.fonts.every(isInstalledFont);
  const rev = isString(envelope.rev) ? envelope.rev : undefined;
  if (envelope.v === 2 && fontsOk) {
    return { text: envelope.text, fonts: envelope.fonts as InstalledFont[], rev };
  }
  if (envelope.definitions !== undefined && !isString(envelope.definitions)) {
    return null;
  }
  // The optional header rename (v5+). A present-but-non-string name is
  // corruption (the whole draft is a clean miss); an over-long one is clipped,
  // not rejected — user-writable storage never yields more than the cap.
  if (envelope.name !== undefined && !isString(envelope.name)) {
    return null;
  }
  const name = isString(envelope.name) ? envelope.name.slice(0, MAX_NAME_CHARS) : undefined;
  // The definition-edit ops (v6). A present-but-non-array value is corruption
  // (clean miss, like a bad sample); entries are hostile storage, so they are
  // shape-sanitized here and re-validated by designer-core at apply.
  if (envelope.definitionsEdits !== undefined && !Array.isArray(envelope.definitionsEdits)) {
    return null;
  }
  const definitionsEdits =
    envelope.definitionsEdits === undefined
      ? undefined
      : sanitizeDefsEdits(envelope.definitionsEdits);
  const base = {
    text: envelope.text,
    fonts: envelope.fonts as InstalledFont[],
    rev,
    definitions: envelope.definitions as string | undefined,
    definitionsEdits,
    name,
  };
  if (envelope.v === 3 && fontsOk) {
    // The v3 single params string becomes a one-variant default set. A
    // present-but-non-string params is corruption, not a field to drop.
    if (envelope.params !== undefined && !isString(envelope.params)) {
      return null;
    }
    const sample: StoredSampleSet | undefined =
      envelope.params === undefined
        ? undefined
        : {
            active: DEFAULT_VARIANT_ID,
            variants: [{ id: DEFAULT_VARIANT_ID, text: envelope.params }],
          };
    return { ...base, sample };
  }
  // v4 (no name), v5 (optional name) and v6 (optional definition-edit ops)
  // parse identically for the sample set — the name and the edits are read
  // into `base` above regardless of version.
  if ((envelope.v === 4 || envelope.v === 5 || envelope.v === 6) && fontsOk) {
    if (envelope.sample === undefined) {
      return { ...base, sample: undefined };
    }
    const sample = parseStoredSample(envelope.sample);
    return sample === null ? null : { ...base, sample };
  }
  return null;
}
