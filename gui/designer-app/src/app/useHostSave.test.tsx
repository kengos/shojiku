// EditorScreen-level tests for useHostSave.ts — the mounted remote save:
// fail-closed TemplateStore.save with the tracked rev, 409 keeps the working
// copy, definitions PUT after the template save, honest "Saved.".
import type { TemplateStore } from '@shojiku/designer';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
import { fakeController, LATO_FONT, prepWithFonts } from '../testkit/fonts';
import { changePageSize, pickMenu, renderEditor } from '../testkit/harness';
import { EditorScreen } from './EditorScreen';

describe('EditorScreen remote save', () => {
  function renderWithTarget(save: TemplateStore['save'], drafts: DraftStore) {
    const target = { load: vi.fn(async () => null), save };
    renderEditor(
      <EditorScreen
        services={services({ drafts })}
        docKey="invoices/monthly"
        engineLocale="en-US"
        files={FILES}
        prep={makePrep(clean, resolvingFonts(), [])}
        initialText={TEMPLATE}
        initialRev="r1"
        saveTarget={target}
        onBack={vi.fn()}
      />,
    );
    return target;
  }

  it('saves to the provider with the revision token and clears the local draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', { text: 'stale', fonts: [] });
    const save = vi.fn(async () => ({ ok: true as const, rev: 'r2' }));
    renderWithTarget(save, drafts);
    pickMenu('File', 'Save');
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(save).toHaveBeenCalledWith('invoices/monthly', {
      text: TEMPLATE,
      fonts: [],
      rev: 'r1',
    });
    // The host's copy is current; the working copy would only re-prompt.
    expect(await drafts.load('invoices/monthly')).toBeNull();
  });

  it('carries the returned revision into the next save', async () => {
    const save = vi.fn(async (_key: string, _doc: unknown) => ({ ok: true as const, rev: 'r2' }));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    pickMenu('File', 'Save');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toEqual({ text: TEMPLATE, fonts: [], rev: 'r2' });
  });

  it('keeps the previous revision when the host returns none', async () => {
    const save = vi.fn(async (_key: string, _doc: unknown) => ({ ok: true as const }));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    pickMenu('File', 'Save');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toEqual({ text: TEMPLATE, fonts: [], rev: 'r1' });
  });

  it('includes the picked fonts in the save payload', async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    const target = { load: vi.fn(async () => null), save };
    renderEditor(
      <EditorScreen
        services={services()}
        docKey="invoices/monthly"
        engineLocale="en-US"
        files={FILES}
        prep={prepWithFonts(fakeController())}
        initialText={TEMPLATE}
        initialFonts={[LATO_FONT]}
        saveTarget={target}
        onBack={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'File' })).toBeTruthy());
    pickMenu('File', 'Save');
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(save).toHaveBeenCalledWith('invoices/monthly', {
      text: TEMPLATE,
      fonts: [LATO_FONT],
      rev: undefined,
    });
  });

  it('shows the saving indicator while the provider is in flight', async () => {
    const save = vi.fn(() => new Promise<never>(() => {}));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    pickMenu('File', 'Save');
    expect(await screen.findByText('Saving…')).toBeTruthy();
  });

  it('shows the conflict banner on a concurrent edit and keeps the draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', { text: 'working copy', fonts: [] });
    const save = vi.fn(async () => ({ ok: false as const, kind: 'conflict' as const }));
    renderWithTarget(save, drafts);
    pickMenu('File', 'Save');
    expect(await screen.findByText(/Someone else has saved/)).toBeTruthy();
    expect(await drafts.load('invoices/monthly')).not.toBeNull();
  });

  it('shows the error banner on a failed or throwing save', async () => {
    const save = vi.fn(async () => ({ ok: false as const, kind: 'error' as const }));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    pickMenu('File', 'Save');
    expect(await screen.findByText(/Could not save/)).toBeTruthy();
  });

  it('recovers to the error banner when the provider rejects', async () => {
    const save = vi.fn(async () => Promise.reject(new Error('offline')));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    pickMenu('File', 'Save');
    expect(await screen.findByText(/Could not save/)).toBeTruthy();
  });

  it('keeps the newer working copy when an edit lands while a save is in flight', async () => {
    const drafts = new DraftStore(memoryStorage());
    let resolveSave: (o: { ok: true; rev: string }) => void = () => {};
    const save = vi.fn(
      (_key: string, _doc: unknown) =>
        new Promise<{ ok: true; rev: string }>((r) => {
          resolveSave = r;
        }),
    );
    renderWithTarget(save, drafts);
    pickMenu('File', 'Save');
    await screen.findByText('Saving…');
    // An edit during the in-flight save makes the local copy newer than the
    // saved text — the outcome must not discard it, nor claim "Saved."
    changePageSize('Legal');
    await waitFor(async () =>
      expect((await drafts.load('invoices/monthly'))?.text).toContain('Legal'),
    );
    await act(async () => {
      resolveSave({ ok: true, rev: 'r2' });
    });
    expect(screen.queryByText('Saved.')).toBeNull();
    expect((await drafts.load('invoices/monthly'))?.text).toContain('Legal');
    // The returned revision is still adopted for the next save.
    pickMenu('File', 'Save');
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect((save.mock.calls[1] as unknown[])[1]).toMatchObject({ rev: 'r2' });
  });

  it('clears the save state on the next edit', async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    renderWithTarget(save, new DraftStore(memoryStorage()));
    // An edit while nothing was saved yet leaves the (idle) state alone.
    changePageSize('A5');
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    changePageSize('Legal');
    await waitFor(() => expect(screen.queryByText('Saved.')).toBeNull());
  });
});

// --- picked-font flows -----------------------------------------------------
