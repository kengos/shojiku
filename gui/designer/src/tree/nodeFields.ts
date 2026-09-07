// The pure field readers the tree's node builders share: what counts as a
// map, what a node's LABEL is, and the binding key inside a `data:`.
//
// Split from `model.ts` for the line budget; nothing here walks or recurses,
// which is exactly why these were the part to lift out.

/** Longest label a row shows before it is clipped. */
export const MAX_LABEL_CHARS = 60;

/** What a label says in place of the lines it is not showing. HTML collapses a
 * `\n` to a SPACE, so a three-line address used to arrive as one space-joined
 * string that read like a typo, with nothing to say the value had been
 * shortened. (The row itself no longer sets `white-space: nowrap` — it wraps
 * and clamps — but that changes nothing here: the collapse is the default
 * `normal` behaviour, not something the old nowrap caused.) */
const MORE_LINES = ' ⏎…';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function clip(value: string): string {
  return clipTo(value, MAX_LABEL_CHARS);
}

function clipTo(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** One line of label for a value that may hold several: the first line, plus a
 * marker when there are more.
 *
 * The marker is appended AFTER clipping, against a budget already reduced by
 * its own length — clipping last would cut off the very thing that says the
 * label is partial, which is the case a long Japanese address hits first. The
 * budget also has to pay for the ellipsis `clipTo` adds, or a clipped first
 * line plus the marker lands one character over the cap. A value whose only
 * break is a trailing one still counts as multi-line: the engine reads that
 * break, so the page really does carry the extra line. */
export function labelLine(value: string): string {
  const lines = value.split('\n');
  if (lines.length === 1) {
    return clip(value);
  }
  // The first line with something ON it, not simply the first: a value that
  // opens with a blank line would otherwise label the row with the marker
  // alone — strictly worse than the space-joined string this replaced, which
  // at least showed the address.
  const first = (lines.find((line) => line.trim() !== '') ?? '').replace(/\r$/, '');
  return clipTo(first, MAX_LABEL_CHARS - MORE_LINES.length - 1) + MORE_LINES;
}

/** The first non-empty string among candidate label sources, as one clipped
 * line. */
export function pickLabel(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') {
      return labelLine(candidate);
    }
  }
  return null;
}

/** The first fragment's own content, for a text item whose words live in
 * `spans:` rather than in `text:`. Without it every rich-text item labels its
 * tree row with the bare kind name — `examples/dev/layout-showcase` shows three
 * indistinguishable `Text` rows — and the tree is how a reader REACHES the
 * fragment list in the first place.
 *
 * `data` before `text`, the engine's own order (`resolve_content` asks the
 * binding first, and `validate/spans.rs` reports the conflict with
 * `winner: data`). Hostile shapes degrade to `undefined` rather than throwing,
 * exactly as `bindingKey` does. */
export function spanLabel(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const entry of value) {
    const span = record(entry);
    if (span === undefined) {
      continue;
    }
    const key = bindingKey(span.data);
    if (key !== undefined) {
      return key;
    }
    if (typeof span.text === 'string' && span.text !== '') {
      return span.text;
    }
  }
  return undefined;
}

export function bindingKey(value: unknown): string | undefined {
  const key = record(value)?.key;
  return typeof key === 'string' && key !== '' ? key : undefined;
}
