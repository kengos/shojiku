// The anchor TARGETS an endpoint may pick from — read out of the box index
// rather than the document tree, so the list is exactly the set the engine
// can resolve: an id with no placement resolves to nothing, and offering it
// would only produce `anchor_unknown_target`.

import type { ReadFn } from '@shojiku/designer-core';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** This item's own authored `id:`, so the target list can exclude it. */
export function readItemId(read: ReadFn, path: string): string | undefined {
  try {
    const id = record(read(path))?.id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

/** The ids an endpoint could anchor to: every PLACED id except this line's
 * own (a self-anchor resolves to nothing — the drain writes the line's own
 * placement, so it is absent from the index it reads). Sourced from the box
 * index rather than the document tree, so the list is exactly what the
 * engine can resolve. */
export function anchorTargets(
  pages: readonly (readonly { readonly id?: string }[])[] | undefined,
  ownId: string | undefined,
): readonly string[] {
  const seen = new Set<string>();
  for (const page of pages ?? []) {
    for (const b of page) {
      if (b.id !== undefined && b.id !== ownId) {
        seen.add(b.id);
      }
    }
  }
  return [...seen].sort();
}
