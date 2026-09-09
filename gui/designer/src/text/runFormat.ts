// Applying a mark to the selection — the "auto split" half. Selecting three
// words and pressing bold splits the fragments underneath; the reader never
// sees a boundary, never places one, and never manages one. That is the whole
// point of the surface (Notion, Docs and Word all behave this way), so the
// split is a consequence of the format, never a control of its own.
//
// SPLIT, THEN PAINT — deliberately NOT `Range.surroundContents`. Both were
// measured in a real browser: `surroundContents` succeeds for a selection
// inside one run but throws `InvalidStateError` across runs, and the
// `extractContents` + `insertNode` fallback that does work leaves the partial
// runs NESTED inside the new wrapper. Splitting first makes every affected
// fragment a whole element, so the paint is one uniform assignment with no
// nesting to compose and no error branch to pick between. The serializer still
// composes nesting, because a paste or a native undo can produce some — but
// this file never does.

import { rangeInRoot } from './editorDom';
import { paintRun, RUN_ATTR } from './runNodes';
import { marksOfElement } from './runSerialize';
import type { RunMarks } from './spanRuns';

const RUN_SELECTOR = `[${RUN_ATTR}]`;

function runAncestor(root: HTMLElement, node: Node | null): HTMLElement | null {
  const from = node instanceof Element ? node : (node?.parentElement ?? null);
  const run = from?.closest(RUN_SELECTOR) ?? null;
  return run instanceof HTMLElement && root.contains(run) ? run : null;
}

/** The run one END of a range names. A range boundary is not always inside a
 * text node — the browser puts it on the PARENT with a child offset after any
 * structural change, and `reselect` below does exactly that — so a boundary
 * that resolves to no run is retried against the child it points AT. */
function boundaryRun(
  root: HTMLElement,
  container: Node,
  offset: number,
  atEnd: boolean,
): HTMLElement | null {
  const direct = runAncestor(root, container);
  if (direct !== null || !(container instanceof Element)) {
    return direct;
  }
  return runAncestor(root, container.childNodes[atEnd ? offset - 1 : offset] ?? null);
}

/** Cut `run` only when the boundary is genuinely INSIDE it. A boundary sitting
 * on the parent already lies at a fragment edge, and handing `splitRunAt` a
 * point outside the run would build a range across two containers. */
function cutAt(run: HTMLElement, container: Node, offset: number): HTMLElement | null {
  return run.contains(container) ? splitRunAt(run, container, offset) : null;
}

/** Cut `run` at (`node`, `offset`), moving everything AFTER the point into a
 * fresh sibling that carries the same attributes. Returns that sibling, or
 * `null` when the point is already the run's end and nothing needs to move.
 *
 * The clone keeps `data-sj-run`, which is exactly what makes the two halves
 * indistinguishable to the attribute — and why `runIdentity` treats a repeated
 * index as provenance rather than identity. */
export function splitRunAt(run: HTMLElement, node: Node, offset: number): HTMLElement | null {
  const doc = run.ownerDocument;
  const last = run.lastChild;
  // An empty run has nothing after any point in it, and `setEndAfter(run)`
  // would put the range's end in the PARENT — a range spanning the run's own
  // closing tag, which is not what "the rest of this run" means.
  if (last === null) {
    return null;
  }
  // Nothing BEFORE the point either: a cut at a run's start would move the whole
  // run into the sibling and leave the original EMPTY — a fragment nobody
  // authored, written to the wire as `text: ""`.
  //
  // And the engine says NOTHING about it: `validate/spans.rs` fires
  // `empty_span` only for `(None, None)`, and an emptied fragment is
  // `Some("")`. So the leftover is silent, which makes this guard the only
  // thing standing between "bold a word from its first letter" — the ordinary
  // case, not an edge one — and a remnant nothing reports.
  //
  // Symmetric with the tail check below.
  const head = doc.createRange();
  head.setStart(run, 0);
  head.setEnd(node, offset);
  if (head.toString() === '' && head.cloneContents().querySelector('*') === null) {
    return null;
  }
  const tail = doc.createRange();
  tail.setStart(node, offset);
  tail.setEndAfter(last);
  // "Nothing after the point" is about CONTENT, not about node count: a range
  // ending at a text node's end still clones an empty text node, so counting
  // children would mint an empty sibling for every cut at a run's end. An
  // element after the point (a chip, a bound body) counts even when it carries
  // no text of its own.
  if (tail.toString() === '' && tail.cloneContents().querySelector('*') === null) {
    return null;
  }
  const sibling = doc.createElement('span');
  for (const attribute of run.attributes) {
    sibling.setAttribute(attribute.name, attribute.value);
  }
  sibling.appendChild(tail.extractContents());
  run.after(sibling);
  return sibling;
}

/** Every run element under `root`, in document order — the order the slice
 * between two boundaries is taken in. */
function allRuns(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll(RUN_SELECTOR)].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

/** The run elements a selection covers once its two ends have been cut to
 * fragment boundaries. `null` when the selection is unusable — collapsed, or
 * not wholly inside the editor, or not landing on a run at all.
 *
 * The END is cut FIRST. Extracting a run's tail moves only nodes after the cut,
 * so a start boundary earlier in the document is still valid afterwards;
 * cutting the start first would invalidate an end point inside the same run. */
export function runsInSelection(root: HTMLElement, sel: Selection | null): readonly HTMLElement[] {
  const range = rangeInRoot(root, sel);
  if (range === null || range.collapsed) {
    return [];
  }
  const startRun = boundaryRun(root, range.startContainer, range.startOffset, false);
  const endRun = boundaryRun(root, range.endContainer, range.endOffset, true);
  if (startRun === null || endRun === null) {
    return [];
  }
  cutAt(endRun, range.endContainer, range.endOffset);
  const first = cutAt(startRun, range.startContainer, range.startOffset) ?? startRun;
  // When both ends sat in ONE run, the element that now ends the selection is
  // the middle piece, not `endRun` — the end cut left `endRun` holding
  // everything up to the end point, and the start cut then took the selected
  // middle OUT of it. Reading `endRun` here would name the piece BEFORE the
  // selection and describe an empty slice.
  const last = startRun === endRun ? first : endRun;
  const runs = allRuns(root);
  const from = runs.indexOf(first);
  const to = runs.indexOf(last);
  /* v8 ignore next 3 -- both elements are in the tree the slice is taken from,
     since every split inserts beside its own run. */
  if (from === -1 || to < from) {
    return [];
  }
  return runs.slice(from, to + 1);
}

/** Re-select the runs just painted, so pressing bold then italic works on the
 * same words without re-selecting them. */
function reselect(sel: Selection | null, runs: readonly HTMLElement[]): void {
  const first = runs[0];
  const last = runs[runs.length - 1];
  /* v8 ignore next 3 -- unreachable through `applyMarks`, the only caller: an
     empty run list returns before this, and a null selection cannot produce a
     range for `runsInSelection` to find runs in. Kept because the signature
     admits both, and a total function is cheaper than a cast. */
  if (sel === null || first === undefined || last === undefined) {
    return;
  }
  const range = first.ownerDocument.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Apply `next` to every fragment the selection covers, splitting as needed.
 * Returns whether the surface changed, so the caller knows whether to publish a
 * draft — a press that lands on a selection with nothing to format must not
 * report an edit. */
export function applyMarks(
  root: HTMLElement,
  sel: Selection | null,
  next: (current: RunMarks) => RunMarks,
): boolean {
  const runs = runsInSelection(root, sel);
  if (runs.length === 0) {
    return false;
  }
  for (const run of runs) {
    paintRun(run, next(marksOfElement(run)), run.classList.contains('sj-run--linked'));
  }
  reselect(sel, runs);
  return true;
}
