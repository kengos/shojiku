// A run element's MARKS, read back from the DOM the flow surface painted —
// split from `runSerialize` because three callers need exactly this question and
// nothing else: the serializer, the auto-split that re-paints a cut run
// (`runFormat`), and the bar's "what does the selection share" (`runMarks`).

import { COMBINE_ATTR } from './runNodes';
import { composeDecoration, type Decoration, type RunMarks } from './spanRuns';

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
  let underline = false;
  let lineThrough = false;
  let bold = false;
  let italic = false;
  for (const name of el.classList) {
    const mark = CLASS_MARKS.get(name);
    if (mark === 'bold') {
      bold = true;
    } else if (mark === 'italic') {
      italic = true;
    } else if (mark === 'underline') {
      underline = true;
    } else if (mark === 'line_through') {
      lineThrough = true;
    }
  }
  return {
    bold,
    italic,
    decoration: composeDecoration(underline, lineThrough),
    color: colorOf(el),
    combine: el.getAttribute(COMBINE_ATTR) ?? '',
  };
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
export function compose(outer: RunMarks, inner: RunMarks): RunMarks {
  return {
    bold: outer.bold || inner.bold,
    italic: outer.italic || inner.italic,
    decoration: inner.decoration === 'none' ? outer.decoration : inner.decoration,
    color: inner.color === '' ? outer.color : inner.color,
    combine: inner.combine === '' ? outer.combine : inner.combine,
  };
}
