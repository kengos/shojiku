// What the CURRENT selection carries, and what a press should therefore do.
// Read-only: this is the half that runs on every selection change to light the
// format bar, so it must never split anything — `runFormat` owns the mutation
// and only a press reaches it.
//
// A mark reads as SET only when EVERY covered fragment carries it, and a press
// then clears it; a mixed selection reads as unset and a press sets it
// throughout. That is the rule every editor a reader has met follows, and it is
// what makes two presses of one button a round trip.

import { rangeInRoot } from './editorDom';
import type { FormatShortcut } from './editorHandlers';
import { marksOfElement } from './runElementMarks';
import { RUN_ATTR } from './runNodes';
import {
  combineOn,
  composeDecoration,
  hasLineThrough,
  hasUnderline,
  NO_MARKS,
  type RunMarks,
} from './spanRuns';

/** The run elements a selection touches, WITHOUT cutting anything. */
export function runsTouching(root: HTMLElement, sel: Selection | null): readonly HTMLElement[] {
  const range = rangeInRoot(root, sel);
  if (range === null || range.collapsed) {
    return [];
  }
  return [...root.querySelectorAll(`[${RUN_ATTR}]`)].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && range.intersectsNode(el),
  );
}

/** The marks common to the whole selection, or `null` when there is no usable
 * selection — which is also what disables the bar, since formatting nothing is
 * not an operation the reader can mean. */
export function selectionMarks(root: HTMLElement, sel: Selection | null): RunMarks | null {
  const runs = runsTouching(root, sel);
  const first = runs[0];
  if (first === undefined) {
    return null;
  }
  return runs.slice(1).reduce<RunMarks>((common, run) => {
    const marks = marksOfElement(run);
    return {
      bold: common.bold && marks.bold,
      italic: common.italic && marks.italic,
      decoration: composeDecoration(
        hasUnderline(common.decoration) && hasUnderline(marks.decoration),
        hasLineThrough(common.decoration) && hasLineThrough(marks.decoration),
      ),
      color: common.color === marks.color ? common.color : '',
      combine: commonCombine(common.combine, marks.combine),
    };
  }, marksOfElement(first));
}

/** The tate-chu-yoko two runs SHARE: their token when it is the same, `all`
 * when both are on in different spellings (so the toggle reads pressed), and
 * unset otherwise. */
function commonCombine(a: string, b: string): string {
  if (a === b) {
    return a;
  }
  return combineOn(a) && combineOn(b) ? 'all' : '';
}

/** Tate-chu-yoko over the selection: ON writes the `all` keyword — the whole
 * selected run in one upright cell, which is what selecting "12" means — and
 * OFF is a removal. The `digitsN` forms are the item-level select's; this
 * toggle never authors one, it only reads one as on. */
export function toggleCombine(current: RunMarks, common: RunMarks): RunMarks {
  return { ...current, combine: combineOn(common.combine) ? '' : 'all' };
}

/** Flip a boolean mark across the selection: set unless every fragment already
 * carries it. */
export function toggleBold(current: RunMarks, common: RunMarks): RunMarks {
  return { ...current, bold: !common.bold };
}

export function toggleItalic(current: RunMarks, common: RunMarks): RunMarks {
  return { ...current, italic: !common.italic };
}

/** Flip ONE decoration line across the selection, leaving the other line each
 * fragment carries alone — underline over a struck-through selection adds the
 * underline beside the strike (the wire's two-token value). Like the booleans,
 * the line is set unless every fragment already carries it. Against an engine
 * that takes one line at a time (`combined` false — no
 * `style.textDecoration.combined`), setting a line drops the other instead. */
export function toggleDecoration(
  current: RunMarks,
  common: RunMarks,
  line: 'underline' | 'line_through',
  combined = true,
): RunMarks {
  const underline =
    line === 'underline' ? !hasUnderline(common.decoration) : hasUnderline(current.decoration);
  const lineThrough =
    line === 'line_through'
      ? !hasLineThrough(common.decoration)
      : hasLineThrough(current.decoration);
  const turnedOn = line === 'underline' ? underline : lineThrough;
  return {
    ...current,
    decoration:
      combined || !turnedOn
        ? composeDecoration(underline, lineThrough)
        : composeDecoration(line === 'underline', line === 'line_through'),
  };
}

/** Colour is a VALUE, not a toggle: picking one sets it, and the picker's
 * "default" entry clears it back to the block's own colour. */
export function setColor(current: RunMarks, color: string): RunMarks {
  return { ...current, color };
}

/** The marks a bar shows when nothing is selected — everything off, nothing
 * pressed. */
export const UNSELECTED_MARKS: RunMarks = NO_MARKS;

/** What a ⌘B / ⌘I / ⌘U press means, in ONE place, so the shortcut and the bar
 * button cannot come to disagree.
 *
 * `common` may be absent: the bar learns of a selection through
 * `selectionchange` or the surface's own events, and a shortcut pressed before
 * either has fired finds it empty. Falling back to the fragment's OWN marks is
 * what makes that press still a toggle rather than a no-op. */
export function applyShortcut(
  shortcut: FormatShortcut,
  current: RunMarks,
  common: RunMarks | null,
  combined = true,
): RunMarks {
  const against = common ?? current;
  if (shortcut === 'bold') {
    return toggleBold(current, against);
  }
  if (shortcut === 'italic') {
    return toggleItalic(current, against);
  }
  return toggleDecoration(current, against, 'underline', combined);
}
