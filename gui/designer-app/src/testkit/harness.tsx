// Shared EditorScreen-suite harness: mounting with the app-header report
// seam, plus the menubar / data-field / page-size interaction helpers.
// Test substrate only — excluded from coverage.
import { I18nProvider, useI18n } from '@shojiku/designer';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { cloneElement, type ReactElement, useState } from 'react';
import type { HeaderDoc } from '../app/AppHeader';
import { APP_CATALOG } from '../i18n/appCatalog';
import type { FileLike } from '../persistence/files';

/** Renders the reported header save status the way the app shell's header does
 * (the Designer's own title bar is unused in-app now — save state lives in the
 * app header). Save-lifecycle assertions read this probe. */
export function SaveProbe({ status }: { status?: HeaderDoc['saveStatus'] }) {
  const { t } = useI18n();
  if (status === undefined) {
    return null;
  }
  return (
    <output data-testid="save-probe">{t(status === 'saving' ? 'app.saving' : 'app.saved')}</output>
  );
}

export type HeaderReportingElement = ReactElement<{
  onHeaderDocChange?: (doc: HeaderDoc | null) => void;
}>;

/** Wraps an EditorScreen with the header-report seam the app shell provides,
 * surfacing the reported save status through a probe so the save-lifecycle
 * tests keep exercising real behavior. */
export function EditorWithHeader({ ui }: { ui: HeaderReportingElement }) {
  const [doc, setDoc] = useState<HeaderDoc | null>(null);
  return (
    <>
      {cloneElement(ui, { onHeaderDocChange: setDoc })}
      <SaveProbe status={doc?.saveStatus} />
    </>
  );
}

export function renderEditor(ui: HeaderReportingElement) {
  return render(
    <I18nProvider locale="en-US" catalog={APP_CATALOG}>
      <EditorWithHeader ui={ui} />
    </I18nProvider>,
  );
}

/** Pick a Designer menubar item: the file actions (open / export / add-font /
 * save / back) moved from standalone buttons into the File menu. */
export function pickMenu(menu: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: menu }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
  // Save/Export open a review pane first (GU16); its confirm button carries the
  // same label, so confirm it to reach the actual save/export.
  if (item === 'Save' || item === 'Export') {
    fireEvent.click(screen.getByRole('button', { name: item }));
  }
}

/** Open the fullscreen data-item editor (the sample-data tab is retired), select
 * a field, and return its sample-value control. */
export function openDataField(label: string): HTMLElement {
  pickMenu('File', 'Edit data fields…');
  const nav = screen.getByRole('navigation', { name: 'Data fields' });
  const row = within(nav)
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes(label));
  if (row === undefined) {
    throw new Error(`no data-field row for ${label}`);
  }
  fireEvent.click(row);
  return screen.getByLabelText('Sample value');
}

/** Edit the page size — a convenient document edit. The size control lives in
 * the fullscreen document-settings view now, so open it first (the 「whole-document」
 * layer-tree row) if it is not already showing. */
export function changePageSize(value: string) {
  if (screen.queryByLabelText('Size') === null) {
    fireEvent.click(screen.getByRole('button', { name: 'Document' }));
  }
  fireEvent.change(screen.getByLabelText('Size'), { target: { value } });
}

export const file = (name: string, size: number, text: string): FileLike => ({
  name,
  size,
  text: async () => text,
});

/** The stable rename callback the editor reports up in its HeaderDoc. Cast
 * (compile-time only) rather than guarded — the editor always reports one, so a
 * runtime guard would be a permanently-dead branch. */
export function reportedRename(reports: (HeaderDoc | null)[]): (name: string) => void {
  return (reports.at(-1) as HeaderDoc).onRename as (name: string) => void;
}
