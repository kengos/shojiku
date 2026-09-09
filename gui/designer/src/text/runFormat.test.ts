// The auto-split. Every case here is about a boundary the reader never places:
// pressing bold over three words must leave those three words bold and nothing
// else, whatever fragments they happened to span.
//
// `surroundContents` is deliberately absent from the implementation — measured
// in a real browser, it throws `InvalidStateError` across runs and its working
// fallback leaves the partial runs NESTED. Splitting first makes every affected
// fragment a whole element, which is why these cases can assert a flat result.

import { beforeEach, describe, expect, it } from 'vitest';
import { applyMarks, runsInSelection, splitRunAt } from './runFormat';
import { RUN_ATTR } from './runNodes';
import { serializeRuns } from './runSerialize';
import { NO_MARKS, type RunMarks } from './spanRuns';

function host(...runs: readonly (readonly [number, string, string?])[]): HTMLElement {
  const root = document.createElement('div');
  for (const [index, text, className] of runs) {
    const el = document.createElement('span');
    el.setAttribute(RUN_ATTR, String(index));
    el.className = className ?? 'sj-run';
    el.appendChild(document.createTextNode(text));
    root.appendChild(el);
  }
  document.body.appendChild(root);
  return root;
}

function select(root: HTMLElement, from: [number, number], to: [number, number]): Selection {
  const runs = [...root.children];
  const range = document.createRange();
  range.setStart(runs[from[0]].firstChild as Text, from[1]);
  range.setEnd(runs[to[0]].firstChild as Text, to[1]);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return sel as Selection;
}

const bold = (current: RunMarks): RunMarks => ({ ...current, bold: true });

beforeEach(() => {
  document.body.textContent = '';
});

describe('splitRunAt', () => {
  it('moves everything after the point into a sibling carrying the same attributes', () => {
    const root = host([7, 'abcd', 'sj-run sj-run--bold']);
    const run = root.children[0] as HTMLElement;
    const tail = splitRunAt(run, run.firstChild as Text, 2);
    expect(run.textContent).toBe('ab');
    expect(tail?.textContent).toBe('cd');
    // Same index on BOTH halves — which is exactly why `runIdentity` reads the
    // attribute as provenance rather than identity.
    expect(tail?.getAttribute(RUN_ATTR)).toBe('7');
    expect(tail?.className).toBe('sj-run sj-run--bold');
  });

  it('does nothing when the point is the run START', () => {
    // Without this the whole run moves into the sibling and the original is
    // left EMPTY — a fragment nobody authored, written as `text: ""`. The
    // engine says nothing about it either: `empty_span` fires only for
    // `(None, None)` and this is `Some("")`. Bolding from a word's first
    // character is the ordinary case, so it fired on the first file-level test.
    const root = host([0, 'ab']);
    const run = root.children[0] as HTMLElement;
    expect(splitRunAt(run, run.firstChild as Text, 0)).toBeNull();
    expect(root.children).toHaveLength(1);
    expect(run.textContent).toBe('ab');
  });

  it('does nothing when the point is already the run end', () => {
    const root = host([0, 'ab']);
    const run = root.children[0] as HTMLElement;
    expect(splitRunAt(run, run.firstChild as Text, 2)).toBeNull();
    expect(root.children).toHaveLength(1);
  });

  it('splits a CHILDLESS run without minting an empty sibling', () => {
    // `setEndAfter(run)` on a run with no children would put the range's end in
    // the PARENT — a range spanning the run's own closing tag, which is not
    // "the rest of this run".
    const root = host([0, '']);
    const run = root.children[0] as HTMLElement;
    run.textContent = '';
    expect(run.firstChild).toBeNull();
    expect(splitRunAt(run, run, 0)).toBeNull();
    expect(root.children).toHaveLength(1);
  });
});

describe('runsInSelection', () => {
  it('returns nothing for a collapsed caret', () => {
    const root = host([0, 'abc']);
    const sel = select(root, [0, 1], [0, 1]);
    expect(runsInSelection(root, sel)).toEqual([]);
  });

  it('returns nothing when there is no selection at all', () => {
    expect(runsInSelection(host([0, 'a']), null)).toEqual([]);
  });

  it('returns nothing for a selection that is not inside a run', () => {
    const root = document.createElement('div');
    root.appendChild(document.createTextNode('loose text'));
    document.body.appendChild(root);
    const range = document.createRange();
    range.setStart(root.firstChild as Text, 0);
    range.setEnd(root.firstChild as Text, 5);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(runsInSelection(root, sel)).toEqual([]);
  });

  it('returns nothing when a range END points at no node at all', () => {
    // A browser puts a range boundary on the PARENT with a child offset after a
    // structural change. An end boundary at offset 0 of a non-run parent names
    // `childNodes[-1]` — no node — and the selection then has no fragment to
    // format rather than an arbitrary one.
    const root = host([0, 'abc']);
    const wrapper = document.createElement('div');
    const inner = document.createElement('span');
    inner.setAttribute(RUN_ATTR, '1');
    inner.className = 'sj-run';
    inner.appendChild(document.createTextNode('def'));
    wrapper.appendChild(inner);
    root.appendChild(wrapper);
    const range = document.createRange();
    range.setStart(root.firstChild?.firstChild as Text, 1);
    range.setEnd(wrapper, 0);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    expect(runsInSelection(root, sel)).toEqual([]);
    // …and nothing was cut on the way to that answer.
    expect(root.children).toHaveLength(2);
  });

  it('cuts BOTH ends and returns exactly the covered middle', () => {
    const root = host([0, 'abcdef']);
    const sel = select(root, [0, 2], [0, 4]);
    const runs = runsInSelection(root, sel);
    expect(runs.map((run) => run.textContent)).toEqual(['cd']);
    expect([...root.children].map((el) => el.textContent)).toEqual(['ab', 'cd', 'ef']);
  });

  it('spans several fragments, trimming only the two ends', () => {
    const root = host([0, 'aaa'], [1, 'bbb'], [2, 'ccc']);
    const sel = select(root, [0, 1], [2, 2]);
    expect(runsInSelection(root, sel).map((run) => run.textContent)).toEqual(['aa', 'bbb', 'cc']);
  });
});

describe('applyMarks', () => {
  it('bolds exactly the selected words, splitting the fragment underneath', () => {
    const root = host([0, 'one two three']);
    applyMarks(root, select(root, [0, 4], [0, 7]), bold);
    expect(serializeRuns(root).map((run) => [run.content, run.marks.bold])).toEqual([
      ['one ', false],
      ['two', true],
      [' three', false],
    ]);
  });

  it('bolds across a fragment boundary the reader never placed', () => {
    const root = host([0, 'alpha'], [1, 'beta']);
    applyMarks(root, select(root, [0, 3], [1, 2]), bold);
    expect(serializeRuns(root).map((run) => [run.content, run.marks.bold])).toEqual([
      ['alp', false],
      ['ha', true],
      ['be', true],
      ['ta', false],
    ]);
  });

  it('keeps a run FLAT — no nesting for the serializer to compose', () => {
    const root = host([0, 'abcdef']);
    applyMarks(root, select(root, [0, 2], [0, 4]), bold);
    expect(root.querySelector(`[${RUN_ATTR}] [${RUN_ATTR}]`)).toBeNull();
  });

  it('leaves the words selected, so a second press lands on the same range', () => {
    const root = host([0, 'one two three']);
    applyMarks(root, select(root, [0, 4], [0, 7]), bold);
    applyMarks(root, window.getSelection(), (current) => ({ ...current, italic: true }));
    const marked = serializeRuns(root).filter((run) => run.marks.bold);
    expect(marked.map((run) => [run.content, run.marks.italic])).toEqual([['two', true]]);
  });

  it('reports no change, and touches nothing, when the selection is unusable', () => {
    const root = host([0, 'abc']);
    expect(applyMarks(root, select(root, [0, 1], [0, 1]), bold)).toBe(false);
    expect(root.innerHTML).toContain('abc');
  });

  it('carries an existing mark through rather than replacing the set', () => {
    const root = host([0, 'abcdef', 'sj-run sj-run--italic']);
    applyMarks(root, select(root, [0, 2], [0, 4]), bold);
    const middle = serializeRuns(root)[1];
    expect(middle?.marks).toMatchObject({ bold: true, italic: true });
  });

  it('preserves the link mark of the fragment it split', () => {
    const root = host([0, 'abcdef', 'sj-run sj-run--linked']);
    applyMarks(root, select(root, [0, 2], [0, 4]), bold);
    expect(serializeRuns(root).map((run) => run.linked)).toEqual([true, true, true]);
  });

  it('clears a mark as readily as it sets one', () => {
    const root = host([0, 'abcdef', 'sj-run sj-run--bold']);
    applyMarks(root, select(root, [0, 2], [0, 4]), (current) => ({ ...current, bold: false }));
    expect(serializeRuns(root).map((run) => run.marks.bold)).toEqual([true, false, true]);
  });

  it('sets a colour that survives serialization as the authored hex', () => {
    const root = host([0, 'abcdef']);
    applyMarks(root, select(root, [0, 2], [0, 4]), (current) => ({
      ...current,
      color: '#c2402a',
    }));
    expect(serializeRuns(root)[1]?.marks).toMatchObject({ ...NO_MARKS, color: '#c2402a' });
  });
});
