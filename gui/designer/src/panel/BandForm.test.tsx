import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { BandForm } from './BandForm';
import { CellPanel } from './CellPanel';

const PATH = 'sections.footer';

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === PATH || path === 'sections.header' ? node : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function form(node: unknown, band: 'header' | 'footer' = 'footer') {
  const controller = makeController(node);
  render(
    <I18nProvider locale="en">
      <BandForm
        controller={controller}
        path={band === 'footer' ? PATH : 'sections.header'}
        band={band}
      />
    </I18nProvider>,
  );
  return controller;
}

const AUTHORED = { repeat: 'every_page', height: 40, items: [] };

describe('BandForm', () => {
  it('names the band with the same word the layer tree uses', () => {
    form(AUTHORED, 'header');
    expect(screen.getByRole('heading', { name: 'Header' })).toBeTruthy();
  });

  it('offers the engine four repeat modes and shows the authored one', () => {
    form({ ...AUTHORED, repeat: 'last_page' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      'every_page',
      'first_page',
      'except_first_page',
      'last_page',
    ]);
    expect(select.value).toBe('last_page');
  });

  it('shows the engine default for a band with no repeat key', () => {
    form({ height: 40, items: [] });
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('every_page');
  });

  it('authors the picked mode as ONE op', () => {
    const controller = form(AUTHORED);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'except_first_page' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['repeat'],
      value: 'except_first_page',
    });
  });

  it('authors NOTHING when the mode already on screen is re-picked', () => {
    const controller = form(AUTHORED);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'every_page' } });
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('keeps an UNKNOWN authored mode visible instead of silently rewriting it', () => {
    form({ ...AUTHORED, repeat: 'odd_pages' });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('odd_pages');
    expect([...select.options].map((option) => option.value)).toContain('odd_pages');
  });

  it('commits a typed height as a plain number', () => {
    const controller = form(AUTHORED);
    const input = screen.getByLabelText('Height');
    fireEvent.blur(input, { target: { value: '72' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['height'],
      value: 72,
    });
  });

  it('steps the height by one nudge per click', () => {
    const controller = form(AUTHORED);
    fireEvent.click(screen.getByRole('button', { name: 'Increase Height' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['height'],
      value: 44,
    });
  });

  it('renders a hostile node as empty fields rather than crashing', () => {
    form(3);
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('every_page');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('');
  });
});

describe('CellPanel routing', () => {
  function cell(path: string) {
    render(
      <I18nProvider locale="en">
        <CellPanel controller={makeController(AUTHORED)} path={path} groups={null} params="" />
      </I18nProvider>,
    );
  }

  it('routes both band paths to the band form', () => {
    cell('sections.header');
    expect(screen.getByRole('heading', { name: 'Header' })).toBeTruthy();
  });

  it('still routes a table COLUMN to its own form — the arm the band arm sits in front of', () => {
    const controller = makeController(AUTHORED);
    // The band arm is tried FIRST, so this is the regression it could cause.
    (controller as { read: (path: string) => unknown }).read = (path: string) =>
      path === 'sections.body.items[0]'
        ? { type: 'table', data: { key: 'rows' }, columns: [{ label: 'Name' }] }
        : undefined;
    render(
      <I18nProvider locale="en">
        <CellPanel
          controller={controller}
          path="sections.body.items[0].columns[0]"
          groups={null}
          params=""
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole('heading', { name: 'Footer' })).toBeNull();
    expect(screen.getByDisplayValue('Name')).toBeTruthy();
  });

  it('does NOT treat a path inside a band as the band itself', () => {
    // It falls through to the unsupported card — an item in a band is an item.
    cell('sections.footer.items[0]');
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

// The band height is a `StepperField` over `numberOp`, so it refuses a
// non-finite entry. This site did not exist when the fix was scoped — it
// arrived with the band-insert work — and is covered here because the shared
// widget covers it, not because anyone wired it up individually.

describe('BandForm height refusal', () => {
  // Mock controller: the fixture never moves, so the DISPLAYED value cannot
  // tell a refusal from an acceptance here (the field reseeds to `40` either
  // way). `apply` is the load-bearing assertion; the contrast that really
  // fires lives in `CharGridSection.test.tsx`, over the real editor.
  it('snaps a non-finite height back to the authored one, authoring nothing', () => {
    const controller = form(AUTHORED);
    const input = screen.getByLabelText('Height');
    fireEvent.change(input, { target: { value: 'tall' } });
    fireEvent.blur(input);
    expect(controller.apply).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('40');
  });

  it('still treats an EMPTY height as a clear, not a refusal', () => {
    // `numberOp` removes the key rather than returning null here, so an empty
    // entry is a real edit and must reach the document. Only the op is
    // asserted: against the mock the field reseeds to the fixture `40`
    // whatever the commit did, so a check on the displayed value would be
    // measuring the fixture rather than the clear.
    const controller = form(AUTHORED);
    const input = screen.getByLabelText('Height');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: PATH,
      keys: ['height'],
    });
  });
});
