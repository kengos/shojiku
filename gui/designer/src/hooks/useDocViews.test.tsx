// Designer-level tests for hooks/useDocViews.ts — the fullscreen
// document-settings view (and its exclusion with the data editor).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransportError } from '../engine/transport';
import { outcome, STYLE_DIAG } from '../testkit/fixtures';
import { draw, makeTransport, pickMenu } from '../testkit/harness';

describe('Designer — the fullscreen document-settings view', () => {
  function openView() {
    fireEvent.click(screen.getByRole('button', { name: 'Document' }));
  }

  it('opens the view from the 全体 row, swapping out the canvas', async () => {
    const { container } = draw(makeTransport());
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    openView();
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    // The canvas column is gone while the view is open.
    expect(container.querySelector('.sj-designer-canvas')).toBeNull();
  });

  it('returns to the canvas from the close button', async () => {
    const { container } = draw(makeTransport());
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    openView();
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    expect(screen.queryByRole('heading', { name: 'Document settings' })).toBeNull();
    expect(container.querySelector('.sj-designer-canvas')).not.toBeNull();
  });

  it('closes the view on Escape', () => {
    draw(makeTransport());
    openView();
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Document settings' })).toBeNull();
  });

  it('does NOT close the view on Escape inside an editable field', () => {
    draw(makeTransport());
    openView();
    // The locale combo lives in the view's locale section; Escape there is the
    // field's, not a view dismissal.
    fireEvent.click(screen.getByRole('button', { name: /^Locale & currency/ }));
    fireEvent.keyDown(screen.getByLabelText('Locale'), { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
  });

  it('takes the whole editor area — the layer-tree pane steps aside too', async () => {
    draw(makeTransport());
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    openView();
    // The view carries its own section rail, so leaving the tree pane beside it
    // would put two navigation columns on one screen.
    expect(screen.queryByRole('button', { name: 'hello' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeTruthy();
    // Closing brings the tree back.
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    expect(screen.getByRole('button', { name: 'hello' })).toBeTruthy();
  });

  it('closes the view and selects the item when a diagnostic row is clicked', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport);
    await waitFor(() => screen.getByRole('button', { name: /heading/ }));
    openView();
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /heading/ }));
    expect(screen.queryByRole('heading', { name: 'Document settings' })).toBeNull();
    expect(screen.getByLabelText('Text')).toBeTruthy();
  });

  it('leaves the template text untouched across an open/close cycle', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    onChange.mockClear();
    openView();
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    // Toggling the view is pure UI state — no document edit.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the live preview pages in the view (no "no preview" note)', async () => {
    const { container } = draw(makeTransport());
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    openView();
    expect(screen.queryByText('No preview yet.')).toBeNull();
    // The preview pane paints the last-good page(s) as canvases.
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0);
  });

  it('opens the view from the File → document-settings menu entry, at the page section', () => {
    draw(makeTransport());
    pickMenu('File', 'Document settings…');
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    // The menu entry asks for the page section, and the rail opens it.
    expect(screen.getByRole('heading', { name: 'Page setup' })).toBeTruthy();
  });

  it('keeps the last-good preview pages in the view when a re-render fails', async () => {
    // First render succeeds; every later render rejects — the view must keep
    // painting the last-good pages (canvas parity: no blanking on error).
    let calls = 0;
    const transport = makeTransport({
      renderRaw: vi.fn(async () => {
        calls += 1;
        if (calls > 1) {
          throw new TransportError('engine exploded');
        }
        return outcome({ items: [] });
      }),
    });
    const { container } = draw(transport);
    await waitFor(() => expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0));
    openView();
    expect(screen.queryByText('No preview yet.')).toBeNull();
    // A settings edit inside the view triggers a re-render that fails.
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'Legal' } });
    await waitFor(() => expect(calls).toBeGreaterThan(1));
    // The pane still shows the last-good page — never a blank/empty note.
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0);
    expect(screen.queryByText('No preview yet.')).toBeNull();
  });

  it('opens the view from the property panel no-selection card', () => {
    draw(makeTransport());
    // Nothing selected: the right panel shows the hint card + CTA.
    fireEvent.click(screen.getByRole('button', { name: 'Open document settings' }));
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
  });

  it('closes the view when an insert auto-selects the new item', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    openView();
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    // Insert (in the always-visible menubar) selects the new item → view closes.
    pickMenu('Insert', 'Text');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Document settings' })).toBeNull(),
    );
    // The new item is inserted (a document edit fired) and selected (item panel).
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Text')).toBeTruthy();
  });
});

describe('Designer — opening the data editor ON a field', () => {
  const withData = JSON.stringify({ title: 'Hi' });

  it('lands on the field whose gear was clicked, not on the pick-one hint', async () => {
    draw(makeTransport(), { params: withData });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit this data field' })[0]);
    expect(screen.getByLabelText('Display label')).not.toBeNull();
    expect(screen.queryByText(/Select a data field on the left/)).toBeNull();
  });

  it('clears a previous gear target, so the File-menu entry opens with nothing selected', async () => {
    draw(makeTransport(), { params: withData });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit this data field' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to canvas' }));
    // Re-entering from the menu is the no-selection surface; a stale target
    // would silently re-open on whatever was picked last.
    pickMenu('File', 'Edit data fields…');
    expect(screen.getByText(/Select a data field on the left/)).not.toBeNull();
  });
});
