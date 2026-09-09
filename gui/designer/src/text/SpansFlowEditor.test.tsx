// The flow surface as a component. The cases that earn their place are the
// EXIT ones — leaving the field is not always a blur, and a panel tab switch or
// a selection change unmounts the editor while it still holds focus, with no
// blur fired. Everything else here is the shortcut/bar agreement.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { RUN_ATTR } from './runNodes';
import type { SerializedRun } from './runSerialize';
import { SpansFlowEditor } from './SpansFlowEditor';
import { narrowRuns } from './spanRuns';

afterEach(cleanup);

const SPANS = [{ text: 'alpha' }, { text: 'beta', style: { fontWeight: 'bold' } }];

function show(spans: readonly unknown[] = SPANS) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <I18nProvider locale="en">
      <SpansFlowEditor
        runs={narrowRuns(spans)}
        onCommit={onCommit}
        onCancel={onCancel}
        ariaLabel="Edit text"
      />
    </I18nProvider>,
  );
  return { onCommit, onCancel, view, surface: screen.getByRole('textbox') };
}

/** Select `from`..`to` inside the run at `index`. */
function select(surface: HTMLElement, index: number, from: number, to: number) {
  const text = surface.children[index]?.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  fireEvent.mouseUp(surface);
}

/** The fragments the first commit reported. `vi.fn()` types its calls as
 * `any[][]`, so the narrowing happens here once rather than at each call site. */
const contents = (calls: readonly (readonly unknown[])[]): readonly string[] =>
  (calls[0][0] as readonly SerializedRun[]).map((run) => run.content);

describe('SpansFlowEditor', () => {
  it('seeds one element per fragment, carrying its wire index', () => {
    const { surface } = show([{ text: 'a' }, 'malformed', { text: 'c' }]);
    expect([...surface.children].map((el) => el.getAttribute(RUN_ATTR))).toEqual(['0', '2']);
  });

  it('paints a fragment marks, so the reader can see what carries what', () => {
    const { surface } = show();
    expect(surface.children[1]?.classList.contains('sj-run--bold')).toBe(true);
    expect(surface.children[0]?.classList.contains('sj-run--bold')).toBe(false);
  });

  it('hands the fragments back on blur', () => {
    const { onCommit, surface } = show();
    fireEvent.blur(surface.parentElement as HTMLElement, { relatedTarget: document.body });
    expect(contents(onCommit.mock.calls)).toEqual(['alpha', 'beta']);
  });

  it('hands them back on ⌘Enter', () => {
    const { onCommit, surface } = show();
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits on UNMOUNT, because leaving the field is not always a blur', () => {
    // A panel tab switch or a selection change removes the node while it still
    // holds focus and the browser fires no blur — without this the reader's
    // typing is simply discarded.
    const { onCommit, view } = show();
    view.unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not commit TWICE when a blur is followed by the unmount', () => {
    const { onCommit, surface, view } = show();
    fireEvent.blur(surface.parentElement as HTMLElement, { relatedTarget: document.body });
    view.unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape, and the trailing unmount does not then commit', () => {
    const { onCommit, onCancel, surface, view } = show();
    fireEvent.keyDown(surface, { key: 'Escape' });
    view.unmount();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not treat focus moving INSIDE its own chrome as leaving', () => {
    const { onCommit, surface } = show();
    const root = surface.parentElement as HTMLElement;
    fireEvent.blur(root, { relatedTarget: screen.getByRole('button', { name: 'Bold' }) });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('lights the bar from the selection', () => {
    const { surface } = show();
    select(surface, 1, 0, 4);
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a mark from the bar, splitting the fragment underneath', () => {
    const { onCommit, surface } = show([{ text: 'one two' }]);
    select(surface, 0, 0, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    const runs = onCommit.mock.calls[0][0] as SerializedRun[];
    expect(runs.map((run) => [run.content, run.marks.bold])).toEqual([
      ['one', true],
      [' two', false],
    ]);
  });

  it('⌘B means what the Bold button means', () => {
    // The two go through ONE keydown rule and ONE mark function, so they cannot
    // come to disagree — this is the case that would notice if they did.
    const { onCommit, surface } = show([{ text: 'one two' }]);
    select(surface, 0, 0, 3);
    fireEvent.keyDown(surface, { key: 'b', metaKey: true });
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    const runs = onCommit.mock.calls[0][0] as SerializedRun[];
    expect(runs.map((run) => run.marks.bold)).toEqual([true, false]);
  });

  it('⌘I and ⌘U reach their own marks', () => {
    const { onCommit, surface } = show([{ text: 'one two' }]);
    select(surface, 0, 0, 3);
    fireEvent.keyDown(surface, { key: 'i', metaKey: true });
    fireEvent.keyDown(surface, { key: 'u', metaKey: true });
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    const runs = onCommit.mock.calls[0][0] as SerializedRun[];
    expect(runs[0]?.marks).toMatchObject({ italic: true, decoration: 'underline' });
  });

  it('a shortcut works on a selection the BAR has not seen yet', () => {
    // The bar learns of a selection through `selectionchange` or the surface's
    // own pointer/key events. A shortcut pressed before either has fired finds
    // the bar's mark state still empty, and must fall back to the fragment's
    // OWN marks rather than treating the selection as unformattable.
    const { onCommit, surface } = show([{ text: 'one two' }]);
    const text = surface.children[0]?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fireEvent.keyDown(surface, { key: 'b', metaKey: true });
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    const runs = onCommit.mock.calls[0][0] as SerializedRun[];
    expect(runs.map((run) => run.marks.bold)).toEqual([true, false]);
  });

  it('a shortcut with nothing selected changes nothing', () => {
    const { onCommit, surface } = show([{ text: 'one two' }]);
    fireEvent.keyDown(surface, { key: 'b', metaKey: true });
    fireEvent.keyDown(surface, { key: 'Enter', metaKey: true });
    const runs = onCommit.mock.calls[0][0] as SerializedRun[];
    expect(runs.map((run) => run.marks.bold)).toEqual([false]);
  });

  it('survives the surface own chip bookkeeping, which has nothing to do here', () => {
    // `EditorSurface` drives a selected-chip re-check on pointer and input.
    // The flow surface has no selected chip (a `{key}` inside a fragment is
    // still a chip, but re-picking one is the plain field's affordance), so the
    // callbacks are no-ops — and a no-op that throws would still break typing.
    const { surface } = show();
    fireEvent.mouseDown(surface);
    fireEvent.input(surface);
    expect(surface.textContent).toBe('alphabeta');
  });

  it('keeps the reader typing rather than re-seeding under the caret', () => {
    // The surface is uncontrolled after the seed, exactly as the plain editor
    // is: a re-render with new props must not move the caret.
    const { view, surface } = show([{ text: 'first' }]);
    (surface.children[0]?.firstChild as Text).data = 'typed';
    view.rerender(
      <I18nProvider locale="en">
        <SpansFlowEditor
          runs={narrowRuns([{ text: 'CHANGED' }])}
          onCommit={vi.fn()}
          onCancel={vi.fn()}
          ariaLabel="Edit text"
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('textbox').textContent).toBe('typed');
  });
});
