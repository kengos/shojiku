// The READ side of inline rich text as the EDITOR sees it: a text item's
// `spans:` narrowed into RUNS the flow surface can paint and carry a selection
// over. The panel's `spansModel` answers a different question (a row per
// fragment, for the inspector), so the two stay separate models over one wire.
//
// Only the four MARK properties are read. `fontSize`/`fontFamily`/
// `letterSpacing` are deliberately absent: `canvas/InlineTextEditor` is
// "deliberately NOT WYSIWYG — the Designer never re-resolves fonts/styles", and
// painting a metric would make the surface's line breaks a prediction of the
// engine's. Marks distinguish runs without claiming a measurement, so they are
// the half that may be shown. The metrics are edited on the panel instead.
//
// A run's marks come from its OWN inline `style` only. A fragment whose bold
// arrives through `styleNames:` is not painted bold here, because resolving a
// named style is exactly the re-resolution the boundary above forbids — the
// panel names the styles instead.

import { display, record } from '../panel/itemView';
import { MAX_SPANS } from '../panel/spansModel';

/** The wire's `textDecoration` values, snake_case on the wire — NOT the
 * camelCase every other key uses (`engine/core/src/style/enums.rs` renames this
 * one `snake_case`). Spelled out here so a run never guesses it. */
export const DECORATION_VALUES = ['none', 'underline', 'line_through'] as const;
export type Decoration = (typeof DECORATION_VALUES)[number];

/** The marks a run may carry — the four style keys the flow surface paints.
 * `fontWeight` and `fontStyle` are independent booleans; the decoration is a
 * THREE-state choice, because `textDecoration` is one key on the wire and
 * underline and line-through cannot both be set. */
export interface RunMarks {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly decoration: Decoration;
  /** The fragment's own `style.color`, `''` when it sets none. Not validated
   * here — the paint layer decides what it will render, since a document is
   * untrusted and a colour string reaches CSS. */
  readonly color: string;
}

/** The marks of a fragment that sets none — also what a toggle compares
 * against when deciding whether a write is owed. */
export const NO_MARKS: RunMarks = {
  bold: false,
  italic: false,
  decoration: 'none',
  color: '',
};

/** One fragment as the flow surface paints it. */
export interface RunView {
  /** The WIRE position (`<item>.spans[index]`) — the same non-renumbering
   * index `spansModel` carries, so a skipped entry leaves a gap here too and
   * the two models address the same node. */
  readonly index: number;
  /** `text` — a literal fragment, whose string may still hold `{key}`
   * interpolation the chip layer renders. `bound` — a `data:` fragment, an
   * atomic value the flow cannot split; the user's decision is that these are
   * READ and preserved, never minted. */
  readonly kind: 'text' | 'bound';
  /** For `text`, the fragment's raw `text:`. For `bound`, its binding key. */
  readonly content: string;
  readonly marks: RunMarks;
  /** The fragment lists `styleNames:`. Not painted (see the header) — the flow
   * carries it across a rewrite and the panel is where it is edited. */
  readonly hasStyleNames: boolean;
  /** The fragment carries a `link.url`. Painted, because a link is a mark in
   * every editor a reader has met, and carried across a rewrite. */
  readonly linked: boolean;
}

function decorationOf(raw: string): Decoration {
  return DECORATION_VALUES.find((value) => value === raw) ?? 'none';
}

/** The marks of one already-narrowed `style` map. Every unknown or hostile
 * value degrades to the unset mark rather than throwing — a template is
 * untrusted, and the engine's own report is the honest place for the
 * complaint. */
export function readMarks(style: unknown): RunMarks {
  const map = record(style);
  if (map === undefined) {
    return NO_MARKS;
  }
  return {
    bold: display(map.fontWeight) === 'bold',
    italic: display(map.fontStyle) === 'italic',
    decoration: decorationOf(display(map.textDecoration)),
    color: display(map.color),
  };
}

/** The runs of an already-materialized `spans` value. Bounded by `MAX_SPANS`
 * exactly as the panel's list is: the engine applies the first `MAX_SPANS` and
 * warns about the rest, so painting more would show fragments the page does
 * not draw. */
export function narrowRuns(value: unknown): readonly RunView[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: RunView[] = [];
  for (const [index, entry] of value.slice(0, MAX_SPANS).entries()) {
    const span = record(entry);
    if (span === undefined) {
      continue;
    }
    const boundKey = display(record(span.data)?.key);
    const bound = boundKey !== '';
    out.push({
      index,
      kind: bound ? 'bound' : 'text',
      content: bound ? boundKey : display(span.text),
      marks: readMarks(span.style),
      hasStyleNames: Array.isArray(span.styleNames) && span.styleNames.length > 0,
      linked: display(record(span.link)?.url) !== '',
    });
  }
  return out;
}

/** Whether two mark sets are equal — the changed-check every write runs first,
 * so a toggle that lands on the value already there authors nothing. */
export function sameMarks(a: RunMarks, b: RunMarks): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.decoration === b.decoration &&
    a.color === b.color
  );
}
