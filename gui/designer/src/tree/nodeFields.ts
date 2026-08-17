// The pure field readers the tree's node builders share: what counts as a
// map, what a node's LABEL is, and the binding key inside a `data:`.
//
// Split from `model.ts` for the line budget; nothing here walks or recurses,
// which is exactly why these were the part to lift out.

/** Longest label a row shows before it is clipped. */
export const MAX_LABEL_CHARS = 60;

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function clip(value: string): string {
  return value.length > MAX_LABEL_CHARS ? `${value.slice(0, MAX_LABEL_CHARS)}…` : value;
}

/** The first non-empty string among candidate label sources, clipped. */
export function pickLabel(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') {
      return clip(candidate);
    }
  }
  return null;
}

export function bindingKey(value: unknown): string | undefined {
  const key = record(value)?.key;
  return typeof key === 'string' && key !== '' ? key : undefined;
}
