import {
  type EngineTransport,
  I18nProvider,
  type ProjectDetail,
  type ProjectSource,
  type SaveOutcome,
  type TemplateDoc,
  type TemplateStore,
  useI18n,
} from '@shojiku/designer';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FontSource } from '../engine/fontSource';
import { LazyFontLoader } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';
import { APP_CATALOG } from '../i18n/appCatalog';
import { BlockStore } from '../persistence/blocks';
import { DraftStore } from '../persistence/drafts';
import { SnapshotStore } from '../persistence/snapshots';
import { READY_MODULE } from '../testkit/fixtures';
import type { HeaderDoc } from './AppHeader';
import { MountedApp } from './MountedApp';
import type { AppServices, EnginePrep, RemoteServices } from './services';

const TEMPLATE = [
  'version: "0.1.0"',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        box: { w: 100, h: 30 }',
  '        text: "hi"',
  '',
].join('\n');

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const fakeEngine = () =>
  ({
    validate: () => '{"items":[]}',
    renderRaw: () => ({}),
    setLocale: () => {},
    fontPacksNeeded: () => '[]',
    fontFilesNeeded: () => '[]',
    fontFacesNeeded: () => '[]',
    addFontPack: () => {},
    addFontFile: () => {},
    addAssetFile: () => {},
    loadFontsSubset: () => '[]',
  }) as WasmFullEngine;

const fakeFonts = (): FontSource => ({
  manifest: async () => '',
  face: async () => new Uint8Array(),
});

const baseTransport: EngineTransport = {
  validate: async () => ({ items: [] }),
  renderRaw: async () => ({ ok: true, pages: [], inspect: null, diagnostics: { items: [] } }),
};

function makePrep(): EnginePrep {
  return {
    transport: baseTransport,
    loader: new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    }),
    fonts: null,
    injectAssets: vi.fn(),
  };
}

const invoices: ProjectDetail = {
  id: 'invoices',
  name: 'Invoices',
  definitions: 'version: "0.1.0"\n',
  templates: [
    { id: 'monthly', name: 'Monthly invoice', engineLocale: 'ja-JP' },
    { id: 'annual', name: 'Annual invoice' },
  ],
};

function fakeRemote(
  overrides: Partial<ProjectSource & TemplateStore> = {},
): RemoteServices & { store: TemplateStore & { save: ReturnType<typeof vi.fn> } } {
  const doc: TemplateDoc = { text: TEMPLATE, fonts: [], rev: 'r1', params: '{}' };
  const impl = {
    listProjects: vi.fn(async () => [{ id: 'invoices', name: 'Invoices' }]),
    loadProject: vi.fn(async () => invoices),
    load: vi.fn(async () => doc),
    save: vi.fn(async (): Promise<SaveOutcome> => ({ ok: true })),
    ...overrides,
  };
  return { projects: impl, store: impl } as unknown as RemoteServices & {
    store: TemplateStore & { save: ReturnType<typeof vi.fn> };
  };
}

function makeServices(overrides: Partial<AppServices> = {}): AppServices {
  return {
    moduleLoad: READY_MODULE,
    presets: [],
    // Builtin-only: `null` is what a real source answers for a locale the
    // engine already has, so the Designer's locale panel still works.
    localePacks: { overlayFor: async () => null },
    initialLocale: 'en-US',
    persistLocale: vi.fn(),
    initialThemePref: 'auto',
    gridStep: () => 1,
    persistGridStep: vi.fn(),
    templateMaxBytes: () => 2 * 1024 * 1024,
    persistTemplateMaxBytes: vi.fn(),
    sidebarWidth: () => 240,
    tutorialStore: { load: () => null, save: () => {} },
    persistSidebarWidth: vi.fn(),
    persistThemePref: vi.fn(),
    colorSchemeMedia: null,
    drafts: new DraftStore(memoryStorage()),
    blocks: new BlockStore(memoryStorage()),
    snapshots: new SnapshotStore(memoryStorage()),
    now: () => 1_000_000,
    prepareEngine: vi.fn(async () => makePrep()),
    exportFile: vi.fn(),
    openFile: vi.fn(async () => null),
    ...overrides,
  };
}

/** Surfaces the header context MountedApp reports (name + save status) the way
 * the app shell's header does — save state and the open document's name live in
 * the app header now, not the Designer's own title bar. */
function HeaderProbe({ doc }: { doc: HeaderDoc | null }) {
  const { t } = useI18n();
  return (
    <>
      {doc?.name !== undefined ? <span data-testid="header-name">{doc.name}</span> : null}
      {doc?.saveStatus !== undefined ? (
        <output>{t(doc.saveStatus === 'saving' ? 'app.saving' : 'app.saved')}</output>
      ) : null}
    </>
  );
}

function MountedWithHeader({
  services,
  remote,
}: {
  services: AppServices;
  remote: RemoteServices;
}) {
  const [doc, setDoc] = useState<HeaderDoc | null>(null);
  return (
    <>
      <MountedApp
        services={services}
        remote={remote}
        scheme="light"
        engineLoad={{ kind: 'ready' }}
        onHeaderDocChange={setDoc}
      />
      <HeaderProbe doc={doc} />
    </>
  );
}

function renderMounted(services: AppServices, remote: RemoteServices) {
  return render(
    <I18nProvider locale="en-US" catalog={APP_CATALOG}>
      <MountedWithHeader services={services} remote={remote} />
    </I18nProvider>,
  );
}

/** Pick a Designer menubar item: Save (and the file actions) moved from
 * standalone buttons into the File menu. */
/** The menubar entry's accessible name, tolerating the HIG ellipsis: a label
 * that opens a view ends in `…` (gui/STYLE.md § Actions), while the review
 * pane's own confirm button — the same word — does not. Matching
 * `^<item>…?$` lets every call site keep naming the bare action. */
function menuItemName(item: string): RegExp {
  return new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}…?$`);
}

function pickMenu(menu: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: menu }));
  fireEvent.click(screen.getByRole('menuitem', { name: menuItemName(item) }));
  // Save/Export open a review pane first; its confirm button is the SAME word
  // without the ellipsis, so confirm it to reach the actual save/export.
  if (item === 'Save' || item === 'Export') {
    fireEvent.click(screen.getByRole('button', { name: item }));
  }
}

describe('MountedApp navigation', () => {
  it('lists projects, opens one, and lists its templates', async () => {
    renderMounted(makeServices(), fakeRemote());
    expect(await screen.findByText('Projects')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Invoices' }));
    expect(await screen.findByText('Invoices')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annual invoice' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    expect(await screen.findByText('Projects')).toBeTruthy();
  });

  it('shows the empty states', async () => {
    const remote = fakeRemote({
      listProjects: vi.fn(async () => []),
    });
    renderMounted(makeServices(), remote);
    expect(await screen.findByText('No projects yet.')).toBeTruthy();
  });

  it('shows an empty project', async () => {
    const remote = fakeRemote({
      loadProject: vi.fn(async () => ({ id: 'invoices', name: 'Invoices', templates: [] })),
    });
    renderMounted(makeServices(), remote);
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    expect(await screen.findByText('This project has no templates yet.')).toBeTruthy();
  });

  it('recovers a failed project list through the retry button', async () => {
    const listProjects = vi
      .fn<() => Promise<{ id: string; name: string }[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ id: 'invoices', name: 'Invoices' }]);
    renderMounted(makeServices(), fakeRemote({ listProjects }));
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Invoices' })).toBeTruthy();
  });

  it('recovers a failed project load through the retry button', async () => {
    const loadProject = vi
      .fn<() => Promise<ProjectDetail>>()
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce(invoices);
    renderMounted(makeServices(), fakeRemote({ loadProject }));
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
  });
});

describe('MountedApp editor flow', () => {
  async function openMonthly(services: AppServices, remote: RemoteServices) {
    renderMounted(services, remote);
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly invoice' }));
  }

  it("opens a template into the editor with the entry's engine locale", async () => {
    const services = makeServices();
    await openMonthly(services, fakeRemote());
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
    expect(services.prepareEngine).toHaveBeenCalledWith('ja-JP', expect.any(Function));
  });

  it("reports the opened template's name to the app header", async () => {
    await openMonthly(makeServices(), fakeRemote());
    await screen.findByRole('button', { name: 'File' });
    expect((await screen.findByTestId('header-name')).textContent).toBe('Monthly invoice');
  });

  // A mounted document open goes through the SAME staged view as a standalone
  // preset open — the wait is the engine module and its font packs either way.
  it('shows the staged loading view with the font progress while a template opens', async () => {
    let report: ((bytes: { loaded: number; total?: number }) => void) | undefined;
    let release: (() => void) | undefined;
    const services = makeServices({
      prepareEngine: vi.fn(async (_locale: string, onProgress) => {
        report = onProgress;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return makePrep();
      }),
    });
    renderMounted(services, fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly invoice' }));

    // The panel is titled by the template being opened, not a bare "Loading…".
    expect(await screen.findByRole('heading', { name: 'Monthly invoice' })).toBeTruthy();
    act(() => {
      report?.({ loaded: 500_000, total: 2_000_000 });
    });
    expect(screen.getByText('500 KB / 2.0 MB')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Loading fonts' }).getAttribute('aria-valuenow'),
    ).toBe('25');

    act(() => {
      release?.();
    });
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
  });

  // The staged view's escape hatch: cancel returns to the already-loaded
  // template list without a refetch, and the open settling afterwards must
  // stay a no-op.
  it('cancels a live template open back to the list; late progress and resolve are inert', async () => {
    let report: ((bytes: { loaded: number; total?: number }) => void) | undefined;
    let release: (() => void) | undefined;
    const services = makeServices({
      prepareEngine: vi.fn(async (_locale: string, onProgress) => {
        report = onProgress;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return makePrep();
      }),
    });
    renderMounted(services, fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly invoice' }));
    expect(await screen.findByRole('heading', { name: 'Monthly invoice' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    expect(await screen.findByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
    // The abandoned transfer keeps reporting — it must not resurrect the panel.
    act(() => {
      report?.({ loaded: 1_000, total: 2_000 });
    });
    expect(screen.queryByRole('heading', { name: 'Monthly invoice' })).toBeNull();
    await act(async () => {
      release?.();
    });
    // Still the template list — the settled open opened nothing.
    expect(screen.getByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull();
  });

  it('cancels a live template open; a late reject shows no error view', async () => {
    let refuse: ((reason: Error) => void) | undefined;
    const services = makeServices({
      prepareEngine: vi.fn(async () => {
        await new Promise<never>((_resolve, reject) => {
          refuse = reject;
        });
        return makePrep();
      }),
    });
    renderMounted(services, fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly invoice' }));
    expect(await screen.findByRole('heading', { name: 'Monthly invoice' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    await act(async () => {
      refuse?.(new Error('late pack 404'));
    });
    expect(screen.getByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });

  // The LAST await in the open flow: the document and the engine are both in,
  // and only the draft read is outstanding. Cancelling there still returns to
  // the template list.
  it('cancels between the document load and the draft read', async () => {
    let release: ((draft: null) => void) | undefined;
    const services = makeServices();
    vi.spyOn(services.drafts, 'load').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    renderMounted(services, fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Monthly invoice' }));
    await waitFor(() => {
      expect(services.drafts.load).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    await act(async () => {
      release?.(null);
    });
    expect(screen.getByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull();
  });

  // A project/template LIST read waits on the host, not on the engine — it has
  // no stages to report and keeps the plain one-liner.
  it('keeps the plain one-liner for a remote list read', async () => {
    const remote = fakeRemote({
      listProjects: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderMounted(makeServices(), remote);
    expect(await screen.findByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('defaults the engine locale when the entry names none', async () => {
    const services = makeServices();
    renderMounted(services, fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Invoices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annual invoice' }));
    await screen.findByRole('button', { name: 'File' });
    expect(services.prepareEngine).toHaveBeenCalledWith('en-US', expect.any(Function));
  });

  it('returns from the editor to the template list', async () => {
    await openMonthly(makeServices(), fakeRemote());
    // "Back to templates" moved into the Designer's File menu.
    fireEvent.click(await screen.findByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back to templates' }));
    expect(await screen.findByRole('button', { name: 'Monthly invoice' })).toBeTruthy();
  });

  it('shows the data editor with sample read-only (host params are engineer-owned)', async () => {
    await openMonthly(makeServices(), fakeRemote());
    await screen.findByRole('button', { name: 'File' });
    // The サンプルデータ tab is retired: sample values are viewed in the data editor.
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit data fields…' }));
    // The read-only hint renders ONLY when the sample is read-only — the mounted
    // flow must thread it through EditorScreen to the Designer.
    expect(screen.getByText('Sample data is managed by the engineer.')).toBeTruthy();
  });

  it('saves through the provider from the embedded save button', async () => {
    const remote = fakeRemote();
    await openMonthly(makeServices(), remote);
    fireEvent.click(await screen.findByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save…' }));
    // Confirm the review pane to reach the provider save.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(remote.store.save).toHaveBeenCalledWith('invoices/monthly', {
      text: TEMPLATE,
      fonts: [],
      rev: 'r1',
    });
  });

  it('recovers an invalid document load through the retry button', async () => {
    const doc: TemplateDoc = { text: TEMPLATE, fonts: [] };
    const load = vi
      .fn<() => Promise<TemplateDoc | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(doc);
    const remote = fakeRemote({ load });
    await openMonthly(makeServices(), remote);
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    // The retried document (no params, no rev) opens with the defaults.
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
  });

  it('shows the failure state when the engine prep rejects, and retries', async () => {
    const prepareEngine = vi
      .fn<AppServices['prepareEngine']>()
      .mockRejectedValueOnce(new Error('wasm failed'))
      .mockImplementation(async () => makePrep());
    const services = makeServices({ prepareEngine });
    await openMonthly(services, fakeRemote());
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
  });

  it('offers to restore a local working copy and restores its text and revision', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', {
      text: TEMPLATE.replace('"hi"', '"draft"'),
      fonts: [],
      rev: 'r0',
    });
    const remote = fakeRemote();
    await openMonthly(makeServices({ drafts }), remote);
    expect(await screen.findByText('Restore your draft?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'File' });
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    // The restored working copy saves with the revision it was based on.
    expect(remote.store.save.mock.calls[0][1].rev).toBe('r0');
    expect(remote.store.save.mock.calls[0][1].text).toContain('"draft"');
  });

  it('falls back to the host revision when restoring a pre-revision draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', { text: 'old working copy', fonts: [] });
    const remote = fakeRemote();
    await openMonthly(makeServices({ drafts }), remote);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'File' });
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    expect(remote.store.save.mock.calls[0][1].rev).toBe('r1');
  });

  it('discards a working copy and edits the host document', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', { text: 'stale', fonts: [] });
    const remote = fakeRemote();
    await openMonthly(makeServices({ drafts }), remote);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByRole('button', { name: 'File' });
    expect(await drafts.load('invoices/monthly')).toBeNull();
    pickMenu('File', 'Save');
    await screen.findByText('Saved.');
    // A pre-revision draft discarded: the host document's token rides along.
    expect(remote.store.save.mock.calls[0][1].rev).toBe('r1');
  });

  it('re-fetches the project on back so a renamed entry shows fresh', async () => {
    const loadProject = vi.fn(async () => invoices);
    const remote = fakeRemote({ loadProject });
    await openMonthly(makeServices(), remote);
    await screen.findByRole('button', { name: 'File' });
    // Opening the project fetched it once; leaving the editor re-fetches so a
    // host-honored rename shows fresh in the template list.
    expect(loadProject).toHaveBeenCalledTimes(1);
    pickMenu('File', 'Back to templates');
    await screen.findByRole('button', { name: 'Monthly invoice' });
    expect(loadProject).toHaveBeenCalledTimes(2);
  });

  it('seeds the header name from a restored mounted draft rename', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('invoices/monthly', {
      text: TEMPLATE,
      fonts: [],
      rev: 'r0',
      name: 'PM の下書き名',
    });
    await openMonthly(makeServices({ drafts }), fakeRemote());
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'File' });
    // The restored rename is reported up to the header, not the host entry name.
    expect((await screen.findByTestId('header-name')).textContent).toBe('PM の下書き名');
  });
});
