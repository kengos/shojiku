// The ONE rule for where a LINE BREAK sits in the editor DOM, shared by both
// serializers — the plain surface's `chipModel.serializeEditor` and the flow
// surface's `runSerialize.serializeRuns`. Two copies of it are how the flow
// surface came to drop every break the reader typed with Enter: the browser
// answers Enter by minting a line container, and only one of the two walks
// knew that a container ends the line before it.
//
// The rule has three parts, all measured in a real browser:
//   - `<br>` is a break — except in FINAL position, where it is the placeholder
//     a browser adds so an empty last line has somewhere to put the caret, and
//     HTML gives it no height of its own (counting it made a value grow by one
//     break per reseed);
//   - a line container (`LINE_ENDING_TAGS`) ends the line BEFORE it, once a line
//     has begun — not at the very start, where there is no preceding line;
//   - "a line has begun" is a flag shared across the whole walk, not "something
//     was written yet": an EMPTY container writes nothing while still being a
//     line, and testing the output instead swallowed the break of whichever
//     container came after it.

/** Elements a browser mints to END A LINE inside a contenteditable, rather than
 * to decorate one. Nothing the editors build is one, and none can arrive by
 * paste or drop (both are forced through the plain-text ingress) — these appear
 * only when the BROWSER restructures the content itself. The reader pressing
 * ENTER is by far the commonest producer; a native undo, dictation and the DOM
 * an IME leaves behind on composition end are the rest. The list is short on
 * purpose; an element not on it is decorative and contributes only its text. */
const LINE_ENDING_TAGS: ReadonlySet<string> = new Set(['DIV', 'P', 'LI']);

/** Whether a line has begun anywhere in the walk so far. ONE object for the
 * whole walk, threaded through the recursion — that is what gets a container
 * nested inside a non-container right (`<ul><li>`). */
export interface LineState {
  started: boolean;
}

/** The children a walk visits: every child, minus a `<br>` in final position
 * (the caret placeholder above). */
export function lineChildren(node: Node): readonly Node[] {
  const children = Array.from(node.childNodes);
  const last = children[children.length - 1];
  if (last instanceof Element && last.tagName === 'BR') {
    children.pop();
  }
  return children;
}

/** Whether `el` is a `<br>` — a break with no content of its own, so a walk
 * stops at it rather than descending. */
export function isBreakElement(el: Element): boolean {
  return el.tagName === 'BR';
}

/** The break `el` contributes BEFORE its own content (`"\n"` or `""`), and the
 * line state it leaves behind. Call it for every element a walk reaches that is
 * not a chip or a bound value; mark text itself with `state.started = true`. */
export function breakBefore(el: Element, state: LineState): string {
  if (isBreakElement(el)) {
    state.started = true;
    return '\n';
  }
  if (!LINE_ENDING_TAGS.has(el.tagName)) {
    return '';
  }
  const out = state.started ? '\n' : '';
  state.started = true;
  return out;
}
