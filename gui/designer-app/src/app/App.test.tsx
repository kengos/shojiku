import type { EngineTransport, PresetContribution, PresetFiles } from '@shojiku/designer';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FontSource } from '../engine/fontSource';
import { LazyFontLoader } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';
import { BlockStore } from '../persistence/blocks';
import { DraftStore } from '../persistence/drafts';
import { SnapshotStore } from '../persistence/snapshots';
import { fixedModuleLoad, READY_MODULE } from '../testkit/fixtures';
import { App } from './App';
import type { AppServices, EnginePrep } from './services';

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

const receiptUs = {
  id: 'receipt-us',
  locales: ['en'],
  engineLocale: 'en-US',
  name: { en: 'Receipt' },
} as const;
const genkoyoshi = {
  id: 'genkoyoshi-ja',
  locales: ['ja'],
  engineLocale: 'ja-JP',
  name: { ja: '原稿用紙', en: 'Genko' },
} as const;

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

type TestServices = AppServices & { loadFiles: ReturnType<typeof makeLoadFiles> };

function makeLoadFiles() {
  return vi.fn(
    async (_id: string): Promise<PresetFiles> => ({
      source: TEMPLATE,
      params: '{}',
      definitions: undefined,
      assets: [],
      variants: [],
    }),
  );
}

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

function makeServices(overrides: Partial<AppServices> = {}): TestServices {
  const prep: EnginePrep = makePrep();
  const loadFiles = makeLoadFiles();
  const presets: readonly PresetContribution[] = [receiptUs, genkoyoshi].map((preset) => ({
    ...preset,
    load: () => loadFiles(preset.id),
  }));
  return {
    loadFiles,
    moduleLoad: READY_MODULE,
    presets,
    // Builtin-only: `null` is "no pack to send", which is what a real source
    // answers for a builtin, so the Designer's locale panel still works.
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
    prepareEngine: vi.fn(async () => prep),
    exportFile: vi.fn(),
    openFile: vi.fn(async () => null),
    ...overrides,
  };
}

/** A fake matchMedia source whose OS scheme can be flipped in the test. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: (_type: 'change', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: () => void) => {
      listeners.delete(listener);
    },
    flip(next: boolean) {
      this.matches = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe('App navigation', () => {
  it('shows only the active locale’s presets', () => {
    render(<App services={makeServices()} />);
    expect(screen.getByText('Choose a template')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Receipt/ })).toBeTruthy();
    expect(screen.queryByText('原稿用紙')).toBeNull();
  });

  it('opens a preset into the editor and returns to the catalog', async () => {
    const services = makeServices();
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
    expect(services.prepareEngine).toHaveBeenCalledWith('en-US', expect.any(Function));
    expect(services.loadFiles).toHaveBeenCalledWith('receipt-us');
    // An assetless preset still routes through injection, harmlessly empty.
    const prep = await (services.prepareEngine as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(prep.injectAssets).toHaveBeenCalledWith([]);

    // "Back to templates" moved into the Designer's File menu.
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back to templates' }));
    expect(screen.getByText('Choose a template')).toBeTruthy();
  });

  it('shows the staged loading view with the font progress while a preset opens', async () => {
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
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));

    // Titled by the preset being opened, with the three named stages — not the
    // old bare "Loading fonts…" line.
    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeTruthy();
    act(() => {
      report?.({ loaded: 9_300_000, total: 18_600_000 });
    });
    expect(screen.getByText('9.3 MB / 18.6 MB')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Loading fonts' }).getAttribute('aria-valuenow'),
    ).toBe('50');

    act(() => {
      release?.();
    });
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
  });

  // The catalog-first payoff: the catalog is usable while the engine module is
  // still arriving, the shell reports that transfer, and a preset opened during
  // it waits on the ENGINE stage rather than claiming to load fonts.
  it('reports the module transfer in the shell and as the first open stage', async () => {
    const services = makeServices({
      moduleLoad: fixedModuleLoad({
        kind: 'loading',
        bytes: { loaded: 834_121, total: 1_668_242 },
      }),
      prepareEngine: vi.fn(() => new Promise<never>(() => undefined)),
    });
    render(<App services={services} />);

    // The catalog is up and operable, with the transfer reported around it.
    expect(screen.getByText('Choose a template')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Preparing engine 50%');
    expect(
      screen.getByRole('progressbar', { name: 'Preparing engine' }).getAttribute('aria-valuenow'),
    ).toBe('50');

    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeTruthy();
    // The engine stage owns the wait and carries the MODULE's bytes.
    expect(screen.getByText('834 KB / 1.7 MB')).toBeTruthy();
    expect(screen.getAllByRole('progressbar', { name: 'Preparing engine' })).toHaveLength(2);
  });

  it('states the remedy when the engine module could not be loaded', async () => {
    const services = makeServices({
      moduleLoad: fixedModuleLoad({ kind: 'failed' }),
      prepareEngine: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    render(<App services={services} />);
    expect(screen.getByRole('status').textContent).toBe('Engine unavailable');
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(
      await screen.findByText(
        'This template could not be prepared. Go back and try again, or reload the page.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  // The open flow refusing (a font pack that will not fetch, an engine that will
  // not boot) used to leave an unhandled rejection and a panel that span
  // forever. It reports on the stage that was working instead.
  it('marks the working stage failed when preparing the engine refuses', async () => {
    const services = makeServices({
      prepareEngine: vi.fn(() => Promise.reject(new Error('pack 404'))),
    });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(
      await screen.findByText(
        'This template could not be prepared. Go back and try again, or reload the page.',
      ),
    ).toBeTruthy();
    // The module DID arrive, so only the fonts stage carries the warning.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('svg') !== null)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('backs out of a failed open to the catalog', async () => {
    const services = makeServices({
      prepareEngine: vi.fn(() => Promise.reject(new Error('pack 404'))),
    });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(
      await screen.findByText(
        'This template could not be prepared. Go back and try again, or reload the page.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    expect(screen.getByText('Choose a template')).toBeTruthy();
  });

  // The escape hatch is not only for failures: a load that hangs (or that the
  // user regrets) can be backed out of — and the open settling AFTERWARDS, in
  // either direction, must not yank the user back in.
  it('cancels a live open; late progress and a late resolve stay no-ops', async () => {
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
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    expect(screen.getByText('Choose a template')).toBeTruthy();
    // The abandoned transfer keeps reporting — it must not resurrect the panel.
    act(() => {
      report?.({ loaded: 1_000, total: 2_000 });
    });
    expect(screen.getByText('Choose a template')).toBeTruthy();
    await act(async () => {
      release?.();
    });
    // Still the catalog — no editor, no loading panel.
    expect(screen.getByText('Choose a template')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull();
  });

  it('cancels a live open; a late reject raises no failed banner', async () => {
    let refuse: ((reason: Error) => void) | undefined;
    const services = makeServices({
      prepareEngine: vi.fn(async () => {
        await new Promise<never>((_resolve, reject) => {
          refuse = reject;
        });
        return makePrep();
      }),
    });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(await screen.findByRole('heading', { name: 'Receipt' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    await act(async () => {
      refuse?.(new Error('late pack 404'));
    });
    expect(screen.getByText('Choose a template')).toBeTruthy();
    expect(screen.queryByText(/could not be prepared/)).toBeNull();
  });

  // The LAST await in the open flow: the engine is prepared and the assets are
  // in, and only the draft read is outstanding. Cancelling there must still
  // land in the catalog rather than the editor.
  it('cancels between engine prep and the draft read', async () => {
    let release: ((draft: null) => void) | undefined;
    const services = makeServices();
    vi.spyOn(services.drafts, 'load').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    // Wait until the prep has settled and the draft read is the only thing left.
    await waitFor(() => {
      expect(services.drafts.load).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back to templates' }));
    await act(async () => {
      release?.(null);
    });
    expect(screen.getByText('Choose a template')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'File' })).toBeNull();
  });

  it('reports a refusal from asset injection like any other open failure', async () => {
    const prep = makePrep();
    (prep.injectAssets as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('hostile asset');
    });
    const services = makeServices({ prepareEngine: vi.fn(async () => prep) });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(
      await screen.findByText(
        'This template could not be prepared. Go back and try again, or reload the page.',
      ),
    ).toBeTruthy();
  });

  it('injects the loaded preset assets exactly once, before the editor mounts', async () => {
    const services = makeServices();
    const assets = [{ name: 'logo.svg', bytes: new Uint8Array([60]) }];
    services.loadFiles.mockResolvedValue({
      source: TEMPLATE,
      params: '{}',
      definitions: undefined,
      assets,
      variants: [],
    });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    await screen.findByRole('button', { name: 'File' });
    const prep = await (services.prepareEngine as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(prep.injectAssets).toHaveBeenCalledTimes(1);
    expect(prep.injectAssets).toHaveBeenCalledWith(assets);
  });

  it('injects assets before the draft prompt too (the restore path reuses the engine)', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('receipt-us', { text: TEMPLATE, fonts: [] });
    const services = makeServices({ drafts });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    await screen.findByText('Restore your draft?');
    const prep = await (services.prepareEngine as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(prep.injectAssets).toHaveBeenCalledTimes(1);
  });

  it('renames the open document through the header and persists it to the draft', async () => {
    const drafts = new DraftStore(memoryStorage());
    render(<App services={makeServices({ drafts })} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    await screen.findByRole('button', { name: 'File' });
    // The header title is a rename control once a document is open.
    // The title button's accessible name IS the preset display name.
    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }));
    const input = screen.getByRole('textbox', { name: 'Rename document' });
    fireEvent.change(input, { target: { value: 'April receipt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The header shows the new name and the draft store received it.
    expect(screen.getByRole('button', { name: 'April receipt' }).textContent).toBe('April receipt');
    await waitFor(async () =>
      expect((await drafts.load('receipt-us'))?.name).toBe('April receipt'),
    );
  });

  it('restores a renamed draft name into the header title', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('receipt-us', { text: TEMPLATE, fonts: [], name: 'Saved name' });
    render(<App services={makeServices({ drafts })} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByRole('button', { name: 'File' });
    expect(screen.getByRole('button', { name: 'Saved name' }).textContent).toBe('Saved name');
  });

  it('persists a locale change and re-derives the catalog', () => {
    const services = makeServices();
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /^Language:/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: '日本語' }));
    expect(services.persistLocale).toHaveBeenCalledWith('ja-JP');
    expect(screen.getByText('原稿用紙')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Receipt/ })).toBeNull();
  });
});

describe('App theme', () => {
  // Tokens land on the DOCUMENT root (portaled overlays resolve them there).
  function rootVar(name: string): string {
    return document.documentElement.style.getPropertyValue(name);
  }

  it('applies the resolved token set on the document root (auto without media = light)', () => {
    render(<App services={makeServices()} />);
    expect(rootVar('--sj-bg')).toBe('#f7f5f1');
  });

  it('removes the token set from the document root on unmount', () => {
    const { unmount } = render(<App services={makeServices()} />);
    expect(document.documentElement.style.getPropertyValue('--sj-bg')).toBe('#f7f5f1');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--sj-bg')).toBe('');
  });

  it('persists a theme change and re-resolves the scheme', () => {
    const services = makeServices();
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dark' }));
    expect(services.persistThemePref).toHaveBeenCalledWith('dark');
    expect(rootVar('--sj-bg')).toBe('#201e1b');
  });

  it("follows the OS scheme under 'auto' and stops following when explicit", () => {
    const media = fakeMedia(true);
    const services = makeServices({ colorSchemeMedia: media });
    render(<App services={services} />);
    expect(rootVar('--sj-bg')).toBe('#201e1b');

    act(() => media.flip(false));
    expect(rootVar('--sj-bg')).toBe('#f7f5f1');

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Light' }));
    act(() => media.flip(true));
    expect(rootVar('--sj-bg')).toBe('#f7f5f1');
  });

  it('unsubscribes cleanly on unmount (no media source)', () => {
    const { unmount } = render(<App services={makeServices()} />);
    expect(() => unmount()).not.toThrow();
  });

  it('threads the resolved scheme into the opened editor', async () => {
    const services = makeServices({ initialThemePref: 'dark' });
    const { container } = render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    await screen.findByRole('button', { name: 'File' });
    const designer = container.querySelector('.sj-designer') as HTMLElement;
    expect(designer.style.getPropertyValue('--sj-bg')).toBe('#201e1b');
  });
});

describe('App header', () => {
  it("shows the opened preset's name in the header and drops it on back", async () => {
    render(<App services={makeServices()} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    await screen.findByRole('button', { name: 'File' });
    // The header (gdoc-style) carries the document title once the editor opens.
    expect(within(screen.getByRole('banner')).getByText('Receipt')).toBeTruthy();
    // Returning to the catalog drops the title from the header (the catalog card
    // still names the preset, so the assertion is scoped to the header).
    fireEvent.click(screen.getByRole('button', { name: 'File' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back to templates' }));
    await screen.findByRole('button', { name: /Receipt/ });
    expect(within(screen.getByRole('banner')).queryByText('Receipt')).toBeNull();
  });
});

describe('App mounted mode', () => {
  it('opens into the project list when a remote provider is injected', async () => {
    const impl = {
      listProjects: vi.fn(async () => [{ id: 'invoices', name: 'Invoices' }]),
      loadProject: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
    };
    const services = makeServices({ remote: { projects: impl, store: impl } });
    render(<App services={services} />);
    expect(await screen.findByText('Projects')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Invoices' })).toBeTruthy();
    // The preset catalog never renders in mounted mode.
    expect(screen.queryByText('Choose a template')).toBeNull();
  });
});

describe('App draft prompt', () => {
  it('offers to restore a saved draft, then enters the editor', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('receipt-us', { text: TEMPLATE, fonts: [] });
    const services = makeServices({ drafts });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    expect(await screen.findByText('Restore your draft?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
  });

  it('discards a draft and enters the editor from the preset source', async () => {
    const drafts = new DraftStore(memoryStorage());
    await drafts.save('receipt-us', { text: TEMPLATE, fonts: [] });
    const services = makeServices({ drafts });
    render(<App services={services} />);
    fireEvent.click(screen.getByRole('button', { name: /Receipt/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByRole('button', { name: 'File' })).toBeTruthy();
    expect(await drafts.load('receipt-us')).toBeNull();
  });
});
