// EditorScreen-level tests for useHeaderReport.ts — the name/save-status/
// rename report up to the app header (customName ?? documentName; a rename
// to exactly documentName clears it).
import { I18nProvider, type TemplateDoc } from '@shojiku/designer';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import { DraftStore } from '../persistence/drafts';
import {
  clean,
  FILES,
  makePrep,
  memoryStorage,
  resolvingFonts,
  services,
  TEMPLATE,
} from '../testkit/fixtures';
import { changePageSize, reportedRename } from '../testkit/harness';
import type { HeaderDoc } from './AppHeader';
import { EditorScreen } from './EditorScreen';

describe('EditorScreen header reporting', () => {
  function renderPlain(onHeaderDocChange: (doc: HeaderDoc | null) => void) {
    return render(
      <I18nProvider locale="en-US" catalog={APP_CATALOG}>
        <EditorScreen
          services={services()}
          docKey="p"
          engineLocale="en-US"
          files={FILES}
          prep={makePrep(clean, resolvingFonts(), [])}
          initialText={TEMPLATE}
          documentName="Invoice"
          onHeaderDocChange={onHeaderDocChange}
          onBack={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('reports the document name up to the app header, and clears it on unmount', () => {
    const calls: (HeaderDoc | null)[] = [];
    const { unmount } = renderPlain((doc) => calls.push(doc));
    // The report now also carries the rename callback (the title is renamable).
    expect(calls.at(-1)).toEqual({
      name: 'Invoice',
      saveStatus: undefined,
      onRename: expect.any(Function),
    });
    unmount();
    // Leaving the editor drops the title so a list / catalog view shows none.
    expect(calls.at(-1)).toBeNull();
  });

  it('does not render the name in the embedded Designer title bar', () => {
    const { container } = renderPlain(vi.fn());
    // In-app the name lives in the header (reported up), so the app passes no
    // documentName to the Designer and its own title bar renders nothing.
    const designer = container.querySelector('.sj-designer') as HTMLElement;
    expect(within(designer).queryByText('Invoice')).toBeNull();
  });
});

describe('EditorScreen rename', () => {
  function renderReporting(props: Partial<Parameters<typeof EditorScreen>[0]> = {}) {
    const reports: (HeaderDoc | null)[] = [];
    render(
      <I18nProvider locale="en-US" catalog={APP_CATALOG}>
        <EditorScreen
          services={services()}
          docKey="p"
          engineLocale="en-US"
          files={FILES}
          prep={makePrep(clean, resolvingFonts(), [])}
          initialText={TEMPLATE}
          documentName="Invoice"
          onHeaderDocChange={(doc) => reports.push(doc)}
          onBack={vi.fn()}
          {...props}
        />
      </I18nProvider>,
    );
    return reports;
  }

  it('reports the default name, then the custom name after a rename', () => {
    const reports = renderReporting();
    expect(reports.at(-1)?.name).toBe('Invoice');
    act(() => reportedRename(reports)('My invoice'));
    expect(reports.at(-1)?.name).toBe('My invoice');
  });

  it('seeds the reported name from a restored rename', () => {
    const reports = renderReporting({ initialCustomName: 'Draft name' });
    expect(reports.at(-1)?.name).toBe('Draft name');
  });

  it('follows a documentName change while the title is un-renamed', () => {
    const reports: (HeaderDoc | null)[] = [];
    const wrap = (name: string) => (
      <I18nProvider locale="en-US" catalog={APP_CATALOG}>
        <EditorScreen
          services={services()}
          docKey="p"
          engineLocale="en-US"
          files={FILES}
          prep={makePrep(clean, resolvingFonts(), [])}
          initialText={TEMPLATE}
          documentName={name}
          onHeaderDocChange={(doc) => reports.push(doc)}
          onBack={vi.fn()}
        />
      </I18nProvider>
    );
    const { rerender } = render(wrap('Invoice'));
    expect(reports.at(-1)?.name).toBe('Invoice');
    rerender(wrap('請求書'));
    expect(reports.at(-1)?.name).toBe('請求書');
    // The reported callback identity is stable across renders — the property
    // that keeps the report effect from looping.
    expect((reports.at(-1) as HeaderDoc).onRename).toBe((reports[0] as HeaderDoc).onRename);
  });

  it('persists a standalone rename to the local draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    const saveSpy = vi.spyOn(drafts, 'save');
    const reports = renderReporting({ services: services({ drafts }) });
    act(() => reportedRename(reports)('My invoice'));
    await waitFor(() => {
      const call = saveSpy.mock.calls.at(-1);
      expect((call?.[1] as { name?: string } | undefined)?.name).toBe('My invoice');
    });
  });

  it('clears the draft when a rename is reverted to the default name', async () => {
    const drafts = new DraftStore(memoryStorage());
    const reports = renderReporting({ services: services({ drafts }) });
    act(() => reportedRename(reports)('My invoice'));
    await waitFor(async () => expect((await drafts.load('p'))?.name).toBe('My invoice'));
    // Committing the default name clears the override → the working copy is
    // pristine again → the draft is dropped.
    act(() => reportedRename(reports)('Invoice'));
    await waitFor(async () => expect(await drafts.load('p')).toBeNull());
  });

  it('ignores a rename to the value already set (no redundant save)', async () => {
    const drafts = new DraftStore(memoryStorage());
    const saveSpy = vi.spyOn(drafts, 'save');
    const reports = renderReporting({ services: services({ drafts }) });
    act(() => reportedRename(reports)('My invoice'));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    // Re-committing the same custom name short-circuits (no second write).
    act(() => reportedRename(reports)('My invoice'));
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('persists a mounted rename to the host immediately and clears the local draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    // A typed impl so `mock.calls[..][1]` reads the doc argument (a bare
    // `vi.fn(async () => …)` types its calls tuple as `[]`).
    const save = vi.fn(async (_key: string, _doc: TemplateDoc) => ({ ok: true as const }));
    const target = { load: vi.fn(async () => null), save };
    const reports = renderReporting({
      services: services({ drafts }),
      docKey: 'invoices/monthly',
      documentName: 'Monthly',
      saveTarget: target,
      initialRev: 'r1',
    });
    act(() => reportedRename(reports)('Renamed'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[1]).toEqual({
      text: TEMPLATE,
      fonts: [],
      rev: 'r1',
      name: 'Renamed',
    });
    // Success acknowledges as 'saved'; the host is authoritative, so the
    // crash-recovery draft is cleared.
    await waitFor(() => expect(reports.at(-1)?.saveStatus).toBe('saved'));
    await waitFor(async () => expect(await drafts.load('invoices/monthly')).toBeNull());
  });

  it('sends a mounted rename back to the entry name explicitly (no silent revert)', async () => {
    // Entry names are host strings: after renaming away, renaming BACK to the
    // opened entry name must still reach a name-honoring host — collapsing it
    // to "no name" would leave the host on the previous rename, diverging from
    // the header. (The standalone default-name collapse stays standalone-only.)
    const save = vi.fn(async (_key: string, _doc: TemplateDoc) => ({ ok: true as const }));
    const target = { load: vi.fn(async () => null), save };
    const reports = renderReporting({
      docKey: 'invoices/monthly',
      documentName: 'Monthly',
      saveTarget: target,
      initialRev: 'r1',
    });
    act(() => reportedRename(reports)('Renamed'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    act(() => reportedRename(reports)('Monthly'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1].name).toBe('Monthly');
    expect(reports.at(-1)?.name).toBe('Monthly');
  });

  it('keeps the working copy when an edit lands during a mounted rename save', async () => {
    const drafts = new DraftStore(memoryStorage());
    let resolveSave: (o: { ok: true }) => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<{ ok: true }>((r) => {
          resolveSave = r;
        }),
    );
    const target = { load: vi.fn(async () => null), save };
    const reports = renderReporting({
      services: services({ drafts }),
      docKey: 'invoices/monthly',
      documentName: 'Monthly',
      saveTarget: target,
      initialRev: 'r1',
    });
    act(() => reportedRename(reports)('Renamed'));
    // The rename save is in flight (reported as 'saving').
    await waitFor(() => expect(reports.at(-1)?.saveStatus).toBe('saving'));
    // An edit while it is in flight makes the local copy newer — the outcome
    // must not claim "saved" (the shared edit-counter guard).
    changePageSize('Legal');
    await act(async () => {
      resolveSave({ ok: true });
    });
    expect(reports.some((r) => r?.saveStatus === 'saved')).toBe(false);
    // The newer working copy (the mid-flight edit's draft) is kept, not cleared.
    expect((await drafts.load('invoices/monthly'))?.text).toContain('Legal');
  });

  it('keeps a mounted rename locally on a save conflict', async () => {
    const drafts = new DraftStore(memoryStorage());
    const save = vi.fn(async () => ({ ok: false as const, kind: 'conflict' as const }));
    const target = { load: vi.fn(async () => null), save };
    const reports = renderReporting({
      services: services({ drafts }),
      docKey: 'invoices/monthly',
      documentName: 'Monthly',
      saveTarget: target,
      initialRev: 'r1',
    });
    act(() => reportedRename(reports)('Renamed'));
    expect(await screen.findByText(/Someone else has saved/)).toBeTruthy();
    // The rename is kept locally (still reported) and the crash draft survives.
    expect(reports.at(-1)?.name).toBe('Renamed');
    await waitFor(async () =>
      expect((await drafts.load('invoices/monthly'))?.name).toBe('Renamed'),
    );
  });
});
