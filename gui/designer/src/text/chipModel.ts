// Pure model for the interpolation chips inside the shared text editor: turn
// a text value's raw segments into editor DOM nodes (literal text nodes +
// atomic chip spans), and serialize the editor DOM back to wire text. The
// chip layer is display-only — a chip carries its exact wire slice in a data
// attribute, literals stay verbatim text nodes, so serialization is the
// identity for untouched content. Everything is built through DOM APIs
// (labels and samples are attacker-controlled strings — never HTML), and
// chip metadata lives in a real `Map` (binding keys are hostile strings like
// `__proto__`; a plain-object table would walk the prototype).

import { parseRawSegments, type RawSegment } from './interpolate';

/** What a chip displays for a known key: the field's label and its bounded
 * sample display string (both from the binding picker's options, which
 * already bound their display forms). */
export interface ChipMeta {
  readonly label: string;
  readonly sample: string;
}

/** The chip span's marker attribute, holding the exact wire slice the chip
 * stands for (`{key}` / `{key:format}`). The serializer reads wire text ONLY
 * from elements carrying it. */
export const CHIP_WIRE_ATTR = 'data-sj-wire';

export const CHIP_CLASS = 'sj-chip';

/** Marks the chip the field menus are pointed at. Applied to the live node
 * rather than rendered, because the editor's content is imperative DOM React
 * never reconciles. */
export const CHIP_SELECTED_CLASS = 'sj-chip--selected';

/** The shape a chip's metadata is indexed from — the binding picker's rows,
 * named so the declaration model can consume the same contract. */
export interface ChipOptionRow {
  readonly key: string;
  readonly label: string;
  readonly sample: string;
}

/** Index picker options (or any key/label/sample rows) into the chip
 * metadata map. Later duplicates lose — first appearance wins, matching the
 * picker's own ordering. */
export function chipMetaMap(options: readonly ChipOptionRow[]): ReadonlyMap<string, ChipMeta> {
  const map = new Map<string, ChipMeta>();
  for (const option of options) {
    if (!map.has(option.key)) {
      map.set(option.key, { label: option.label, sample: option.sample });
    }
  }
  return map;
}

/** The wire slice a picker insertion writes for `key` — or `null` when the
 * key cannot spell a single interpolation expression (charset-unsafe keys
 * would degrade to literal text; the insert menu offers only safe keys,
 * checked by round-tripping through the ONE parser, never a second charset —
 * the iterable scaffold's precedent). */
export function chipWire(key: string): string | null {
  const raw = `{${key}}`;
  const segments = parseRawSegments(raw);
  const only = segments.length === 1 ? segments[0] : undefined;
  return only !== undefined && only.kind === 'expr' && only.key === key ? raw : null;
}

/** The single expression a chip's stored wire slice stands for, or `undefined`
 * when the slice is not exactly one of them. The attribute is document-derived,
 * so it is read back through the ONE parser rather than trusted: a hand-crafted
 * `data-sj-wire` holding two expressions, an unterminated one, or a plain
 * literal all answer `undefined`. `null` in is answered too, so a caller can
 * hand `getAttribute` straight through. */
function oneChipExpr(raw: string | null): Extract<RawSegment, { kind: 'expr' }> | undefined {
  if (raw === null) {
    return undefined;
  }
  const segments = parseRawSegments(raw);
  const only = segments.length === 1 ? segments[0] : undefined;
  return only !== undefined && only.kind === 'expr' ? only : undefined;
}

/** The format inside a chip's stored wire slice — `null` when the slice is not
 * exactly one expression, or carries no format. */
export function chipFormatOf(raw: string | null): string | null {
  return oneChipExpr(raw)?.format ?? null;
}

/** What a chip's pill READS for a stored wire slice: the bound field's label
 * when the metadata knows the name, else the name itself — the same fallback
 * `chipSpan` paints, so a control naming the selected chip says exactly what
 * the pill beside it says. Empty for a slice that is not one expression. */
export function chipLabelOf(raw: string | null, meta: ReadonlyMap<string, ChipMeta>): string {
  const expr = oneChipExpr(raw);
  if (expr === undefined) {
    return '';
  }
  return meta.get(expr.key)?.label ?? expr.key;
}

/** `wire` (a slice a plan already proved writable, `{name}`) re-expressed
 * carrying `format`. Composed and then PROVEN by reading it back through the
 * ONE parser: a format the grammar cannot carry degrades to the bare slice
 * rather than being spliced in, so a crafted format can never close the
 * expression early and turn the author's following text into wire they never
 * wrote. Total — the proven input is the fallback. */
export function chipWireWithFormat(wire: string, format: string | null): string {
  if (format === null) {
    return wire;
  }
  const raw = `${wire.slice(0, -1)}:${format}}`;
  return chipFormatOf(raw) === format ? raw : wire;
}

/** Build one atomic chip span for an expression: non-editable, labeled with
 * the field's label (an unknown key shows the key itself), the key and
 * sample surfaced as a tooltip. */
export function chipSpan(
  doc: Document,
  raw: string,
  key: string,
  format: string | null,
  meta: ReadonlyMap<string, ChipMeta>,
): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = CHIP_CLASS;
  span.setAttribute('contenteditable', 'false');
  span.setAttribute(CHIP_WIRE_ATTR, raw);
  const known = meta.get(key);
  const label = doc.createElement('span');
  label.className = 'sj-chip-label';
  label.textContent = known === undefined ? key : known.label;
  span.appendChild(label);
  if (format !== null) {
    const badge = doc.createElement('span');
    badge.className = 'sj-chip-format';
    badge.textContent = format;
    span.appendChild(badge);
  }
  const sample = known === undefined || known.sample === '' ? '' : ` = ${known.sample}`;
  span.title = `${raw}${sample}`;
  return span;
}

/** The editor's content nodes for a wire text value: literal segments become
 * verbatim text nodes (escapes stay visible — raw syntax is the expert
 * path), expressions become chip spans. */
export function buildEditorNodes(
  doc: Document,
  text: string,
  meta: ReadonlyMap<string, ChipMeta>,
): readonly Node[] {
  return parseRawSegments(text).map((segment) =>
    segment.kind === 'literal'
      ? doc.createTextNode(segment.raw)
      : chipSpan(doc, segment.raw, segment.key, segment.format, meta),
  );
}

/** Elements a browser mints to END A LINE inside a contenteditable, rather than
 * to decorate one. Nothing here is built by this file and none of it can arrive
 * by paste or drop (both are forced through the plain-text ingress) — these
 * appear only when the BROWSER restructures the content itself. The reader
 * pressing ENTER is by far the commonest producer; a native undo, dictation and
 * the DOM an IME leaves behind on composition end are the rest. The list is
 * short on purpose; an element not on it is decorative and contributes only its
 * text, exactly as before. */
const LINE_ENDING_TAGS: ReadonlySet<string> = new Set(['DIV', 'P', 'LI']);

/** Serialize the editor DOM back to wire text: text nodes verbatim, a chip
 * contributes its stored wire slice, `<br>` reads as a newline, and any
 * other element (nothing we build; paste is plain-text-only) degrades to its
 * serialized children — a foreign node can never contribute more wire than
 * its visible text.
 *
 * Degrading is not the same as flattening. A browser-minted `<div>` per line
 * SHOWS as separate lines, so dropping its boundary silently joined the
 * reader's lines back together — a value that looked right in the field and
 * saved wrong. Such an element therefore contributes the break it displays,
 * suppressed at the very start where there is no preceding line to end.
 *
 * A `<br>` in FINAL position is the opposite case and contributes nothing: it
 * is the placeholder a browser adds so an empty last line has somewhere to put
 * the caret, and HTML gives it no height of its own. Counting it as a break
 * made the value GROW: the editor seeds `a\n`, the browser adds its
 * placeholder, the next commit writes `a\n\n`, and each reseed adds another —
 * an unbounded loop that re-rendered the document on every turn. */
export function serializeEditor(root: Node): string {
  return walkEditor(root, { started: false });
}

/** `started` says whether a LINE has been begun yet, and it is shared across the
 * whole walk. A line container ends the line before it, so it emits a break
 * unless it opens the content — but "opens the content" is not the same as
 * "nothing written yet": an EMPTY container writes nothing while still being a
 * line, and testing the output instead swallowed the break of whichever
 * container came after it. A value opening with a blank line lost that line
 * silently, which is the same class of loss this file exists to close. Sharing
 * the flag through the recursion is also what gets a container nested inside a
 * non-container right (`<ul><li>`). */
function walkEditor(root: Node, state: { started: boolean }): string {
  const children = Array.from(root.childNodes);
  const last = children[children.length - 1];
  if (last instanceof Element && last.tagName === 'BR') {
    children.pop();
  }
  let out = '';
  for (const node of children) {
    if (node instanceof Text) {
      out += node.data;
      state.started = true;
      continue;
    }
    if (node instanceof Element) {
      const wire = node.getAttribute(CHIP_WIRE_ATTR);
      if (wire !== null) {
        out += wire;
        state.started = true;
        continue;
      }
      if (node.tagName === 'BR') {
        out += '\n';
        state.started = true;
        continue;
      }
      if (LINE_ENDING_TAGS.has(node.tagName)) {
        if (state.started) {
          out += '\n';
        }
        state.started = true;
      }
      out += walkEditor(node, state);
    }
  }
  return out;
}
