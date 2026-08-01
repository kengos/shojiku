// The id vocabulary of the mounted-host seam: what a host-supplied id may look
// like, and how a document key is composed from and split back into one. This
// is the guard a value must pass BEFORE it can reach a URL — traversal or path
// separators never leave here — so it sits below both the response readers and
// the client that fetches.

import { isSafeAssetName } from '../assets/paths';

/** Cap on a host-supplied id (project/template) — one URL path segment. */
const MAX_ID_CHARS = 64;

/** A host id is a single safe path segment: fixed charset, bounded length.
 * Checked before URL composition — traversal or separators never leave here. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ID_CHARS && isSafeAssetName(value);
}

/** A document key on the provider seam is `<projectId>/<templateId>` — `/` is
 * outside the id charset, so the split is unambiguous. */
export function docKey(projectId: string, templateId: string): string {
  return `${projectId}/${templateId}`;
}

export function splitKey(key: string): { projectId: string; templateId: string } | null {
  const parts = key.split('/');
  if (parts.length !== 2 || !isSafeId(parts[0]) || !isSafeId(parts[1])) {
    return null;
  }
  return { projectId: parts[0], templateId: parts[1] };
}
