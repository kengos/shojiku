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
// Line breaks follow `lineBreaks`, the rule the plain surface's serializer
// applies too. Measured in a real browser: Enter inside a run mints a `<div>`
// holding a CLONE of the run element (same `data-sj-run`, same mark classes),
// and before this file applied that rule the break the reader typed was simply
// lost — "第一行" + Enter + "X" came back as two fragments with no "\n" between
// them. A break belongs to the END of the fragment before it, and the clone's
// text then rejoins its source in `coalesce`, so Enter inside one fragment
// still yields one fragment.
//
// Nesting is composed rather than refused. `runFormat` avoids creating it (it
// splits, then paints), but a paste, a native undo or an IME can restructure
// the surface, and a serializer that assumed flatness would silently drop the
// outer run's marks.

import { CHIP_WIRE_ATTR } from './chipModel';
import { breakBefore, isBreakElement, lineChildren } from './lineBreaks';
import { Collector, type Frame, ROOT_FRAME } from './runCollector';
import { compose, marksOfElement } from './runElementMarks';
import { BOUND_ATTR, RUN_ATTR } from './runNodes';
import { type RunMarks, sameMarks } from './spanRuns';

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
  if (breakBefore(node, into.line) !== '') {
    into.lineBreak();
  }
  if (isBreakElement(node)) {
    return;
  }
  const run = node.getAttribute(RUN_ATTR);
  const next = run === null ? frame : frameFor(node, run, frame);
  if (next !== frame) {
    into.flush();
  }
  for (const child of lineChildren(node)) {
    walk(child, next, into);
  }
  if (next !== frame) {
    into.flush();
  }
}

/** Whether two neighbouring fragments are one fragment the DOM happens to hold
 * as two elements: both text, from the same source (or both new), saying the
 * same marks. A split the reader then un-marked, and the run clone Enter mints,
 * are both this shape; two fragments the document authored side by side are
 * not, because their source indices differ. */
function sameFragment(a: SerializedRun, b: SerializedRun): boolean {
  return (
    a.kind === 'text' &&
    b.kind === 'text' &&
    a.sourceIndex === b.sourceIndex &&
    a.linked === b.linked &&
    sameMarks(a.marks, b.marks)
  );
}

function coalesce(runs: readonly SerializedRun[]): readonly SerializedRun[] {
  const out: SerializedRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last !== undefined && sameFragment(last, run)) {
      out[out.length - 1] = { ...last, content: last.content + run.content };
    } else {
      out.push(run);
    }
  }
  return out;
}

/** Every fragment the surface now holds, in document order. */
export function serializeRuns(root: Node, verbatim = false): readonly SerializedRun[] {
  const into = new Collector(verbatim);
  for (const child of lineChildren(root)) {
    walk(child, ROOT_FRAME, into);
  }
  into.finish();
  return coalesce(into.out);
}
