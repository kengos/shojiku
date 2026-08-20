// What the format catalog actually DEPENDS ON, as a comparable string.
//
// The catalog is a function of (locale pack, `defaults:`, `formats:`) — nothing
// in `sections:` can change it. Keying the engine call on the whole document
// would therefore ask the engine again on every body keystroke, for an answer
// that cannot have changed; keying it on this slice means typing in the page
// costs no engine call at all, while editing a format default costs exactly
// one.
//
// A TEXTUAL slice rather than a parse: this runs on every keystroke, the answer
// only has to be a stable comparison key (never a value anyone reads), and a
// document that does not parse still has to produce one — that is precisely
// when a live picker must keep working.

/** The top-level blocks the catalog reads. `locale` and `currency` live inside
 * `defaults:`, so the two blocks cover all three inputs. */
const BLOCKS: readonly string[] = ['formats:', 'defaults:'];

/** Whether a line opens a top-level key (column 0, non-blank, not a comment
 * continuation of the block above). */
function isTopLevel(line: string): boolean {
  return line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
}

/** The catalog-relevant slice of `text`. Blocks are emitted in the order they
 * appear, so moving one changes the key — a false miss (one extra engine call),
 * never a stale catalog. */
export function formatCatalogKey(text: string): string {
  const out: string[] = [];
  let capturing = false;
  for (const line of text.split('\n')) {
    if (isTopLevel(line)) {
      capturing = BLOCKS.some((block) => line.startsWith(block));
    }
    if (capturing) {
      out.push(line);
    }
  }
  return out.join('\n');
}
