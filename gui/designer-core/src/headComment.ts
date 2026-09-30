// The comment above a BLOCK sequence's first entry, for `moveItem`
// (`seqMove.ts`). `eemeli/yaml` parses that comment onto the SEQUENCE
// (`commentBefore`), while every later entry's leading comment sits on the
// entry itself — so a bare splice would leave entry 0's comment at the top of
// the list, above whichever entry is now first.
//
// The author's blank line decides whose it is. The lines directly above the
// entry — below the last blank line — are the entry's and travel with it; the
// lines above that blank line are a note about the whole list and stay at the
// top. The parser keeps a blank line as an empty line of the comment (a bare
// `#` line is a single space, so the two never collide), and the serializer
// writes it back, so the reading survives every save.
//
// A FLOW sequence is left alone: a comment above `[ … ]` is the list's, and on
// an entry it would render inside the brackets. No public surface — pinned
// through `applyOp` in `seqMove.test.ts`.

import type { Node, YAMLSeq } from 'yaml';

/** Two comment blocks stacked, either of which may be absent. */
function joined(above: string | null | undefined, below: string | null | undefined) {
  if (above == null) {
    return below;
  }
  return below == null ? above : `${above}\n${below}`;
}

/** Hand the entry's part of the sequence's comment to the first entry, for
 * the duration of a move. The list's part — everything down to and including
 * the last blank line — stays on the sequence. The entry's part is joined
 * ABOVE a comment the entry already carries, which is how the two render. */
export function lift(seq: YAMLSeq): void {
  const first = seq.items[0] as Node | undefined;
  if (seq.flow === true || first === undefined || seq.commentBefore == null) {
    return;
  }
  const lines = seq.commentBefore.split('\n');
  const blank = lines.lastIndexOf('');
  const head = lines.slice(blank + 1).join('\n');
  seq.commentBefore = blank < 0 ? undefined : lines.slice(0, blank + 1).join('\n');
  first.commentBefore = joined(head === '' ? undefined : head, first.commentBefore);
}

/** The inverse of `lift`, run after the move: the (possibly new) first
 * entry's comment goes back onto the sequence, BELOW the list's part — the
 * shape the parser gives it, so the document stays at the serializer's fixed
 * point. */
export function settle(seq: YAMLSeq): void {
  const first = seq.items[0] as Node | undefined;
  if (seq.flow === true || first === undefined || first.commentBefore == null) {
    return;
  }
  seq.commentBefore = joined(seq.commentBefore, first.commentBefore);
  first.commentBefore = undefined;
}

/** A comment an EMPTY sequence carried is about the list — there was no entry
 * for it to describe. When the first entry lands, end it with a blank line so
 * it keeps reading as the list's rather than becoming that entry's. */
export function keepAsListNote(seq: YAMLSeq): void {
  const note = seq.commentBefore;
  if (note != null && !note.endsWith('\n')) {
    seq.commentBefore = `${note}\n`;
  }
}
