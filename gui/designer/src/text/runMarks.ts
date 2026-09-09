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
import { RUN_ATTR } from './runNodes';
import { marksOfElement } from './runSerialize';
import { type Decoration, NO_MARKS, type RunMarks } from './spanRuns';

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
      decoration: common.decoration === marks.decoration ? common.decoration : 'none',
      color: common.color === marks.color ? common.color : '',
    };
  }, marksOfElement(first));
}

/** Flip a boolean mark across the selection: set unless every fragment already
 * carries it. */
export function toggleBold(current: RunMarks, common: RunMarks): RunMarks {
  return { ...current, bold: !common.bold };
}

export function toggleItalic(current: RunMarks, common: RunMarks): RunMarks {
  return { ...current, italic: !common.italic };
}

/** The decoration is ONE wire key with three values, not two independent
 * toggles, so pressing underline over a struck-through selection REPLACES the
 * line rather than adding one. Pressing the value already common to the
 * selection clears it, which is the same round trip the booleans have. */
export function toggleDecoration(
  current: RunMarks,
  common: RunMarks,
  value: Exclude<Decoration, 'none'>,
): RunMarks {
  return { ...current, decoration: common.decoration === value ? 'none' : value };
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
): RunMarks {
  const against = common ?? current;
  if (shortcut === 'bold') {
    return toggleBold(current, against);
  }
  if (shortcut === 'italic') {
    return toggleItalic(current, against);
  }
  return toggleDecoration(current, against, 'underline');
}
