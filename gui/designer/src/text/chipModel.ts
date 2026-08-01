// Pure model for the interpolation chips inside the shared text editor: turn
// a text value's raw segments into editor DOM nodes (literal text nodes +
// atomic chip spans), and serialize the editor DOM back to wire text. The
// chip layer is display-only — a chip carries its exact wire slice in a data
// attribute, literals stay verbatim text nodes, so serialization is the
// identity for untouched content. Everything is built through DOM APIs
// (labels and samples are attacker-controlled strings — never HTML), and
// chip metadata lives in a real `Map` (binding keys are hostile strings like
// `__proto__`; a plain-object table would walk the prototype).

import { parseRawSegments } from './interpolate';

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

/** Serialize the editor DOM back to wire text: text nodes verbatim, a chip
 * contributes its stored wire slice, `<br>` reads as a newline, and any
 * other element (nothing we build; paste is plain-text-only) degrades to its
 * serialized children — a foreign node can never contribute more wire than
 * its visible text. */
export function serializeEditor(root: Node): string {
  let out = '';
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof Text) {
      out += node.data;
      continue;
    }
    if (node instanceof Element) {
      const wire = node.getAttribute(CHIP_WIRE_ATTR);
      if (wire !== null) {
        out += wire;
        continue;
      }
      if (node.tagName === 'BR') {
        out += '\n';
        continue;
      }
      out += serializeEditor(node);
    }
  }
  return out;
}
