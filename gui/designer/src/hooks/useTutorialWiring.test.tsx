// Designer-level tests for hooks/useTutorialWiring.ts — the tutorial reads
// and replaces the document through the SAME surfaces user actions use.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SOURCE } from '../testkit/fixtures';
import { draw, makeTransport, openSampleValue, pickMenu } from '../testkit/harness';

describe('the tutorial', () => {
  function openLauncher() {
    pickMenu('Help', 'Tutorial');
  }

  it('runs the course on a practice document and gives the reader’s own back', async () => {
    const onChange = vi.fn();
    const onParamsChange = vi.fn();
    const userParams = '{"customer":"the reader\'s own value"}';
    draw(makeTransport(), { onChange, onParamsChange, params: userParams });
    openLauncher();
    fireEvent.click(screen.getByTestId('tutorial-resume'));
    // The practice document AND its sample data replaced the user's — the
    // coach mark is up.
    await waitFor(() => expect(screen.getByTestId('coach-overlay')).toBeTruthy());
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('tutorial_practice'));
    expect(onParamsChange).toHaveBeenCalledWith(expect.stringContaining('デザイン制作費'));

    onChange.mockClear();
    onParamsChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Leave the tutorial' }));
    await waitFor(() => expect(screen.queryByTestId('coach-overlay')).toBeNull());
    // Byte-identical restore of BOTH parts, through the REAL wiring (the hook
    // test proves the controller; this pins the Designer's commitSet path):
    // the reader's own document and sample data, not a re-serialization of
    // anything the tutorial built.
    expect(onChange).toHaveBeenLastCalledWith(SOURCE);
    expect(onParamsChange).toHaveBeenLastCalledWith(userParams);
  });

  it('advances a step on the action it describes, and not on another one', async () => {
    draw(makeTransport());
    openLauncher();
    fireEvent.click(screen.getByTestId('tutorial-resume'));
    await waitFor(() => screen.getByTestId('coach-overlay'));
    // Chapter 0 opens with two acknowledgement steps before the margin edit.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const before = screen.getByTestId('coach-bubble').textContent ?? '';
    expect(before).toContain('set the margin to 24');

    // An unrelated edit leaves the step where it is.
    pickMenu('Insert', 'Text');
    expect(screen.getByTestId('coach-bubble').textContent).toContain('set the margin to 24');
  });

  it('completes a sample-edit step through the data-item editor', async () => {
    draw(makeTransport(), { source: SOURCE });
    openLauncher();
    // ch8 opens on an acknowledgement step; Next lands on the sample-edit step,
    // which waits on `sample:edited` — now emitted by the fullscreen editor.
    fireEvent.click(screen.getByText('Finishing and exporting'));
    await waitFor(() => screen.getByTestId('coach-bubble'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('coach-bubble').textContent).toContain('swap the sample data');
    // Edit a sample value in the data editor → the step advances. The practice
    // params carry a string `customer` field (a textarea in the editor).
    const value = openSampleValue('customer') as HTMLTextAreaElement;
    fireEvent.change(value, { target: { value: 'swapped' } });
    fireEvent.blur(value);
    await waitFor(() =>
      expect(screen.getByTestId('coach-bubble').textContent).toContain('File → Export'),
    );
  });

  it('offers the course to a first-time reader and remembers a dismissal', async () => {
    const save = vi.fn();
    const stored: string | null = null;
    draw(makeTransport(), {
      tutorialStore: { load: () => stored, save: (p) => save(p) },
    });
    const hint = await screen.findByRole('button', { name: /New here/ });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(save).toHaveBeenCalledWith({ completed: [], dismissed: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: /New here/ })).toBeNull());
    expect(hint).toBeTruthy();
  });

  it('runs a chapter picked from the list, counting the steps before it', async () => {
    draw(makeTransport());
    openLauncher();
    // Chapter 2 of nine: its first step is step 10 overall.
    fireEvent.click(screen.getByText('Building the header — containers and automatic placement'));
    await waitFor(() => screen.getByTestId('coach-bubble'));
    expect(screen.getByTestId('coach-bubble').textContent).toContain('10 / 45');
  });

  it('closes the launcher without starting anything', () => {
    draw(makeTransport());
    openLauncher();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('coach-overlay')).toBeNull();
  });

  it('runs a topic short on its own practice document, reusing a course sentence', async () => {
    draw(makeTransport());
    openLauncher();
    // The first topic reuses the ch2 container sentence (copyId) as its opening
    // step, and its progress counts the TOPIC's own steps, not the course's.
    fireEvent.click(screen.getByText('Containers and arrangement'));
    await waitFor(() => screen.getByTestId('coach-bubble'));
    const bubble = screen.getByTestId('coach-bubble').textContent ?? '';
    expect(bubble).toContain('open Insert → Container');
    expect(bubble).toContain('1 / 5');
  });

  it('reports a data-tab switch, and stays quiet for the tabs no step waits on', async () => {
    draw(makeTransport(), { source: SOURCE });
    openLauncher();
    fireEvent.click(screen.getByText('Creating data fields and binding them'));
    await waitFor(() => screen.getByTestId('coach-bubble'));
    // ch3 opens on the create-field step. The data tab is reported (a later step
    // of this chapter waits on it) and the Structure tab (no step waits on it)
    // reports nothing — either way the coach mark stays on the step the reader
    // has not done yet.
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    expect(screen.getByTestId('coach-bubble').textContent).toContain('Insert → Create data field');
    fireEvent.click(screen.getByRole('tab', { name: 'Structure' }));
    expect(screen.getByTestId('coach-bubble').textContent).toContain('Insert → Create data field');
  });

  it('mounts the chrome anchors its steps point at', async () => {
    draw(makeTransport(), { source: SOURCE });
    await waitFor(() => screen.getByRole('button', { name: 'Help' }));
    // A registered id with no element behind it leaves its step pointing at
    // nothing — the coach mark silently falls back to a centered bubble.
    for (const id of [
      'menu-file',
      'menu-insert',
      'menu-help',
      'sidebar-tabs',
      'panel',
      'diagnostics',
    ]) {
      expect(document.querySelector(`[data-tour="${id}"]`)).not.toBeNull();
    }
  });

  // The steps that run while a fullscreen view or a dialog is up cannot point
  // at the panel or the sidebar: those are unmounted by then. Each of these ids
  // has to resolve in the state its own step arrives in.
  it('mounts the document-settings route and the page it opens', async () => {
    draw(makeTransport(), { source: SOURCE });
    await waitFor(() => screen.getByRole('button', { name: 'Help' }));
    // Nothing selected: the panel offers the way in.
    expect(document.querySelector('[data-tour="panel-doc-settings"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open document settings' }));
    // …and the page that replaces the grid carries the anchor the margin step
    // points at, while the panel it replaced is gone.
    await waitFor(() =>
      expect(document.querySelector('[data-tour="doc-settings"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-tour="panel"]')).toBeNull();
  });

  it('mounts the field and list-data dialog anchors when those dialogs open', async () => {
    draw(makeTransport(), { source: SOURCE });
    await waitFor(() => screen.getByRole('button', { name: 'Help' }));
    pickMenu('Insert', 'Create data field…');
    await waitFor(() =>
      expect(document.querySelector('[data-tour="dialog-field"]')).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    pickMenu('Insert', 'Place list data…');
    await waitFor(() =>
      expect(document.querySelector('[data-tour="dialog-iterable"]')).not.toBeNull(),
    );
  });

  it('mounts the data-editor gear anchor when the data tab is open', () => {
    // The gear is conditional (only in the data tab, which needs data). ch3's
    // sample steps point at it, so it must resolve in a rendered tree there.
    draw(makeTransport(), { params: JSON.stringify({ title: 'Hi' }) });
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    expect(document.querySelector('[data-tour="data-editor-gear"]')).not.toBeNull();
  });

  it('mounts the format-toolbar anchors once a text item is selected', async () => {
    draw(makeTransport(), { source: SOURCE });
    fireEvent.click(await screen.findByRole('button', { name: /Body/ }));
    fireEvent.click(screen.getByRole('button', { name: 'hello' }));
    await waitFor(() =>
      expect(document.querySelector('[data-tour="toolbar-bold"]')).not.toBeNull(),
    );
    for (const id of ['toolbar-bold', 'toolbar-font-size', 'toolbar-align']) {
      expect(document.querySelector(`[data-tour="${id}"]`)).not.toBeNull();
    }
    // The style picker is conditional (it needs a style to toggle or an inline
    // format to capture), which is exactly the state its own step arrives in —
    // by then the reader has set bold, size and alignment.
    expect(document.querySelector('[data-tour="toolbar-styles"]')).toBeNull();
  });

  it('does not offer the course to a reader who already dismissed it', async () => {
    draw(makeTransport(), {
      tutorialStore: {
        load: () => '{"completed":[],"dismissed":true}',
        save: vi.fn(),
      },
    });
    await waitFor(() => screen.getByRole('button', { name: 'Help' }));
    expect(screen.queryByRole('button', { name: /New here/ })).toBeNull();
  });
});
