// The composed-Designer core suite: mount, menubar, editing, save/export
// review, diagnostics, selection and the canvas manipulation chip/grid.
// Feature-area suites live next to their wiring hooks (hooks/*.test.tsx)
// over the shared ./testkit substrate.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Designer, isEditableTarget } from './Designer';
import { type RenderOutcome, TransportError } from './engine/transport';
import type { Diagnostic, Diagnostics } from './engine/types';
import { DEFAULT_CATALOG } from './i18n/catalog';
import { I18nProvider } from './i18n/context';
import { EngineProvider } from './preview/context';
import {
  ABS_VARIED,
  outcome,
  outcomeAbs,
  outcomeColliding,
  outcomeStacked,
  outcomeWith,
  SOURCE,
  STYLE_DIAG,
  THREE_ITEMS,
} from './testkit/fixtures';
import { draw, makeTransport, overlayInsertMenu, pickMenu, saveViaReview } from './testkit/harness';

describe('Designer', () => {
  it('renders a toolbar with undo/redo disabled initially', async () => {
    const transport = makeTransport();
    draw(transport);
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);
    // Clicking save with no onSave handler and a clean validate must not throw.
    saveViaReview();
    await waitFor(() => expect(transport.validate).toHaveBeenCalled());
  });

  describe('layout advisories', () => {
    it('reports text landing on text, on a document the engine passes cleanly', async () => {
      const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeColliding()) });
      draw(transport);
      // The engine emitted no diagnostics for this document — the advisory is
      // the Designer's own reading of the box index.
      expect(
        await screen.findByText('Text in `title` and `meta` overlaps on page 1.'),
      ).toBeDefined();
      expect(screen.queryByText('No problems.')).toBeNull();
    });

    it('stays silent against an engine that does not report text metrics', async () => {
      const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeColliding()) });
      draw(transport, { capabilities: ['style.border'] });
      await waitFor(() => expect(transport.renderRaw).toHaveBeenCalled());
      expect(screen.queryByText('Text in `title` and `meta` overlaps on page 1.')).toBeNull();
      expect(screen.getByText('No problems.')).toBeDefined();
    });

    it('reports it when the engine does advertise text metrics', async () => {
      const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeColliding()) });
      draw(transport, { capabilities: ['inspect.text_metrics'] });
      expect(
        await screen.findByText('Text in `title` and `meta` overlaps on page 1.'),
      ).toBeDefined();
    });
  });

  it('surfaces injected file actions and a host entry in the File menu', () => {
    const onBack = vi.fn();
    const onOpen = vi.fn();
    const onExport = vi.fn();
    const onAddFont = vi.fn();
    const onSnapshots = vi.fn();
    const onHost = vi.fn();
    draw(makeTransport(), {
      documentName: 'Invoice',
      saveStatus: 'saved',
      menuActions: { onBack, onOpen, onExport, onAddFont, onSnapshots },
      hostMenuEntries: [{ id: 'help-desk', label: 'Help desk', onSelect: onHost }],
    });
    // The title bar shows the document name and the compact save status.
    expect(screen.getByText('Invoice')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();
    // Each injected file action dispatches its host callback from the File menu.
    for (const [item, spy] of [
      ['Back to templates', onBack],
      ['Open…', onOpen],
      ['Add font…', onAddFont],
      ['Restore points…', onSnapshots],
      ['Help desk', onHost],
    ] as const) {
      pickMenu('File', item);
      expect(spy).toHaveBeenCalledOnce();
    }
    // Export routes through the review pane first: the host callback
    // fires only once the pane is confirmed.
    pickMenu('File', 'Export');
    expect(onExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('opens the shortcuts dialog from the Help menu and closes it', () => {
    draw(makeTransport());
    pickMenu('Help', 'Keyboard shortcuts');
    const dialog = screen.getByRole('dialog');
    // Scoped to the dialog: the toolbar's undo IconButton carries the same word
    // in its (aria-hidden) tooltip bubble, so a page-wide text query is
    // ambiguous by design.
    expect(within(dialog).getByText('Undo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('opens the glossary dialog from the Help menu and closes it', () => {
    draw(makeTransport());
    pickMenu('Help', 'Glossary');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Data field')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('opens the tutorial launcher from the Help menu, with no host wiring', () => {
    draw(makeTransport());
    pickMenu('Help', 'Tutorial');
    // The launcher is Designer chrome now: every host gets it.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('A blank page and its setup')).toBeTruthy();
  });

  it('keeps the rest of the Help menu beside it', () => {
    draw(makeTransport());
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('menuitem', { name: 'Tutorial' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Glossary' })).toBeTruthy();
  });

  it('saves through when validate finds no errors', async () => {
    const onSave = vi.fn();
    draw(makeTransport(), { onSave });
    saveViaReview();
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.stringContaining('text: hello')),
    );
  });

  it('opens the review pane on Save and does not save until confirmed', async () => {
    const onSave = vi.fn();
    draw(makeTransport(), { onSave });
    pickMenu('File', 'Save');
    // An unedited document opened == current, so the pane shows the no-change
    // state — but nothing is saved until the user confirms.
    expect(screen.getByText('No changes')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('cancelling the review pane does not save', () => {
    const onSave = vi.fn();
    draw(makeTransport(), { onSave });
    pickMenu('File', 'Save');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the edited lines then advances the baseline after a confirmed save', async () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    draw(makeTransport(), { onChange, onSave });
    // Edit the item's text so the document differs from the opened baseline.
    fireEvent.click(await screen.findByRole('button', { name: 'sections.body.items[0]' }));
    const textField = screen.getByLabelText('Text');
    textField.textContent = 'changed';
    fireEvent.blur(textField);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: changed')),
    );
    // The review now shows the change (a diff, not the no-change card).
    pickMenu('File', 'Save');
    const dialog = screen.getByRole('dialog');
    // The added diff row carries the edited line verbatim (normalized).
    expect(within(dialog).getByText('text: changed')).toBeTruthy();
    expect(within(dialog).queryByText('No changes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Reopening the review shows no changes — the baseline advanced to the save.
    pickMenu('File', 'Save');
    expect(screen.getByText('No changes')).toBeTruthy();
  });

  it('saves through when validate reports only warnings', async () => {
    const onSave = vi.fn();
    const transport = makeTransport({
      validate: vi.fn(
        async (): Promise<Diagnostics> => ({
          items: [
            {
              severity: 'warning',
              code: 'undefined_style_name',
              category: 'style',
              message: 'w',
              args: { name: 'x' },
            },
          ],
        }),
      ),
    });
    draw(transport, { onSave });
    saveViaReview();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('blocks the save when validate reports an error (fail-closed)', async () => {
    const onSave = vi.fn();
    const transport = makeTransport({
      validate: vi.fn(
        async (): Promise<Diagnostics> => ({
          items: [
            {
              severity: 'error',
              code: 'image_source_missing',
              category: 'data',
              message: 'x',
              args: {},
            },
          ],
        }),
      ),
    });
    draw(transport, { onSave });
    saveViaReview();
    await waitFor(() =>
      expect(screen.getByText('Fix the errors below before saving.')).toBeDefined(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks the save when validate rejects (fail-closed)', async () => {
    const onSave = vi.fn();
    const transport = makeTransport({
      validate: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    draw(transport, { onSave });
    saveViaReview();
    await waitFor(() => expect(screen.getByText('Could not validate the template.')).toBeDefined());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('surfaces preview diagnostics and selects the item when one is clicked', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport);
    // With nothing selected the panel is the no-selection hint card.
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
    await waitFor(() => screen.getByRole('button', { name: /heading/ }));
    fireEvent.click(screen.getByRole('button', { name: /heading/ }));
    expect(screen.getByLabelText('Text')).toBeDefined();
  });

  it('applies a diagnostics quick-fix as one undoable op when 修正 is clicked', async () => {
    const source = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    items:',
      '      - type: text',
      '        text: hello',
      '        box:',
      '          gap: 4',
      '',
    ].join('\n');
    const fixDiag: Diagnostic = {
      severity: 'warning',
      code: 'layout_key_on_leaf',
      category: 'layout',
      message: 'box layout keys ignored here',
      args: {},
      path: 'sections.body.items[0]',
    };
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [fixDiag] })),
    });
    draw(transport, { source, onChange });
    fireEvent.click(await screen.findByRole('button', { name: 'Fix' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.not.stringContaining('gap')));
    // ⌘Z outside an editable element reverts the whole fix in one step.
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.stringContaining('gap: 4')));
  });

  it('clears the selection on Escape, returning to the no-selection card', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport);
    await waitFor(() => screen.getByRole('button', { name: /heading/ }));
    fireEvent.click(screen.getByRole('button', { name: /heading/ }));
    expect(screen.getByLabelText('Text')).toBeDefined();
    // Escape INSIDE an editable element is the field's cancel, not a
    // deselect — the selection (and the Text field) must survive it.
    fireEvent.keyDown(screen.getByLabelText('Text'), { key: 'Escape' });
    expect(screen.getByLabelText('Text')).toBeDefined();
    // Escape outside an editable element clears the selection.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('edits through the panel, notifies onChange, and undoes/redoes via the keyboard', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport, { onChange });
    await waitFor(() => screen.getByRole('button', { name: /heading/ }));
    fireEvent.click(screen.getByRole('button', { name: /heading/ }));

    const textField = screen.getByLabelText('Text');
    textField.textContent = 'world';
    fireEvent.blur(textField);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: world')),
    );
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    // A non-shortcut key is ignored, and ⌘Z INSIDE an editable element is left
    // to the browser's native in-field undo (the document op stays applied).
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(screen.getByLabelText('Text'), { key: 'z', metaKey: true });
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('text: hello'));
    // Outside an input, ⌘Z undoes; ⇧⌘Z redoes.
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: hello')),
    );
    // The uncontrolled panel editor RESEEDED to the undone value — the
    // value-keyed remount reseeds on the external change, not a stale 'world'
    // left in the DOM.
    expect(screen.getByLabelText('Text').textContent).toBe('hello');
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    await waitFor(() => {
      const calls = onChange.mock.calls.filter((c) => String(c[0]).includes('text: world'));
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('treats inputs, textareas, and contenteditable hosts as editable targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    const editable = document.createElement('div');
    // jsdom's contentEditable support is partial, so pin the derived flag
    // directly — the browser sets it from the contenteditable attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableTarget(editable)).toBe(true);
    // jsdom never derives the flag at all, so the attribute lookup is the
    // branch that fires there — including from a chip span (its own
    // contenteditable is "false", but its editing host is the target's home).
    const host = document.createElement('div');
    host.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(host)).toBe(true);
    const chip = document.createElement('span');
    chip.setAttribute('contenteditable', 'false');
    host.appendChild(chip);
    expect(isEditableTarget(chip)).toBe(true);
  });

  it('renders localized chrome and diagnostics under a BCP 47 regional locale', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport, {}, 'zh-TW');
    // Chrome comes from the zh-tw catalog — the File menu trigger and the
    // undo icon button's accessible name are both localized.
    expect(screen.getByRole('button', { name: '檔案' })).toBeDefined();
    expect(screen.getByRole('button', { name: '復原' })).toBeDefined();
    // ...and so does the diagnostic row (code + args through the catalog).
    await waitFor(() =>
      expect(screen.getByText(/styleName `heading` 未定義於 `styles` 登錄中/)).toBeDefined(),
    );
  });

  it('renders a chrome-only language with English diagnostics', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcome({ items: [STYLE_DIAG] })),
    });
    draw(transport, {}, 'hi-IN');
    // hi carries chrome (the File menu trigger is localized)...
    expect(screen.getByRole('button', { name: 'फ़ाइल' })).toBeDefined();
    // ...but no diagnostics, which fall through per key to English.
    await waitFor(() =>
      expect(
        screen.getByText(/styleName `heading` is not defined in the `styles` registry/),
      ).toBeDefined(),
    );
  });

  it('degrades an unsupported locale to English chrome', () => {
    draw(makeTransport(), {}, 'de-DE');
    expect(screen.getByRole('button', { name: 'File' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  it('shows only the layers tab without definitions', () => {
    draw(makeTransport());
    expect(screen.getByRole('tab', { name: 'Structure' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Data fields' })).toBeNull();
    // The layer tree is the active tab content.
    expect(screen.getByRole('button', { name: 'Body' })).toBeTruthy();
  });

  it('selects an item from the layer tree and opens the panel on it', () => {
    draw(makeTransport());
    fireEvent.click(screen.getByRole('button', { name: 'hello' }));
    expect(screen.getByLabelText('Text')).toBeDefined();
    // The breadcrumb shows the ancestor chain; the section crumb escapes the
    // deep selection back to its container.
    const nav = screen.getByRole('navigation', { name: 'Selection path' });
    expect(nav.textContent).toContain('hello');
    fireEvent.click(within(nav).getByRole('button', { name: 'Body' }));
    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('opens the horizontal column sheet for a selected table and closes it', async () => {
    const source = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    items:',
      '      - type: table',
      '        data:',
      '          key: rows',
      '        columns:',
      '          - label: 品名',
      '            data:',
      '              key: name',
      '',
    ].join('\n');
    draw(makeTransport(), { source, params: '{"rows": [{"name": "x"}]}' });
    // Select the table via its canvas box, then open the sheet from the panel.
    fireEvent.click(await screen.findByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit in a sheet' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Column editor')).toBeTruthy();
    expect(within(dialog).getByDisplayValue('品名')).toBeTruthy();
    // Clicking Close invokes the sheet's onClose (the wiring under test here).
    // Headless UI holds the node through its jsdom exit transition, so the
    // disappear-on-close semantics are the Offcanvas unit test's concern.
    const close = within(dialog).getByRole('button', { name: 'Close' });
    fireEvent.click(close);
    expect(close).toBeTruthy();
  });

  it('jumps from a style field origin hint into the document-settings view', () => {
    const source = [
      'defaults:',
      '  style:',
      '    fontSize: 20',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: hi',
      '',
    ].join('\n');
    draw(makeTransport(), { source });
    // Select the text item, open the 装飾 tab, and click an origin hint's jump.
    // Every unset inherited field shows a 既定値 hint over the engine floor, but
    // only the AUTHORED one (fontSize, from `defaults.style`) carries a jump —
    // the engine floor has nothing to visit.
    fireEvent.click(screen.getByRole('button', { name: 'hi' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    const jumps = screen.getAllByRole('button', { name: 'Document settings' });
    expect(jumps).toHaveLength(1);
    fireEvent.click(jumps[0]);
    // Selection cleared → the fullscreen view shows, with the defaults section
    // (Line height) present; the item panel (Text field) is gone.
    expect(screen.getByRole('heading', { name: 'Document settings' })).toBeTruthy();
    expect(screen.getByLabelText('Line height')).toBeTruthy();
    expect(screen.queryByLabelText('Text')).toBeNull();
  });

  it('reorders from the layer tree and notifies onChange with the moved document', async () => {
    const onChange = vi.fn();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: first',
      '      - type: text',
      '        text: second',
      '',
    ].join('\n');
    draw(makeTransport(), { source, onChange });
    fireEvent.keyDown(screen.getByRole('button', { name: 'second' }), {
      key: 'ArrowUp',
      altKey: true,
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const moved = String(onChange.mock.calls[0][0]);
    expect(moved.indexOf('second')).toBeLessThan(moved.indexOf('first'));
  });

  it('drag-reorders on canvas: ONE moveItem, selection travels, one undo step', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const target = screen.getByRole('button', { name: 'sections.body.items[0]' });
    // The Designer renders at scale 2 and jsdom rects are unmeasurable, so
    // client y 240 lands at page pt 120 — past the last sibling's midpoint.
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 240 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 240 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // ONE op: first moved to the tail, the other two shifted up.
    const moved = String(onChange.mock.calls[0][0]);
    expect(moved.indexOf('second')).toBeLessThan(moved.indexOf('first'));
    expect(moved.indexOf('third')).toBeLessThan(moved.indexOf('first'));
    // The selection travelled with the moved item to its destination path.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'sections.body.items[2]' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    // ONE undo step reverts the whole drag.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const reverted = String(onChange.mock.calls.at(-1)?.[0]);
      expect(reverted.indexOf('first')).toBeLessThan(reverted.indexOf('second'));
    });
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reorders from the canvas keyboard (Alt+ArrowDown) and travels the selection', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'sections.body.items[0]' }), {
      key: 'ArrowDown',
      altKey: true,
    });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const moved = String(onChange.mock.calls[0][0]);
    expect(moved.indexOf('second')).toBeLessThan(moved.indexOf('first'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'sections.body.items[1]' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('survives a canvas reorder the op layer rejects (nothing changes)', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[2]' }));
    // The last item moving down is out of range — the op layer rejects it
    // with the document and selection untouched.
    fireEvent.keyDown(screen.getByRole('button', { name: 'sections.body.items[2]' }), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-pressed="true"]')).toBeNull();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('leaves the document and history alone on a no-op canvas drop', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeStacked(paths)),
    });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const target = screen.getByRole('button', { name: 'sections.body.items[0]' });
    // Drags past the threshold but stays in its own slot.
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 5 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 12 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 12 });
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('multi-selects, aligns, and distributes absolute items from the canvas', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    draw(transport, { source: ABS_VARIED, onChange });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    // Plain-click the first (primary), shift-click the second (multi) → the
    // align cluster appears (two movable items selected).
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Align left' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();
    // Shift-click the third → three movable, distribute enabled.
    fireEvent.click(screen.getByRole('button', { name: paths[2] }), { shiftKey: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Distribute horizontally' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it('aligning already-aligned items dispatches nothing (no empty undo step)', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    // ABS_ITEMS + outcomeStacked: all three share x=0 and are evenly spaced in
    // y, so Align left and Distribute vertically both produce no ops.
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: ABS_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: paths[2] }), { shiftKey: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Align left' }));
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertically' }));
    // Nothing changed → no document edit, undo stays disabled.
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggles a multi-selected item back off with a second shift-click', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    draw(transport, { source: ABS_VARIED });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    expect(await screen.findByRole('button', { name: 'Align left' })).toBeTruthy();
    // A second shift-click removes it → back under two movable → cluster gone.
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull());
  });

  it('clears the multi-selection on Escape', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    draw(transport, { source: ABS_VARIED });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    expect(await screen.findByRole('button', { name: 'Align left' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull());
  });

  it('ignores a shift-click on a non-movable (flow) item', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: THREE_ITEMS });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[1] }), { shiftKey: true });
    // Flow children are reorderable, not movable → no multi-selection, no cluster.
    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
  });

  it('rubber-band selects absolute items, additive adds, an empty sweep deselects', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeAbs(paths)) });
    const { container } = draw(transport, { source: ABS_VARIED });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    const svg = container.querySelector(
      'svg[aria-label="template layout overlay"]',
    ) as SVGSVGElement;
    const sweep = (init: object, x2: number, y2: number) => {
      fireEvent.pointerDown(svg, {
        pointerId: 1,
        isPrimary: true,
        clientX: 0,
        clientY: 0,
        ...init,
      });
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: x2, clientY: y2 });
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: x2, clientY: y2 });
    };
    // A wide sweep covers all three movable items → the cluster appears.
    sweep({}, 10000, 10000);
    expect(await screen.findByRole('button', { name: 'Align left' })).toBeTruthy();
    // A small sweep (past the 4px threshold) far from every box, non-additive
    // → selects nothing → deselects (cluster gone).
    sweep({}, 6, 6);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull());
    // Shift-sweep is additive over the current selection.
    sweep({ shiftKey: true }, 10000, 10000);
    expect(await screen.findByRole('button', { name: 'Align left' })).toBeTruthy();
  });

  it('renders the field palette when definitions are present, and a field click selects the bound item', async () => {
    const definitions = [
      'type: object',
      'properties:',
      '  greeting:',
      '    type: string',
      '    title: Greeting',
      '',
    ].join('\n');
    const source = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    items:',
      '      - type: text',
      '        data: { key: greeting }',
      '',
    ].join('\n');
    render(
      <I18nProvider locale="en">
        <EngineProvider transport={makeTransport()}>
          <Designer source={source} params="{}" definitions={definitions} />
        </EngineProvider>
      </I18nProvider>,
    );
    // With nothing selected the panel shows the no-selection hint...
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
    // ...the palette lives behind the sidebar's data tab...
    fireEvent.click(screen.getByRole('tab', { name: 'Data fields' }));
    // ...and clicking the used palette field selects the bound text item.
    fireEvent.click(screen.getByRole('button', { name: /Greeting/ }));
    expect(screen.getByLabelText('Data key')).toBeDefined();
    expect((screen.getByLabelText('Data key') as HTMLInputElement).value).toBe('greeting');
  });

  it('shows a preview error when a render rejects', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(async () => {
        throw new TransportError('render failed');
      }),
    });
    draw(transport);
    await waitFor(() => expect(screen.getByText('render failed')).toBeDefined());
  });

  it('keeps the last-good canvas when an edit renders ok:false, surfacing its diagnostics', async () => {
    const badDiag: Diagnostic = {
      severity: 'error',
      code: 'nonexistent_code_for_fallback',
      category: 'data',
      message: 'data key `` is not defined',
      args: {},
      path: 'sections.body.items[0]',
    };
    const renderRaw = vi
      .fn()
      .mockResolvedValueOnce(outcome({ items: [] }))
      // The invalid mid-edit document RESOLVES ok:false with zero pages — the
      // painted pages must survive it, only the diagnostics go red.
      .mockResolvedValue({
        ok: false,
        pages: [],
        inspect: null,
        diagnostics: { items: [badDiag] },
      });
    const transport = makeTransport({ renderRaw });
    const { container } = draw(transport);
    await waitFor(() => expect(container.querySelectorAll('canvas')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    await waitFor(() => expect(screen.getByText('data key `` is not defined')).toBeDefined());
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('inserts a text item from the insert menu, notifies onChange, and selects it', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: Text')),
    );
    // The new item (appended after the existing one) is selected, so the
    // property panel shows its content field instead of the page setup.
    expect(screen.getByLabelText('Text').textContent).toBe('Text');
  });

  it('survives an insert the op layer rejects (hostile items shape)', () => {
    const onChange = vi.fn();
    const broken = ['sections:', '  body:', '    items:', '      broken: true', ''].join('\n');
    draw(makeTransport(), { source: broken, onChange });
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('guides a blank body with the empty state and inserts via its CTA', async () => {
    const onChange = vi.fn();
    const blank = ['sections:', '  body:', '    type: flow', '    items: []', ''].join('\n');
    draw(makeTransport(), { source: blank, onChange });
    expect(screen.getByText('Start by placing some text.')).toBeTruthy();
    // The DOCUMENTED exception to "a canvas screen carries no primary"
    // (gui/STYLE.md § Actions): in an empty state this CTA is the only thing on
    // the work surface, so it is that screen's primary. Pinned here because
    // nothing else can see it — the source gate only ranks dialog FOOTERS.
    const cta = screen.getByRole('button', { name: 'Add text' });
    expect(cta.dataset.variant).toBe('primary');
    fireEvent.click(cta);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: Text')),
    );
    expect(screen.queryByText('Start by placing some text.')).toBeNull();
  });

  it('shows no empty state over a populated body', () => {
    draw(makeTransport());
    expect(screen.queryByText('Start by placing some text.')).toBeNull();
  });

  it('applies the light theme tokens as custom properties by default', () => {
    const { container } = draw(makeTransport());
    const root = container.querySelector('.sj-designer') as HTMLElement;
    expect(root.style.getPropertyValue('--sj-bg')).toBe('#f7f5f1');
    expect(root.style.getPropertyValue('--sj-accent')).toBe('#c2402a');
  });

  it('switches the token set with colorScheme', () => {
    const { container } = draw(makeTransport(), { colorScheme: 'dark' });
    const root = container.querySelector('.sj-designer') as HTMLElement;
    expect(root.style.getPropertyValue('--sj-bg')).toBe('#201e1b');
    expect(root.style.getPropertyValue('--sj-accent')).toBe('#e0664a');
  });

  it('lets a host theme override beat the scheme value', () => {
    const { container } = draw(makeTransport(), {
      colorScheme: 'dark',
      theme: { accent: '#123456' },
    });
    const root = container.querySelector('.sj-designer') as HTMLElement;
    expect(root.style.getPropertyValue('--sj-accent')).toBe('#123456');
    expect(root.style.getPropertyValue('--sj-bg')).toBe('#201e1b');
  });

  // ---- zoom -------------------------------------------------------------

  it('re-renders at the selected zoom scale and keeps the transform identity at 100%', async () => {
    const onChange = vi.fn();
    const transport = makeTransport();
    const { container } = draw(transport, { onChange });
    const canvas = () => container.querySelector('.sj-canvas') as HTMLElement;
    // Default 100%: pages rendered at the base scale, no CSS magnification.
    expect(canvas().style.transform).toBe('scale(1)');
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: '2' } });
    // 200% zoom over the base scale 2 → the engine rasterizes at scale 4.
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { scale: 4 },
      ),
    );
    // Zoom is UI state only — it never touches the document (the
    // template-engineer gate: no GUI-only state in the produced file).
    expect(onChange).not.toHaveBeenCalled();
  });

  it('caps the render scale and covers the overflow with a CSS transform', async () => {
    const transport = makeTransport();
    const { container } = draw(transport);
    // 400% wants scale 8; the render is capped at 6, so the canvas is CSS-scaled
    // by 8/6 to reach the desired zoom.
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: '4' } });
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { scale: 6 },
      ),
    );
    await waitFor(() => {
      const canvas = container.querySelector('.sj-canvas') as HTMLElement;
      expect(canvas.style.transform).toContain('scale(1.33');
    });
  });

  it('steps the zoom with the +/− buttons', async () => {
    const transport = makeTransport();
    draw(transport);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { scale: 3 },
      ),
    );
  });

  it('zooms on ⌘/Ctrl+wheel (cursor-anchored) and leaves a plain wheel to native scroll', async () => {
    const { container } = draw(makeTransport());
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;

    // A plain wheel is not prevented and does not zoom.
    const plain = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
    scroll.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect((screen.getByLabelText('Zoom level') as HTMLSelectElement).value).toBe('1');

    // ⌘+wheel is prevented (so the browser page-zoom never fires) and zooms in.
    const zoomed = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    scroll.dispatchEvent(zoomed);
    expect(zoomed.defaultPrevented).toBe(true);
    // 1 × e^(0.15) ≈ 1.16 → an off-step zoom, shown as a live 116% option. The
    // setState fires from a native (non-React) listener, so wait for the flush.
    await waitFor(() => expect(screen.getByRole('option', { name: '116%' })).toBeDefined());
  });

  it('ignores a ⌘/Ctrl+wheel that does not move the zoom (still preventing the page zoom)', () => {
    const { container } = draw(makeTransport());
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    const flat = new WheelEvent('wheel', {
      deltaY: 0,
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    scroll.dispatchEvent(flat);
    expect(flat.defaultPrevented).toBe(true);
    expect((screen.getByLabelText('Zoom level') as HTMLSelectElement).value).toBe('1');
  });

  it('survives a hostile non-finite wheel delta without moving the zoom', () => {
    const { container } = draw(makeTransport());
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    // The WheelEvent CONSTRUCTOR rejects non-finite deltas (WebIDL `double`),
    // so a hostile NaN can only arrive as a forged property on a plain event —
    // exactly what a hostile script would dispatch. The zoom must neither
    // change nor poison the render scale (NaN would ride into renderRaw).
    const hostile = new Event('wheel', { cancelable: true, bubbles: true });
    Object.defineProperty(hostile, 'deltaY', { value: Number.NaN });
    Object.defineProperty(hostile, 'ctrlKey', { value: true });
    Object.defineProperty(hostile, 'clientX', { value: 10 });
    Object.defineProperty(hostile, 'clientY', { value: 10 });
    scroll.dispatchEvent(hostile);
    expect((screen.getByLabelText('Zoom level') as HTMLSelectElement).value).toBe('1');
  });

  it('fits the page to the measured container', async () => {
    const transport = makeTransport();
    const { container } = draw(transport);
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 1000, configurable: true });
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: 'fit' } });
    // An 8×8 page (at base scale) in an 800×1000 box fits far beyond 400%, so the
    // fit clamps to the maximum zoom.
    expect((screen.getByLabelText('Zoom level') as HTMLSelectElement).value).toBe('4');
  });

  it('falls back to 100% when a fit finds no rendered page', async () => {
    const transport = makeTransport({
      renderRaw: vi.fn(
        async (): Promise<RenderOutcome> => ({
          ok: true,
          pages: [],
          inspect: null,
          diagnostics: { items: [] },
        }),
      ),
    });
    draw(transport);
    const level = () => screen.getByLabelText('Zoom level') as HTMLSelectElement;
    fireEvent.change(level(), { target: { value: '2' } });
    expect(level().value).toBe('2');
    await waitFor(() => expect(transport.renderRaw).toHaveBeenCalled());
    fireEvent.change(level(), { target: { value: 'fit' } });
    expect(level().value).toBe('1');
  });

  it('opens at Fit zoom once the first good preview arrives (measured container)', async () => {
    const transport = makeTransport();
    const { container } = draw(transport);
    // Measure the container BEFORE the async preview resolves, so the initial
    // fit reads a real size.
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 1000, configurable: true });
    // An 8×8 page in an 800×1000 box fits far beyond 400% → clamps to max zoom,
    // applied automatically on open (no user interaction).
    await waitFor(() =>
      expect((screen.getByLabelText('Zoom level') as HTMLSelectElement).value).toBe('4'),
    );
  });

  it('does not re-fit after the initial open when the preview re-renders', async () => {
    const transport = makeTransport();
    const { container } = draw(transport);
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 1000, configurable: true });
    const level = () => screen.getByLabelText('Zoom level') as HTMLSelectElement;
    await waitFor(() => expect(level().value).toBe('4'));
    // The user picks 200%, which re-renders the preview at a new scale (a fresh
    // lastGood). The one-shot has fired, so the auto-fit must not clobber it.
    fireEvent.change(level(), { target: { value: '2' } });
    await waitFor(() => expect(transport.renderRaw).toHaveBeenCalledTimes(2));
    expect(level().value).toBe('2');
  });

  it('never auto-fits over a zoom the user set BEFORE the fit could fire', async () => {
    const transport = makeTransport();
    const { container } = draw(transport);
    const level = () => screen.getByLabelText('Zoom level') as HTMLSelectElement;
    // The container is unmeasurable (jsdom default 0×0), so the auto-fit is
    // still deferred when the user zooms to 200% — that interaction consumes
    // the one-shot: the user has taken over.
    fireEvent.change(level(), { target: { value: '2' } });
    await waitFor(() => expect(transport.renderRaw).toHaveBeenCalled());
    // The container becomes measurable and an edit lands a fresh preview…
    const scroll = container.querySelector('.sj-designer-canvas') as HTMLElement;
    Object.defineProperty(scroll, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 1000, configurable: true });
    const calls = (transport.renderRaw as ReturnType<typeof vi.fn>).mock.calls.length;
    // A style edit on the selected item lands a fresh preview (the page-size
    // control moved into the document view; any edit exercises the same path).
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    await waitFor(() =>
      expect((transport.renderRaw as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        calls,
      ),
    );
    // …and the user's zoom survives (no deferred fit fires late).
    expect(level().value).toBe('2');
  });

  // ---- inline text editing ---------------------------------------------

  it('opens the inline editor on double-click of a text box and commits one op', async () => {
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const editor = screen.getByLabelText('Edit text');
    expect(editor.textContent).toBe('hello');
    editor.textContent = 'edited';
    fireEvent.blur(editor);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: edited')),
    );
    // The overlay editor closed after the commit.
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });

  it('cancels the inline editor on Escape without writing', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const editor = screen.getByLabelText('Edit text');
    editor.textContent = 'abandoned';
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByLabelText('Edit text')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a picked field as a chip in the overlay editor and commits its wire', async () => {
    const onChange = vi.fn();
    const defs = [
      'properties:',
      '  customer:',
      '    type: object',
      '    properties:',
      '      name: { type: string, title: 顧客名 }',
      '',
    ].join('\n');
    draw(makeTransport(), { onChange, definitions: defs });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const editor = screen.getByLabelText('Edit text');
    // No live caret: the chip appends at the end of the seeded text.
    document.getSelection()?.removeAllRanges();
    fireEvent.click(overlayInsertMenu());
    fireEvent.click(screen.getByRole('menuitem', { name: /顧客名/ }));
    expect(editor.querySelector('.sj-chip')?.textContent).toBe('顧客名');
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('hello{customer.name}')),
    );
    // The overlay editor closed after the commit.
    expect(screen.queryByLabelText('Edit text')).toBeNull();
    // ONE op: a single undo restores the pre-chip text.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('text: hello');
      expect(last).not.toContain('{customer.name}');
    });
  });

  it('declares a charset-unsafe key from the overlay, text and all, as ONE op', async () => {
    const onChange = vi.fn();
    const defs = ['properties:', '  品名: { type: string, title: 品名 }', ''].join('\n');
    draw(makeTransport(), { onChange, definitions: defs });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const editor = screen.getByLabelText('Edit text');
    document.getSelection()?.removeAllRanges();
    fireEvent.click(overlayInsertMenu());
    fireEvent.click(screen.getByRole('menuitem', { name: /品名/ }));
    // The chip reads as the FIELD, not as the alias the wire carries.
    expect(editor.querySelector('.sj-chip')?.textContent).toBe('品名');
    fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('hello{f1}');
      expect(last).toContain('bindings:');
    });
    // ONE undo takes the text AND its declaration back.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('text: hello');
      expect(last).not.toContain('bindings');
    });
  });

  it('offers no charset-unsafe field against an engine without declarations', async () => {
    const defs = ['properties:', '  品名: { type: string, title: 品名 }', ''].join('\n');
    draw(makeTransport(), { definitions: defs, capabilities: ['binding.scope'] });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(overlayInsertMenu());
    expect(screen.queryByRole('menuitem', { name: /品名/ })).toBeNull();
    expect(screen.getByText('No data fields to choose from.')).toBeDefined();
  });

  it('commits a YAML-structure-looking string verbatim as a scalar (no injection)', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    // A value full of YAML structural characters must land as plain text data,
    // not reshape the document (the serializer quotes it).
    const yamlish = screen.getByLabelText('Edit text');
    yamlish.textContent = '*alias ]}: &x';
    fireEvent.blur(yamlish);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('*alias ]}: &x')),
    );
    // It is a text value, not new structure: still exactly one item in the body.
    const last = String(onChange.mock.calls.at(-1)?.[0]);
    expect(last.match(/type: text/g)?.length).toBe(1);
  });

  it('does not open the inline editor for a non-text item', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: rect',
      '        box: { w: 40, h: 20 }',
      '',
    ].join('\n');
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[0]'])),
    });
    draw(transport, { source });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });

  it('does not open the inline editor for a data-bound text item', async () => {
    // A `text` item in data mode fails the CONTENT-MODE half of the gate — the
    // rect case above only witnesses the type half; both need a witness or a
    // regression to a type-only gate passes every test.
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        data: { key: greeting }',
      '',
    ].join('\n');
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[0]'])),
    });
    draw(transport, { source });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    // A real double-click is click+click+dblclick — RTL's doubleClick fires
    // only the dblclick, so fire the selecting click explicitly first.
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    expect(screen.queryByLabelText('Edit text')).toBeNull();
    // The user is not stranded: the item IS selected, the panel shows data mode.
    expect(screen.getByLabelText('Data key')).toBeDefined();
  });

  it('does not open the inline editor for a qr_code item (content-alike but not v1)', async () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: qr_code',
      '        text: https://example.com',
      '        box: { w: 40, h: 40 }',
      '',
    ].join('\n');
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[0]'])),
    });
    draw(transport, { source });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });

  // ---- Delete / ⌘D ------------------------------------------------------

  it('deletes the selected item on Delete and Backspace, moving selection to the surviving sibling', async () => {
    const onChange = vi.fn();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        text: first',
      '      - type: text',
      '        text: second',
      '',
    ].join('\n');
    const transport = makeTransport({
      renderRaw: vi.fn(async () =>
        outcomeWith(['sections.body.items[0]', 'sections.body.items[1]']),
      ),
    });
    draw(transport, { source, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[1]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[1]' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).not.toContain('second');
      expect(last).toContain('first');
    });
    // Deleting the LAST item moves the selection to the previous sibling — the
    // panel shows its Text field, never snapping back to page setup.
    await waitFor(() => expect(screen.getByLabelText('Text').textContent).toBe('first'));

    // Backspace deletes the remaining item; the sequence empties.
    fireEvent.keyDown(window, { key: 'Backspace' });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('items: []');
    });
  });

  it('selects the next sibling shifted into the freed slot on a middle delete', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () =>
        outcomeWith(['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]']),
      ),
    });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[1]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[1]' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).not.toContain('second');
    });
    // items[1] is now the item that was items[2] ("third") — selection stays on
    // the freed slot's new occupant.
    await waitFor(() => expect(screen.getByLabelText('Text').textContent).toBe('third'));
  });

  it('selects the section root (not page setup) when the sequence empties', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[0]'])),
    });
    draw(transport, { source: SOURCE, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('items: []');
    });
    // The section root is selected, so the panel is the item editor, not the
    // no-selection hint (and page size never lived in the panel).
    expect(screen.queryByText('Nothing selected.')).toBeNull();
  });

  it('clears the selection when a bare top-level sequence empties (no enclosing node)', async () => {
    const onChange = vi.fn();
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items: []',
      'attachments: [ keep ]',
      '',
    ].join('\n');
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['attachments[0]'])),
    });
    draw(transport, { source, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'attachments[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'attachments[0]' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      expect(last).toContain('attachments: []');
    });
    // No enclosing selectable node → selection clears → the no-selection card.
    expect(screen.getByText('Nothing selected.')).toBeTruthy();
  });

  it('duplicates the selected item on ⌘/Ctrl+D and selects the copy', async () => {
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    await waitFor(() => {
      const last = String(onChange.mock.calls.at(-1)?.[0]);
      // Two copies of the text now.
      expect(last.match(/text: hello/g)?.length).toBe(2);
    });
    // The copy (items[1]) is selected, so its Text field is shown.
    expect(screen.getByLabelText('Text').textContent).toBe('hello');
  });

  it('is a no-op when Delete/⌘D fire with nothing selected', () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is a no-op when the selection is not a sequence item (a section root)', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body'])),
    });
    draw(transport, { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the document unchanged when the op layer rejects a hostile selection index', async () => {
    const onChange = vi.fn();
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[99999999]'])),
    });
    draw(transport, { source: SOURCE, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[99999999]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[99999999]' }));
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    // The out-of-range op fails cleanly — no document mutation, no crash.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves Delete to the field inside an editable target', async () => {
    const onChange = vi.fn();
    draw(makeTransport(), { onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    // Delete pressed inside the property panel's Text field must not remove the
    // item — it is the field's own character deletion.
    fireEvent.keyDown(screen.getByLabelText('Text'), { key: 'Delete' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Text')).toBeDefined();
  });

  it('wires the format toolbar to the shared selection (canvas ⇄ panel)', async () => {
    draw(makeTransport());
    // Nothing selected — the toolbar shows no formatting controls.
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    // The toolbar now reflects the text selection.
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    // A toolbar edit is read back by the property panel (one shared document).
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    // The panel's Weight control lives in the 装飾 tab.
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    expect((screen.getByLabelText('Weight') as HTMLSelectElement).value).toBe('bold');
  });

  it('closes a toolbar popover on Escape without clearing the selection', async () => {
    draw(makeTransport());
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    // Escape closes the popover; the Designer's window-level Escape-deselect
    // must NOT also fire (the popover stops the event).
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByLabelText('Text')).toBeTruthy();
  });
});

// Every placement-chip key the classification can produce (movable places,
// reorderable places, fixed reasons — one flat namespace).
const PLACE_KEYS = [
  'absolute',
  'band',
  'positioned',
  'flow',
  'flex',
  'grid',
  'repeat',
  'noBox',
  'relative',
  'flowPositioned',
  'section',
  'unknown',
].map((kind) => `canvas.place.${kind}`);

describe('placement chip catalog coverage', () => {
  it('carries every chip key in the full language catalogs', () => {
    for (const tag of ['en', 'ja', 'zh-tw', 'zh-cn'] as const) {
      const chrome = DEFAULT_CATALOG[tag]?.chrome ?? {};
      for (const key of PLACE_KEYS) {
        expect(chrome[key], `${tag} ${key}`).toBeTruthy();
      }
    }
  });
});

/** An absolute body whose authored positions match `outcomeStacked`. */
const ABS_ITEMS = [
  'sections:',
  '  body:',
  '    type: absolute',
  '    items:',
  '      - type: rect',
  '        box: { x: 0, y: 0, w: 100, h: 30 }',
  '      - type: rect',
  '        box: { x: 0, y: 40, w: 100, h: 30 }',
  '      - type: rect',
  '        box: { x: 0, y: 80, w: 100, h: 30 }',
  '',
].join('\n');

describe('Designer absolute manipulation', () => {
  it('offers the grid control, honoring the default and reporting changes', () => {
    const onGridStepChange = vi.fn();
    draw(makeTransport(), { defaultGridStep: 8, onGridStepChange });
    const select = screen.getByLabelText('Grid') as HTMLSelectElement;
    expect(select.value).toBe('8');
    fireEvent.change(select, { target: { value: '4' } });
    expect(onGridStepChange).toHaveBeenCalledWith(4);
    expect(select.value).toBe('4');
  });

  it('degrades a hostile defaultGridStep to the default step', () => {
    draw(makeTransport(), { defaultGridStep: 7 });
    expect((screen.getByLabelText('Grid') as HTMLSelectElement).value).toBe('1');
  });

  it('states the placement kind in the chip for the selected box', async () => {
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: THREE_ITEMS });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    fireEvent.click(screen.getByRole('button', { name: 'sections.body.items[0]' }));
    expect(screen.getByText('Flow — drag to reorder')).not.toBeNull();
  });

  it('drag-moves an absolute item: authored values, one undo step', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: ABS_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[0]' }));
    const target = screen.getByRole('button', { name: 'sections.body.items[0]' });
    // Scale 2 with unmeasurable jsdom rects: client y 250 → page pt 125 →
    // delta 120 from the press at y 10 (pt 5).
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 250 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 250 });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const moved = String(onChange.mock.calls.at(-1)?.[0]);
    expect(moved).toContain('y: 120');
    // The selection stays on the moved item (its path never changed).
    expect(
      screen.getByRole('button', { name: 'sections.body.items[0]' }).getAttribute('aria-pressed'),
    ).toBe('true');
    // The chip states the absolute placement.
    expect(screen.getByText('Absolute — drag to move')).not.toBeNull();
    // ONE undo step reverts the whole move.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const reverted = String(onChange.mock.calls.at(-1)?.[0]);
      expect(reverted).toContain('y: 0');
    });
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a move whose commit lands on a deleted item applies nothing', async () => {
    const onChange = vi.fn();
    const paths = ['sections.body.items[0]', 'sections.body.items[1]', 'sections.body.items[2]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: ABS_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: 'sections.body.items[2]' }));
    const target = screen.getByRole('button', { name: 'sections.body.items[2]' });
    // Select the LAST item, start its move drag…
    fireEvent.click(target);
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 170 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 250 });
    // …then the item vanishes mid-drag (Delete acts on the selection), so the
    // drop's batch targets a path that no longer exists — the op layer refuses
    // and the document keeps only the deletion.
    fireEvent.keyDown(window, { key: 'Delete' });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 250 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refused drag reason in the chip and applies nothing', async () => {
    const onChange = vi.fn();
    // A table column fragment: part of a repeating sub-template, never
    // movable — the drag attempt explains why instead of doing nothing.
    const paths = ['sections.body.items[0].columns[0]'];
    const transport = makeTransport({ renderRaw: vi.fn(async () => outcomeStacked(paths)) });
    draw(transport, { source: THREE_ITEMS, onChange });
    await waitFor(() => screen.getByRole('button', { name: paths[0] }));
    const target = screen.getByRole('button', { name: paths[0] });
    fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: 50, clientY: 10 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 50, clientY: 100 });
    const chip = screen.getByText('Repeating part — edits affect every instance');
    expect(chip.className).toContain('sj-place-chip--refused');
    expect(onChange).not.toHaveBeenCalled();
    // The next selection clears the refusal state (the drag's trailing click
    // is consumed, so the second click is the selecting one).
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    fireEvent.click(screen.getByRole('button', { name: paths[0] }));
    expect(
      screen.getByText('Repeating part — edits affect every instance').className,
    ).not.toContain('sj-place-chip--refused');
  });
});

describe('Designer — the margin-box guide reaches the canvas', () => {
  // The shipped path, end to end: the engine's resolved `inspect.margin` →
  // `usePreviewSession.margin` → `CanvasArea` → `DesignerCanvas` → each page's
  // `BoxOverlay`. The pure model and every component are unit-tested; this is
  // the one case that would fail if any link in the THREAD were dropped.
  const withMargins = (): RenderOutcome => {
    const base = outcomeWith(['sections.body.items[0]']);
    return {
      ...base,
      pages: [{ width: 200, height: 200, rgba: new Uint8Array(200 * 200 * 4) }],
      // `outcomeWith` ships `margin: [0,0,0,0]` — the sheet-absolute escape
      // hatch, which deliberately paints nothing — so this needs real margins.
      inspect: base.inspect === null ? null : { ...base.inspect, margin: [25, 25, 25, 25] },
    };
  };

  it('outlines the margin box once a render lands', async () => {
    const transport = makeTransport({ renderRaw: vi.fn(async () => withMargins()) });
    const { container } = draw(transport);
    await waitFor(() => expect(container.querySelector('.sj-margin-guide')).not.toBeNull());
    // …with the origin corner named, which is the half that teaches.
    expect(container.querySelector('text.sj-margin-origin-text')?.textContent).toBe('0,0');
  });

  it('outlines nothing on a document with no margins at all', async () => {
    // `margin: 0` IS the sheet-absolute escape hatch: the margin box already is
    // the sheet, so there is no invisible rectangle to reveal.
    const transport = makeTransport({
      renderRaw: vi.fn(async () => outcomeWith(['sections.body.items[0]'])),
    });
    const { container } = draw(transport);
    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    expect(container.querySelector('.sj-margin-guide')).toBeNull();
  });

  it('outlines nothing when an ok render carries NO inspect envelope', async () => {
    // The session's `preview.lastGood?.inspect?.margin ?? null` null leg, walked
    // through the REAL hook. The all-zero-margin case above cannot stand in for
    // it: `marginGuide` refuses all-zero by design, so that assertion passes
    // whether or not the hook exposes anything, and coverage sees the line run
    // either way.
    const noInspect = (): RenderOutcome => ({
      ...withMargins(),
      inspect: null,
    });
    const transport = makeTransport({ renderRaw: vi.fn(async () => noInspect()) });
    const { container } = draw(transport);
    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    expect(container.querySelector('.sj-margin-guide')).toBeNull();
  });

  it('outlines nothing before the first render lands', async () => {
    // `preview.lastGood?` — the other clause of the same requirement: there is
    // no last-good preview yet, so there is no margin to expose.
    const transport = makeTransport({
      renderRaw: vi.fn(() => new Promise<RenderOutcome>(() => {})),
    });
    const { container } = draw(transport);
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('.sj-margin-guide')).toBeNull();
  });
});

describe('Designer — the canvas shows an edit before it is committed', () => {
  const AT = 'sections.body.items[0]';

  /** Select the seeded text item and return the panel's text field. */
  async function selectAndField() {
    fireEvent.click(await screen.findByRole('button', { name: AT }));
    return screen.getByLabelText('Text');
  }

  it('renders the pending text WITHOUT authoring anything', async () => {
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    const field = await selectAndField();
    field.textContent = 'world';
    fireEvent.input(field);

    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.stringContaining('text: world'),
        expect.anything(),
        undefined,
        expect.anything(),
      ),
    );
    // The three non-events. Coverage cannot see any of them: a behaviour that
    // writes nothing leaves no line uncovered by its absence.
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(field.textContent).toBe('world');
  });

  it('commits exactly one undo step when the field is finally left', async () => {
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    const field = await selectAndField();
    field.textContent = 'world';
    fireEvent.input(field);
    fireEvent.blur(field);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: world'));
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('SAVES the committed text, never the draft', async () => {
    // Reachable in a real browser through the keyboard save, which commits no
    // blur: the field keeps focus and the draft stands.
    const transport = makeTransport();
    const onSave = vi.fn();
    draw(transport, { onSave });
    const field = await selectAndField();
    field.textContent = 'world';
    fireEvent.input(field);
    // Wait for the DRAFT render specifically. `toHaveBeenCalled()` is satisfied
    // by the mount render, so saving there would prove nothing: with no draft
    // standing, the assertion below holds for an implementation that leaks the
    // draft into save just as well as for one that does not.
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.stringContaining('text: world'),
        expect.anything(),
        undefined,
        expect.anything(),
      ),
    );
    saveViaReview();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('text: hello'));
    expect(onSave).not.toHaveBeenCalledWith(expect.stringContaining('text: world'));
  });

  it('keeps the edit when the panel TAB changes mid-typing', async () => {
    // Found by driving the real app: the tab switch unmounts the field with no
    // blur, so the canvas showed the pending text and then took it back.
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    const field = await selectAndField();
    field.textContent = 'world';
    fireEvent.input(field);
    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: world')),
    );
  });

  it('withdraws the draft when the selection moves off the item — by COMMITTING it', async () => {
    // A deselection unmounts the field with no blur. The draft is withdrawn
    // either way (the canvas must never keep rendering a dead item's pending
    // text); what it is withdrawn INTO is the committed edit, not a revert.
    const onChange = vi.fn();
    const transport = makeTransport();
    draw(transport, { onChange });
    const field = await selectAndField();
    field.textContent = 'world';
    fireEvent.input(field);
    await waitFor(() =>
      expect(transport.renderRaw).toHaveBeenCalledWith(
        expect.stringContaining('text: world'),
        expect.anything(),
        undefined,
        expect.anything(),
      ),
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: world')),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
