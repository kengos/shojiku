// Keeping the bar in step with the caret. Two propositions worth a case: the
// hook answers `null` before the surface exists (a bar with nothing to point at
// must be dead, not wrong), and it listens to the DOCUMENT — a selection can
// change with no event reaching the editor at all.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RUN_ATTR } from './runNodes';
import { useSelectionMarks } from './useSelectionMarks';

afterEach(() => {
  cleanup();
  // The surfaces below are appended to `document.body` by hand, and `cleanup`
  // only unmounts what React rendered — so without this they ACCUMULATE and
  // `getElementById` answers with the FIRST one, i.e. a previous case's
  // element. The suite then reports about a surface it never selected in.
  document.body.textContent = '';
});

function Harness({ attach }: { readonly attach: boolean }) {
  const root = attach ? (document.getElementById('surface') as HTMLElement | null) : null;
  const { marks, refresh } = useSelectionMarks(root);
  return (
    <>
      <output data-testid="marks">{marks === null ? 'none' : JSON.stringify(marks)}</output>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </>
  );
}

function surface(className: string): HTMLElement {
  const el = document.createElement('div');
  el.id = 'surface';
  const run = document.createElement('span');
  run.setAttribute(RUN_ATTR, '0');
  run.className = className;
  run.appendChild(document.createTextNode('abcdef'));
  el.appendChild(run);
  document.body.appendChild(el);
  return el;
}

function selectAll(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  // Wrapped, because the listener's `setState` lands outside React's own event
  // path — the whole point of the hook is that nothing reaches the editor.
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('useSelectionMarks', () => {
  it('answers null while there is no surface to point at', () => {
    render(<Harness attach={false} />);
    expect(screen.getByTestId('marks').textContent).toBe('none');
  });

  it('answers null when asked to refresh before the surface exists', () => {
    // The editor's own key and pointer handlers call `refresh` directly, and
    // the very first of those can arrive before the callback ref has attached.
    render(<Harness attach={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(screen.getByTestId('marks').textContent).toBe('none');
  });

  it('answers null for a surface with nothing selected', () => {
    surface('sj-run');
    render(<Harness attach />);
    expect(screen.getByTestId('marks').textContent).toBe('none');
  });

  it('follows a selection made with no event reaching the editor', () => {
    // Dragging out of the surface, a keyboard extend, or the browser's own
    // re-selection after an edit all change the selection without the editor
    // hearing anything — `selectionchange` is the only notification.
    const el = surface('sj-run sj-run--bold');
    render(<Harness attach />);
    selectAll(el);
    expect(screen.getByTestId('marks').textContent).toContain('"bold":true');
  });
});
