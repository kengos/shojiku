// The fragment COLLECTOR a serializer walk feeds: text into the open fragment,
// a bound value as a fragment of its own, and a line break onto the END of the
// fragment before it (`lineBreak`). Split from `runSerialize`, which owns the
// walk over the DOM; this owns what the walk's findings become.

import type { LineState } from './lineBreaks';
import { EMPTY_RUN_PLACEHOLDER } from './runNodes';
import type { SerializedRun } from './runSerialize';
import { NO_MARKS, type RunMarks } from './spanRuns';

/** Both written as ESCAPES, never as the bytes: a literal U+00A0 or U+200B is
 * invisible in review and to `grep`, and turns the file binary to a census
 * sweep. `replaceAll` over the string spares a constructed RegExp, so the
 * placeholder has exactly one spelling — `runNodes`' constant. */
const NBSP = '\u00A0';

function wireText(raw: string): string {
  return raw.replaceAll(NBSP, ' ').replaceAll(EMPTY_RUN_PLACEHOLDER, '');
}

/** The run context a walk carries: which element owns the text it is reading,
 * with that element's composed marks and provenance. */
export interface Frame {
  readonly sourceIndex: number | null;
  readonly marks: RunMarks;
  readonly linked: boolean;
}

export const ROOT_FRAME: Frame = { sourceIndex: null, marks: NO_MARKS, linked: false };

export class Collector {
  /** `verbatim` skips the two normalizations (`wireText`): over a PLAIN item
   * the surface must read text the way the plain editor does — an authored
   * U+00A0 or U+200B is the author's, and normalizing it rewrote a `text:`
   * nobody touched. */
  constructor(private readonly verbatim = false) {}

  readonly out: SerializedRun[] = [];
  readonly line: LineState = { started: false };
  private buffer = '';
  private frame: Frame | null = null;
  /** A break with no text fragment before it to end — at the very start (a
   * leading BR) or straight after a bound value, which is atomic and cannot
   * carry one. It opens the next text fragment instead. */
  private pendingBreak = '';

  /** Close whatever fragment is open. An EMPTY buffer is still emitted when its
   * frame came from a real run element: a document may legitimately carry a
   * fragment with neither key (which the engine does report — `empty_span`
   * fires for `(None, None)`), and dropping it here would delete a node the
   * reader never asked to remove. Such a fragment round-trips as a `keep`,
   * because its content compares equal, so nothing is rewritten either.
   *
   * A fragment the reader EMPTIED is a different thing and is NOT reported: it
   * becomes `text: ""`, i.e. `Some("")`, which that predicate does not match.
   * `runFormat` is where the accidental version of that is prevented. */
  flush(): void {
    if (this.frame !== null && (this.buffer !== '' || this.frame.sourceIndex !== null)) {
      this.out.push({
        sourceIndex: this.frame.sourceIndex,
        kind: 'text',
        content: this.verbatim ? this.buffer : wireText(this.buffer),
        marks: this.frame.marks,
        linked: this.frame.linked,
      });
    }
    this.buffer = '';
    this.frame = null;
  }

  text(data: string, frame: Frame): void {
    if (this.frame !== frame) {
      this.flush();
      this.frame = frame;
    }
    this.buffer += this.pendingBreak + data;
    this.pendingBreak = '';
    this.line.started = true;
  }

  /** A line break: onto the open fragment, else onto the text fragment just
   * closed, else carried into the next one. */
  lineBreak(): void {
    if (this.frame !== null) {
      this.buffer += '\n';
      return;
    }
    const last = this.out[this.out.length - 1];
    if (last !== undefined && last.kind === 'text' && this.pendingBreak === '') {
      this.out[this.out.length - 1] = { ...last, content: `${last.content}\n` };
      return;
    }
    this.pendingBreak += '\n';
  }

  /** Close the walk. A break still waiting for a fragment (the reader ended
   * the surface with Enter after a bound value) becomes one of its own rather
   * than vanishing. */
  finish(): void {
    this.flush();
    if (this.pendingBreak !== '') {
      this.out.push({
        sourceIndex: null,
        kind: 'text',
        content: this.pendingBreak,
        marks: NO_MARKS,
        linked: false,
      });
      this.pendingBreak = '';
    }
  }

  bound(key: string, frame: Frame): void {
    this.flush();
    this.line.started = true;
    this.out.push({
      sourceIndex: frame.sourceIndex,
      kind: 'bound',
      content: key,
      marks: frame.marks,
      linked: frame.linked,
    });
  }
}
