import {
  type FontSource,
  HOOK_EVENTS,
  type HookNotificationMap,
  type HookProviderMap,
  HookRegistry,
  type PresetContribution,
  type PresetFiles,
  type ProjectDetail,
  type SaveOutcome,
  type TemplateDoc,
} from '@shojiku/designer';
import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../assets/manifest';
import {
  type AppDefaults,
  type AppHookRegistry,
  appPresetContributions,
  collectBoot,
  registerRemoteProviders,
} from './hookup';

const FILES: PresetFiles = { source: 's', params: '{}', assets: [], variants: [] };

function freshRegistry(): AppHookRegistry {
  return new HookRegistry<HookNotificationMap, HookProviderMap>(HOOK_EVENTS, {
    warn: vi.fn(),
    onError: vi.fn(),
  });
}

const appSource: FontSource = {
  manifest: async () => 'app-manifest',
  face: async () => new Uint8Array([1]),
};

const catalog: Catalog = {
  presets: [
    {
      id: 'receipt-ja',
      locales: ['ja'],
      engineLocale: 'ja-JP',
      name: { ja: '領収書' },
      thumbnail: 'preview-1.png',
    },
    {
      id: 'bad-thumb',
      locales: ['en'],
      engineLocale: 'en-US',
      name: { en: 'Bad' },
      thumbnail: '../evil.png',
    },
  ],
};

function appDefaults(): AppDefaults {
  return {
    presets: appPresetContributions(catalog, 'https://x/data/', async () => FILES),
    fontSource: appSource,
  };
}

describe('appPresetContributions', () => {
  it('maps catalog entries to contributions with guarded thumbnail URLs', async () => {
    const loadPreset = vi.fn(async (_id: string) => FILES);
    const contributions = appPresetContributions(catalog, 'https://x/data/', loadPreset);
    expect(contributions.map((preset) => preset.id)).toEqual(['receipt-ja', 'bad-thumb']);
    expect(contributions[0].thumbnailUrl).toBe('https://x/data/presets/receipt-ja/preview-1.png');
    // The unsafe thumbnail name fails the charset guard: no URL, card sans image.
    expect(contributions[1].thumbnailUrl).toBeUndefined();
    await expect(contributions[0].load()).resolves.toBe(FILES);
    expect(loadPreset).toHaveBeenCalledWith('receipt-ja');
  });
});

describe('collectBoot', () => {
  it('seeds the app defaults FIRST; integrator contributions follow', async () => {
    const registry = freshRegistry();
    // Import-time package registrations run BEFORE main()'s composition —
    // hooked here before collectBoot to mirror that order.
    const contributed: PresetContribution = {
      id: 'acme-invoice',
      locales: ['ja'],
      engineLocale: 'ja-JP',
      name: { ja: 'ACME 請求書' },
      load: async () => FILES,
    };
    const packageSource: FontSource = {
      manifest: async () => 'pkg-manifest',
      face: async () => new Uint8Array([2]),
    };
    registry.hook('init:presets', (ctx) => {
      ctx.addPreset(contributed);
    });
    registry.hook('init:fonts', (ctx) => {
      ctx.addSource(packageSource);
    });
    const boot = await collectBoot(registry, appDefaults());
    expect(boot.presets.map((preset) => preset.id)).toEqual([
      'receipt-ja',
      'bad-thumb',
      'acme-invoice',
    ]);
    expect(boot.fontSources).toEqual([appSource, packageSource]);
    expect(boot.remote).toBeUndefined();
    // No suggest:ops provider registered → the copilot wire stays absent.
    expect(boot.copilot).toBeUndefined();
  });

  it('collects a registered suggest:ops provider as the copilot wire, pass-through', async () => {
    const registry = freshRegistry();
    const provider = vi.fn(async () => ({ ops: [{ op: 'removeKey', keys: ['version'] }] }));
    registry.hook('suggest:ops', provider);
    const boot = await collectBoot(registry, appDefaults());
    expect(boot.copilot).toBeDefined();
    const reply = await boot.copilot?.({
      prompt: 'p',
      instructions: 'i',
      template: 't',
    });
    expect(reply).toEqual({ ops: [{ op: 'removeKey', keys: ['version'] }] });
    expect(provider).toHaveBeenCalledOnce();
  });

  it('a shadowing contribution loses to the seeded bundled entry even though its hook ran first', async () => {
    const registry = freshRegistry();
    registry.hook('init:presets', (ctx) => {
      ctx.addPreset({
        id: 'receipt-ja',
        locales: ['ja'],
        engineLocale: 'ja-JP',
        name: { ja: '偽物' },
        load: async () => FILES,
      });
    });
    const onError = vi.fn();
    const boot = await collectBoot(registry, appDefaults(), { onError });
    const kept = boot.presets.find((preset) => preset.id === 'receipt-ja');
    expect(kept?.name).toEqual({ ja: '領収書' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('duplicate id');
  });

  it('composes purely from hooks when a host passes no defaults', async () => {
    const registry = freshRegistry();
    const boot = await collectBoot(registry);
    expect(boot.presets).toEqual([]);
    expect(boot.fontSources).toEqual([]);
  });

  it('reports a dropped contribution via console.error by default', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const registry = freshRegistry();
    registry.hook('init:presets', (ctx) => {
      ctx.addPreset({
        id: '../evil',
        locales: ['en'],
        engineLocale: 'en-US',
        name: {},
        load: async () => FILES,
      });
    });
    await collectBoot(registry);
    expect(spy).toHaveBeenCalledWith('init:presets', expect.any(Error));
    spy.mockRestore();
  });
});

describe('registerRemoteProviders + the derived remote seam', () => {
  it('derives the remote seam from registered providers, routing every op', async () => {
    const registry = freshRegistry();
    const doc: TemplateDoc = { text: 't', fonts: [] };
    const detail: ProjectDetail = { id: 'p1', name: 'P1', templates: [] };
    const store = {
      load: vi.fn(async (_key: string) => doc),
      save: vi.fn(async (_key: string, _doc: TemplateDoc): Promise<SaveOutcome> => ({ ok: true })),
    };
    const projects = {
      listProjects: vi.fn(async () => [{ id: 'p1', name: 'P1' }]),
      loadProject: vi.fn(async (_id: string) => detail),
    };
    const definitions = {
      saveDefinitions: vi.fn(async (): Promise<SaveOutcome> => ({ ok: true })),
    };
    registerRemoteProviders(registry, { store, projects, definitions });
    const boot = await collectBoot(registry, appDefaults());
    const remote = boot.remote;
    expect(remote).toBeDefined();
    await expect(remote?.store.load('p1/t1')).resolves.toBe(doc);
    await expect(remote?.store.save('p1/t1', doc)).resolves.toEqual({ ok: true });
    await expect(remote?.projects.listProjects()).resolves.toEqual([{ id: 'p1', name: 'P1' }]);
    await expect(remote?.projects.loadProject('p1')).resolves.toBe(detail);
    await expect(remote?.definitions?.saveDefinitions('p1', { definitions: 'd' })).resolves.toEqual(
      { ok: true },
    );
    expect(store.load).toHaveBeenCalledWith('p1/t1');
    expect(store.save).toHaveBeenCalledWith('p1/t1', doc);
    expect(projects.loadProject).toHaveBeenCalledWith('p1');
    expect(definitions.saveDefinitions).toHaveBeenCalledWith('p1', { definitions: 'd' });
  });

  it('a remote without the definitions store leaves the definitions wire unarmed', async () => {
    const registry = freshRegistry();
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(async (): Promise<SaveOutcome> => ({ ok: true })),
    };
    const projects = {
      listProjects: vi.fn(async () => []),
      loadProject: vi.fn(
        async (): Promise<ProjectDetail> => ({ id: 'p', name: 'P', templates: [] }),
      ),
    };
    registerRemoteProviders(registry, { store, projects });
    const boot = await collectBoot(registry, appDefaults());
    expect(boot.remote).toBeDefined();
    expect(boot.remote?.definitions).toBeUndefined();
  });

  it('a rejecting provider propagates through the derived seam (fail-closed, not swallowed)', async () => {
    const registry = freshRegistry();
    const store = {
      load: vi.fn(async () => {
        throw new Error('host offline');
      }),
      save: vi.fn(async (): Promise<SaveOutcome> => ({ ok: false, kind: 'error' })),
    };
    const projects = {
      listProjects: vi.fn(async () => []),
      loadProject: vi.fn(
        async (): Promise<ProjectDetail> => ({ id: 'p', name: 'P', templates: [] }),
      ),
    };
    registerRemoteProviders(registry, { store, projects });
    const boot = await collectBoot(registry, appDefaults());
    // The screens' existing error states (retry views, localized banners)
    // receive the SAME rejection they would from a direct store.
    await expect(boot.remote?.store.load('p/t')).rejects.toThrowError('host offline');
    await expect(boot.remote?.store.save('p/t', { text: '', fonts: [] })).resolves.toEqual({
      ok: false,
      kind: 'error',
    });
  });

  it('an incomplete provider set derives NO remote (each missing op checked)', async () => {
    const providers: readonly ['load:template', 'save:template', 'list:projects'][number][] = [
      'load:template',
      'save:template',
      'list:projects',
    ];
    for (let count = 0; count <= providers.length; count += 1) {
      const registry = freshRegistry();
      for (const event of providers.slice(0, count)) {
        registry.hook(event, (async () => null) as never);
      }
      const boot = await collectBoot(registry);
      expect(boot.remote, `providers registered: ${count}`).toBeUndefined();
    }
  });
});
