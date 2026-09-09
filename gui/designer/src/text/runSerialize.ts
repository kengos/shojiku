// The flow surface's serializer: editor DOM → fragments, in DOCUMENT ORDER.
//
// The model is REBUILT here, never patched by index. Measured in a real
// browser: a split leaves two elements carrying the same `data-sj-run`, and a
// cross-run edit can nest one inside another — so the attribute is a
// PROVENANCE hint (`runIdentity` uses it to decide what went untouched), not an
// identity the write may address.
//
// Two normalizations, both from the same measurement session:
//   - the browser substitutes U+00A0 for a space it would otherwise collapse
//     (seen as `&nbsp;` after deleting across runs), and a non-breaking space
//     nobody typed must not reach the wire;
//   - the U+200B placeholder an empty run is seeded with is stripped, so the
//     thing that makes an empty fragment editable can never become content.
//
// Nesting is composed rather than refused. `runFormat` avoids creating it (it
// splits, then paints), but a paste, a native undo or an IME can restructure
// the surface, and a serializer that assumed flatness would silently drop the
// outer run's marks.

import { CHIP_WIRE_ATTR } from './chipModel';
import { BOUND_ATTR, EMPTY_RUN_PLACEHOLDER, RUN_ATTR } from './runNodes';
import { DECORATION_VALUES, type Decoration, NO_MARKS, type RunMarks } from './spanRuns';

/** One fragment as the surface now holds it. */
export interface SerializedRun {
  /** The wire index this run was seeded from, or `null` when the edit created
   * it. Only `runIdentity` reads it, and only to decide what is UNCHANGED. */
  readonly sourceIndex: number | null;
  readonly kind: 'text' | 'bound';
  /** For `text`, the wire text (chips restored to their `{key}` slices). For
   * `bound`, the binding key. */
  readonly content: string;
  readonly marks: RunMarks;
  readonly linked: boolean;
}

const CLASS_MARKS: ReadonlyMap<string, keyof RunMarks | Decoration> = new Map([
  ['sj-run--bold', 'bold'],
  ['sj-run--italic', 'italic'],
  ['sj-run--underline', 'underline'],
  ['sj-run--strike', 'line_through'],
]);

/** A run element's own marks, read back from the classes `paintRun` wrote. The
 * CLASS is the source of truth rather than the computed style: the class set is
 * ours, while a computed style also answers for the sheet, the theme and every
 * inherited rule, none of which is a fragment's authored value. */
export function marksOfElement(el: Element): RunMarks {
  let decoration: Decoration = 'none';
  let bold = false;
  let italic = false;
  for (const name of el.classList) {
    const mark = CLASS_MARKS.get(name);
    if (mark === 'bold') {
      bold = true;
    } else if (mark === 'italic') {
      italic = true;
    } else if (DECORATION_VALUES.some((value) => value === mark)) {
      decoration = mark as Decoration;
    }
  }
  return { bold, italic, decoration, color: colorOf(el) };
}

/** The inline colour `paintRun` set, normalized back to the `#rrggbb` the
 * document authored. A browser re-serializes an inline colour as `rgb(r, g, b)`,
 * so reading the property back verbatim would rewrite every coloured fragment
 * on the first commit that touched its neighbour. */
function colorOf(el: Element): string {
  const raw = el instanceof HTMLElement ? el.style.getPropertyValue('color').trim() : '';
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(raw);
  if (rgb === null) {
    return raw;
  }
  const hex = (index: number) => Number(rgb[index]).toString(16).padStart(2, '0');
  return `#${hex(1)}${hex(2)}${hex(3)}`;
}

/** Compose an ancestor's marks with a descendant's: a boolean mark is set when
 * EITHER carries it, and the two valued marks take the innermost that says
 * something (a nested run overriding its parent's colour is the whole reason a
 * nested run exists). */
function compose(outer: RunMarks, inner: RunMarks): RunMarks {
  return {
    bold: outer.bold || inner.bold,
    italic: outer.italic || inner.italic,
    decoration: inner.decoration === 'none' ? outer.decoration : inner.decoration,
    color: inner.color === '' ? outer.color : inner.color,
  };
}

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
interface Frame {
  readonly sourceIndex: number | null;
  readonly marks: RunMarks;
  readonly linked: boolean;
}

const ROOT_FRAME: Frame = { sourceIndex: null, marks: NO_MARKS, linked: false };

/** `raw` is passed IN rather than read here: the caller has already established
 * that the element carries the attribute, so re-reading it would add a
 * null branch nothing can reach. */
function frameFor(el: Element, raw: string, outer: Frame): Frame {
  const parsed = Number(raw);
  return {
    sourceIndex: Number.isInteger(parsed) ? parsed : null,
    marks: compose(outer.marks, marksOfElement(el)),
    linked: outer.linked || el.classList.contains('sj-run--linked'),
  };
}

class Collector {
  readonly out: SerializedRun[] = [];
  private buffer = '';
  private frame: Frame | null = null;

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
        content: wireText(this.buffer),
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
    this.buffer += data;
  }

  bound(key: string, frame: Frame): void {
    this.flush();
    this.out.push({
      sourceIndex: frame.sourceIndex,
      kind: 'bound',
      content: key,
      marks: frame.marks,
      linked: frame.linked,
    });
  }
}

function walk(node: Node, frame: Frame, into: Collector): void {
  if (node.nodeType === Node.TEXT_NODE) {
    into.text((node as Text).data, frame);
    return;
  }
  if (!(node instanceof Element)) {
    return;
  }
  const bound = node.getAttribute(BOUND_ATTR);
  if (bound !== null) {
    into.bound(bound, frame);
    return;
  }
  const chip = node.getAttribute(CHIP_WIRE_ATTR);
  if (chip !== null) {
    into.text(chip, frame);
    return;
  }
  const run = node.getAttribute(RUN_ATTR);
  const next = run === null ? frame : frameFor(node, run, frame);
  if (next !== frame) {
    into.flush();
  }
  for (const child of node.childNodes) {
    walk(child, next, into);
  }
  if (next !== frame) {
    into.flush();
  }
}

/** Every fragment the surface now holds, in document order. */
export function serializeRuns(root: Node): readonly SerializedRun[] {
  const into = new Collector();
  for (const child of root.childNodes) {
    walk(child, ROOT_FRAME, into);
  }
  into.flush();
  return into.out;
}
