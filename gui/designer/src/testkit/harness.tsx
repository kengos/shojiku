// Shared Designer-level test harness: mounting the composed Designer over a
// mock transport, plus the menubar / data-editor / overlay interaction
// helpers every suite drives the UI with. Test substrate only — excluded
// from coverage.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { Designer, type DesignerProps } from '../Designer';
import type { EngineTransport } from '../engine/transport';
import { I18nProvider } from '../i18n/context';
import { EngineProvider } from '../preview/context';
import { outcome, SOURCE } from './fixtures';

export function makeTransport(over: Partial<EngineTransport> = {}): EngineTransport {
  return {
    validate: vi.fn(async () => ({ items: [] })),
    renderRaw: vi.fn(async () => outcome({ items: [] })),
    ...over,
  };
}

export function draw(
  transport: EngineTransport,
  props: Partial<DesignerProps> = {},
  locale = 'en',
) {
  return render(
    <I18nProvider locale={locale}>
      <EngineProvider transport={transport}>
        <Designer source={SOURCE} params="{}" {...props} />
      </EngineProvider>
    </I18nProvider>,
  );
}

/** The canvas overlay's own insert-field trigger. The property panel carries
 * one for the SAME item while the overlay is open, so this query is scoped to
 * the overlay rather than the whole screen. */
export function overlayInsertMenu(): HTMLElement {
  const root = document.querySelector<HTMLElement>('.sj-inline-editor');
  if (root === null) {
    throw new Error('the inline overlay is not open');
  }
  return within(root).getByRole('button', { name: 'Insert a data field' });
}

/** Pick a menubar item: open its top-level menu, then click the entry. Save,
 * open, export etc. moved from standalone buttons into the menubar. */
export function pickMenu(menu: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: menu }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
}

// Save/Export now open the review pane first; confirming it proceeds
// with the actual save/export. This inlines the menu open + confirm (never via
// `pickMenu`, so a bulk edit over its literal cannot catch this helper's body).
export function saveViaReview() {
  fireEvent.click(screen.getByRole('button', { name: 'File' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

// The sample-data tab is retired: sample values (and definitions) are edited in
// the fullscreen data-item editor, opened from the File menu.
export function openDataEditor() {
  pickMenu('File', 'Edit data fields…');
}
export function selectDataField(label: string) {
  const nav = screen.getByRole('navigation');
  const row = within(nav)
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes(label));
  if (row === undefined) {
    throw new Error(`no data-field row for ${label}`);
  }
  fireEvent.click(row);
}
/** Open the editor, select the field, and return its sample-value control. */
export function openSampleValue(label = 'title'): HTMLElement {
  openDataEditor();
  selectDataField(label);
  return screen.getByLabelText('Sample value');
}
