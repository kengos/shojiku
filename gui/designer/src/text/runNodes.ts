// Seeding the flow surface: runs → editor DOM. Built entirely through DOM APIs
// for the same reason `chipModel` is — a fragment's text, its colour and its
// binding key are all attacker-controlled strings, and none of them may reach
// `innerHTML`.
//
// A MARK is applied as a CLASS, never as a document-derived `style` attribute,
// so three of the four marks open no CSS surface at all. Colour is the one mark
// whose VALUE comes from the document, and it goes through `isHexColor` — the
// repo's existing single door for that ("a document-derived colour reaches an
// inline style ONLY through this").
//
// A `data:` fragment is seeded as an ATOMIC element: the flow cannot split what
// it cannot address, and the user's decision is that these are read and
// preserved, never minted.

import { clip } from '../tree/nodeFields';
import { isHexColor } from '../ui/chipContrast';
import { buildEditorNodes, type ChipMeta } from './chipModel';
import type { RunMarks, RunView } from './spanRuns';

/** Marks an element as one wire fragment, holding its wire index. The
 * serializer reads fragment structure ONLY from elements carrying it. */
export const RUN_ATTR = 'data-sj-run';

/** Marks a `data:` fragment's atomic body, holding the binding key. Distinct
 * from `CHIP_WIRE_ATTR` on purpose: a CHIP contributes `{key}` to its run's
 * text, while this element IS the fragment and contributes no text at all. */
export const BOUND_ATTR = 'data-sj-bound';

export const RUN_CLASS = 'sj-run';
export const BOUND_CLASS = 'sj-run-bound';

/** Mark → class. The decoration's three states collapse to two classes plus
 * "no class", which is what keeps `none` from needing one.
 *
 * Deliberately a plain object rather than the `Map` `chipModel` prescribes, and
 * the difference is the KEY's provenance. That rule is about binding keys,
 * which come from a document and really can be `__proto__`; every key read here
 * is either a literal in this file or a `Decoration`, which `decorationOf`
 * narrows to one of three values before it can arrive. The type system is the
 * guard, and a `Map` would turn the two constant reads below into non-null
 * assertions for nothing. `runSerialize`'s own table IS a `Map` because it is
 * built by scanning a live `classList`. */
const MARK_CLASSES: Readonly<Record<string, string>> = {
  bold: 'sj-run--bold',
  italic: 'sj-run--italic',
  underline: 'sj-run--underline',
  line_through: 'sj-run--strike',
  linked: 'sj-run--linked',
};

/** The classes one mark set paints. Exported because the format bar's own
 * preview and the surface's live re-paint after a toggle must agree with the
 * seed, and a second copy of this mapping is a second thing to keep true. */
export function runClasses(marks: RunMarks, linked: boolean): readonly string[] {
  const out = [RUN_CLASS];
  if (marks.bold) {
    out.push(MARK_CLASSES.bold);
  }
  if (marks.italic) {
    out.push(MARK_CLASSES.italic);
  }
  const decoration = MARK_CLASSES[marks.decoration];
  if (decoration !== undefined) {
    out.push(decoration);
  }
  if (linked) {
    out.push(MARK_CLASSES.linked);
  }
  return out;
}

/** Paint a run element's marks. Split from the builder because a toggle
 * re-paints a LIVE element the browser has since restructured, and applying the
 * marks two different ways is how the seed and the live surface drift. */
export function paintRun(el: HTMLElement, marks: RunMarks, linked: boolean): void {
  el.setAttribute('class', runClasses(marks, linked).join(' '));
  // Cleared first, so a run losing its colour does not keep the old one: an
  // empty `setProperty` is a no-op, not a removal.
  el.style.removeProperty('color');
  if (isHexColor(marks.color)) {
    el.style.setProperty('color', marks.color);
  }
}

/** The atomic body of a `data:` fragment. `contentEditable=false` is what makes
 * it atomic — the browser then treats it as one object for caret movement and
 * for deletion, exactly as it treats a chip (measured: a fully-selected one is
 * removed whole rather than eroded). */
function boundBody(doc: Document, key: string, meta: ReadonlyMap<string, ChipMeta>): HTMLElement {
  const el = doc.createElement('span');
  el.className = BOUND_CLASS;
  el.setAttribute(BOUND_ATTR, key);
  el.setAttribute('contenteditable', 'false');
  // The picker's own label when the key is a known field, else the key itself —
  // a bound fragment naming an unknown key must still say WHICH key, or the
  // reader is looking at an unlabelled box.
  //
  // CLIPPED, and both halves need it: the key is document text and the label is
  // definitions text, and the Designer treats BOTH as untrusted. The panel's
  // own row clips at the same `MAX_LABEL_CHARS`, so a reader who meets one
  // fragment in both places is told the same amount. The fragment's TEXT is
  // deliberately NOT clipped one line below — that is the content being edited,
  // and clipping it would corrupt the document on the next commit.
  el.appendChild(doc.createTextNode(clip(meta.get(key)?.label ?? key)));
  return el;
}

/** One run element, seeded. A `text` fragment's children come from
 * `buildEditorNodes`, so `{key}` interpolation inside a fragment renders as the
 * same chips the plain surface shows and stays editable the same way. */
export function buildRunNode(
  doc: Document,
  run: RunView,
  meta: ReadonlyMap<string, ChipMeta>,
): HTMLElement {
  const el = doc.createElement('span');
  el.setAttribute(RUN_ATTR, String(run.index));
  paintRun(el, run.marks, run.linked);
  if (run.kind === 'bound') {
    el.appendChild(boundBody(doc, run.content, meta));
    return el;
  }
  for (const node of buildEditorNodes(doc, run.content, meta)) {
    el.appendChild(node);
  }
  return el;
}

/** Every run, in wire order — what the surface seeds its content from ONCE.
 *
 * An EMPTY run is seeded with a zero-width space rather than nothing. A span
 * holding no text node has no place a caret can rest, so the browser skips it
 * and the fragment becomes uneditable and invisible; the placeholder is
 * stripped again by the serializer, which is why it can never reach the wire. */
export function buildRunNodes(
  doc: Document,
  runs: readonly RunView[],
  meta: ReadonlyMap<string, ChipMeta>,
): readonly Node[] {
  return runs.map((run) => {
    const el = buildRunNode(doc, run, meta);
    if (el.childNodes.length === 0) {
      el.appendChild(doc.createTextNode(EMPTY_RUN_PLACEHOLDER));
    }
    return el;
  });
}

/** The zero-width space (U+200B) an empty fragment is seeded with. Written as
 * an escape, never as the byte: a literal control character is invisible both
 * in review and to `grep`, and makes the file binary to a census sweep. */
export const EMPTY_RUN_PLACEHOLDER = '\u200B';
