// The structural path grammar shared with the engine's box index
// (`sections.body.items[3].items[0]`, `columns[2]`, `cell.items[1]`): a
// dot-separated chain of map keys, each optionally followed by `[n]` sequence
// indices. This module is the ONE home that parses/formats that grammar, so
// the canvas can correlate an engine box back to a document node by an equal
// key.

export type PathSegment =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number };

export class PathSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathSyntaxError';
  }
}

const PART = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/;
const INDEX = /\[(\d+)\]/g;

/** Parse a path string into ordered segments. Throws `PathSyntaxError` on any
 * malformed input (empty, a non-identifier key, a stray bracket). */
export function parsePath(input: string): PathSegment[] {
  if (input.length === 0) {
    throw new PathSyntaxError('empty path');
  }
  const segments: PathSegment[] = [];
  for (const part of input.split('.')) {
    const matched = PART.exec(part);
    if (matched === null) {
      throw new PathSyntaxError(`invalid path segment: "${part}"`);
    }
    segments.push({ kind: 'key', key: matched[1] });
    for (const index of matched[2].matchAll(INDEX)) {
      segments.push({ kind: 'index', index: Number(index[1]) });
    }
  }
  return segments;
}

/** Render segments back to the canonical path string. */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '';
  for (const segment of segments) {
    if (segment.kind === 'key') {
      out = out === '' ? segment.key : `${out}.${segment.key}`;
    } else {
      out = `${out}[${segment.index}]`;
    }
  }
  return out;
}

/** Convert segments to the key/index array the `yaml` document API consumes
 * (`getIn` / `setIn` / `deleteIn`). */
export function toYamlPath(segments: readonly PathSegment[]): (string | number)[] {
  return segments.map((segment) => (segment.kind === 'key' ? segment.key : segment.index));
}
