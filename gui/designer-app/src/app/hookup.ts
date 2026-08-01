// The app's boot composition over the hook registry: the app's OWN
// contributions (assembled-catalog presets, the bundled font source) are
// SEEDED into the same guarded collectors the `init:*` events fill, BEFORE the
// events fire — first by construction, so integrator packages (whose
// import-time `ShojikuGui.hook(…)` registrations necessarily run before
// main()'s body) can extend the catalog and the font chain but never precede
// or shadow the bundled entries. The mounted host's stores register as the
// persistence provider events, and one collection pass derives the injected
// services. Pure over an injected registry instance — main.tsx passes the
// `ShojikuGui` singleton; tests pass their own.

import {
  type CopilotProvider,
  collectFontSources,
  collectPresets,
  type DefinitionsStore,
  type FontSource,
  type HookNotificationMap,
  type HookProviderMap,
  type HookRegistry,
  type PresetContribution,
  type PresetFiles,
  type ProjectSource,
  type TemplateStore,
} from '@shojiku/designer';
import type { Catalog, CatalogPreset } from '../assets/manifest';
import { thumbnailUrl } from '../assets/paths';
import type { RemoteServices } from './services';

/** The registry shape the app composes over (the shipped v1 event maps). */
export type AppHookRegistry = HookRegistry<HookNotificationMap, HookProviderMap>;

/** The host's own boot-seeded contributions: its catalog presets and its
 * bundled font source. Seeded ahead of the `init:*` events by `collectBoot`. */
export interface AppDefaults {
  readonly presets: readonly PresetContribution[];
  readonly fontSource: FontSource;
}

/** The mounted host's provider stores (config-discovered HTTP, or any other
 * implementation): registered as the persistence provider events. */
export interface RemoteStores {
  readonly store: TemplateStore;
  readonly projects: ProjectSource;
  readonly definitions?: DefinitionsStore;
}

/** The assembled catalog's presets as hook contributions: the same display
 * metadata, the thumbnail resolved through the asset-path charset guard (a bad
 * name yields a card without an image), and `load` bound to the app's preset
 * fetcher. */
export function appPresetContributions(
  catalog: Catalog,
  assetBase: string,
  loadPreset: (presetId: string) => Promise<PresetFiles>,
): readonly PresetContribution[] {
  return catalog.presets.map((preset: CatalogPreset) => ({
    id: preset.id,
    locales: preset.locales,
    engineLocale: preset.engineLocale,
    name: preset.name,
    thumbnailUrl: thumbnailUrl(assetBase, preset) ?? undefined,
    load: () => loadPreset(preset.id),
  }));
}

/** Register the mounted host's stores as the provider events. Fail-loud: a
 * second registration of an occupied provider slot throws (the registry's
 * single-slot rule), surfacing a conflicting composition at boot. */
export function registerRemoteProviders(registry: AppHookRegistry, remote: RemoteStores): void {
  registry.hook('load:template', (key) => remote.store.load(key));
  registry.hook('save:template', (key, doc) => remote.store.save(key, doc));
  registry.hook('list:projects', () => remote.projects.listProjects());
  registry.hook('load:project', (id) => remote.projects.loadProject(id));
  const definitions = remote.definitions;
  if (definitions !== undefined) {
    registry.hook('save:definitions', (projectId, doc) =>
      definitions.saveDefinitions(projectId, doc),
    );
  }
}

/** Everything the boot collection produced, in the shapes the services carry. */
export interface BootComposition {
  readonly presets: readonly PresetContribution[];
  /** Boot-scoped font sources: the seeded default first, then contributed
   * ones in registration order — `prepareEngine` chains these, then the
   * session's picked library. */
  readonly fontSources: readonly FontSource[];
  /** Present when the provider events resolve a full remote seam. */
  readonly remote?: RemoteServices;
  /** The AI-copilot transport, when an integrator registered the
   * `suggest:ops` provider — threaded to the Designer's copilot prop
   * (absent → the feature stays hidden). */
  readonly copilot?: CopilotProvider;
}

/** Seed the host's defaults, fire the `init:*` events, close their contexts,
 * and derive the services' inputs. Invalid preset contributions are dropped +
 * reported via `onError` (default `console.error`) — boot never crashes on a
 * bad package. A host composing purely from hooks may omit `defaults`. */
export async function collectBoot(
  registry: AppHookRegistry,
  defaults?: AppDefaults,
  options: { readonly onError?: (error: Error) => void } = {},
): Promise<BootComposition> {
  const report = options.onError ?? ((error: Error) => console.error('init:presets', error));
  const fonts = collectFontSources();
  if (defaults !== undefined) {
    fonts.ctx.addSource(defaults.fontSource);
  }
  await registry.emit('init:fonts', fonts.ctx);
  fonts.close();
  const presets = collectPresets(report);
  for (const preset of defaults?.presets ?? []) {
    presets.ctx.addPreset(preset);
  }
  await registry.emit('init:presets', presets.ctx);
  presets.close();
  return {
    presets: presets.entries(),
    fontSources: fonts.sources(),
    remote: deriveRemote(registry),
    copilot: registry.resolve('suggest:ops') ?? undefined,
  };
}

/** The remote seam, when every required provider is registered: the four
 * template/project operations make the store + project source; the optional
 * `save:definitions` provider arms the definitions editor's save wire. */
function deriveRemote(registry: AppHookRegistry): RemoteServices | undefined {
  const load = registry.resolve('load:template');
  const save = registry.resolve('save:template');
  const list = registry.resolve('list:projects');
  const project = registry.resolve('load:project');
  if (load === null || save === null || list === null || project === null) {
    return undefined;
  }
  const saveDefinitions = registry.resolve('save:definitions');
  return {
    projects: {
      listProjects: () => list(),
      loadProject: (id) => project(id),
    },
    store: {
      load: (key) => load(key),
      save: (key, doc) => save(key, doc),
    },
    definitions:
      saveDefinitions === null
        ? undefined
        : { saveDefinitions: (projectId, doc) => saveDefinitions(projectId, doc) },
  };
}
