// The browser entry: wire the real browser globals (fetch, navigator,
// localStorage, the wasm module) to the injected-dependency modules and mount
// the App. Coverage-excluded — everything with logic lives in those modules,
// which take their dependencies as parameters and carry the 100% gate. The app
// fetches its assembled data (catalog + fonts + presets + wasm pkg) at runtime
// from the `data/` tree scripts/assemble-site.ts produces.
//
// The glue itself lives beside this file in `src/browser/` (the same
// coverage exclusion, one module per browser surface): the image codec, the
// fetch/file/download I/O, the assembled-data + mount-config loaders, the
// per-engine preparation, and the faker locale import map. This file keeps the
// COMPOSITION — which module gets which global, in which order.

// The one CSS entry: Tailwind utilities + the designer chrome sheet + app.css
// (the legacy sheets ride its layer(components) imports).
import './tailwind.css';
import { chainFontSources, ShojikuGui } from '@shojiku/designer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { appPresetContributions, collectBoot, registerRemoteProviders } from './app/hookup';
import type { AppServices } from './app/services';
import type { Catalog, FontIndex, LocaleIndex } from './assets/manifest';
import { loadRemoteStores, makeLoadPreset } from './browser/dataSources';
import { makePrepareEngine, makeSpecimen } from './browser/enginePrep';
import { loadFakerModule } from './browser/faker';
import { browserImageCodec } from './browser/imageCodec';
import { download, fetchBytes, fetchText, pickFile } from './browser/io';
import { fetchWasmModule } from './browser/moduleFetch';
import { makeFontSource } from './engine/fontSource';
import { makeLocaleSource } from './engine/localeSource';
import { loadWasmModule } from './engine/wasmModule';
import type { FontCatalog } from './fonts/catalog';
import { makeGoogleFontSource } from './fonts/source';
import { moduleLoadTracker } from './loading/moduleLoad';
import { detectLocale } from './locale/detect';
import { BlockStore } from './persistence/blocks';
import { DraftStore } from './persistence/drafts';
import { Prefs } from './persistence/prefs';
import { SnapshotStore } from './persistence/snapshots';
import { loadFakerSynth } from './sample/fakerSynth';

const DATA_BASE = new URL('data/', document.baseURI).href;

async function main(): Promise<void> {
  const [catalog, index, localeIndex] = await Promise.all([
    fetchText(`${DATA_BASE}catalog.json`).then((s) => JSON.parse(s) as Catalog),
    fetchText(`${DATA_BASE}fonts/index.json`).then((s) => JSON.parse(s) as FontIndex),
    fetchText(`${DATA_BASE}locale/index.json`).then((s) => JSON.parse(s) as LocaleIndex),
  ]);
  const remoteStores = await loadRemoteStores();

  const prefs = new Prefs(localStorage);
  const initialLocale = detectLocale({
    override: prefs.localeOverride(),
    navigatorLanguages: navigator.languages,
  });

  // CATALOG-FIRST: the engine module is ~1.7 MB gzipped and the catalog needs
  // none of it, so the fetch STARTS here and is never awaited before the first
  // render — `prepareEngine` awaits it on the first preset open instead. The
  // tracker carries the transfer into the shell chrome (a rail under the header)
  // and into the open view's engine stage, so the wait is visible wherever the
  // user is when it happens.
  const moduleLoad = moduleLoadTracker();
  const moduleBytes = fetchWasmModule(`${DATA_BASE}pkg/`, moduleLoad);
  const wasm = loadWasmModule(`${DATA_BASE}pkg/`, moduleBytes)
    .then((mod) => {
      moduleLoad.finish();
      return mod;
    })
    .catch((error: unknown) => {
      moduleLoad.fail();
      throw error;
    });
  // Both promises get a no-op handler so a module that never arrives cannot log
  // an unhandled rejection at a catalog nobody has clicked yet: `moduleBytes` is
  // only awaited INSIDE the init (after its own dynamic import resolves), so a
  // fast 404 would otherwise reject while still unobserved. The failure still
  // surfaces at every `await` of `wasm` (the open flows), and the tracker has
  // already reported it to the chrome.
  moduleBytes.catch(() => undefined);
  wasm.catch(() => undefined);
  const fonts = makeFontSource({ fetchText, fetchBytes, base: DATA_BASE, index });
  const locales = makeLocaleSource({ fetchText, base: DATA_BASE, index: localeIndex });
  const google = makeGoogleFontSource(fetch.bind(globalThis));

  // The app's own boot rides the hook registry: (when a mount config was
  // found) the HTTP stores register as the persistence provider events, and
  // one collection pass seeds the app's assembled catalog + bundled font
  // source AHEAD of the `init:*` events, then fires them — integrator
  // registrations (imported before main() runs) join the same collection,
  // after the app's own entries by construction.
  if (remoteStores !== undefined) {
    registerRemoteProviders(ShojikuGui, remoteStores);
  }
  const boot = await collectBoot(ShojikuGui, {
    presets: appPresetContributions(catalog, DATA_BASE, makeLoadPreset(catalog, DATA_BASE)),
    fontSource: fonts,
  });
  const bootFonts = chainFontSources(boot.fontSources);

  // The Google-Fonts catalog snapshot, fetched once on first picker open. Always
  // provided now that the module's capability list is not known at boot: the
  // picker gate is `prep.fonts !== null` (the per-engine `pickerCapable` check in
  // `browser/enginePrep.ts`), which the editor wiring already ANDs with this, so
  // offering the loader unconditionally cannot open the picker on an engine that
  // lacks the capabilities.
  let fontCatalogPromise: Promise<FontCatalog> | null = null;
  const loadFontCatalog = (): Promise<FontCatalog> => {
    fontCatalogPromise ??= fetchText(`${DATA_BASE}font-catalog.json`).then(
      (s) => JSON.parse(s) as FontCatalog,
    );
    return fontCatalogPromise;
  };

  const services: AppServices = {
    presets: boot.presets,
    initialLocale,
    persistLocale: (tag) => prefs.setLocaleOverride(tag),
    initialThemePref: prefs.themePref(),
    persistThemePref: (pref) => prefs.setThemePref(pref),
    gridStep: () => prefs.gridStep(),
    persistGridStep: (step) => prefs.setGridStep(step),
    templateMaxBytes: () => prefs.templateMaxBytes(),
    persistTemplateMaxBytes: (bytes) => prefs.setTemplateMaxBytes(bytes),
    sidebarWidth: () => prefs.sidebarWidth(),
    tutorialStore: prefs.tutorialStore(),
    persistSidebarWidth: (width) => prefs.setSidebarWidth(width),
    imageCodec: browserImageCodec,
    colorSchemeMedia: window.matchMedia('(prefers-color-scheme: dark)'),
    drafts: new DraftStore(localStorage),
    blocks: new BlockStore(localStorage),
    snapshots: new SnapshotStore(localStorage),
    now: () => Date.now(),
    remote: boot.remote,
    copilot: boot.copilot,
    moduleLoad,
    prepareEngine: makePrepareEngine({ wasm, index, locales, google, bootFonts }),
    // The same source the engine boot uses, handed to the Designer so the
    // locale panel can ask about a tag this session is not rendering through.
    localePacks: locales,
    loadFontCatalog,
    specimen: makeSpecimen(google),
    loadSynth: (engineLocale) => loadFakerSynth(engineLocale, loadFakerModule),
    exportFile: download,
    openFile: pickFile,
  };

  const root = document.getElementById('root');
  if (root === null) {
    throw new Error('missing #root element');
  }
  createRoot(root).render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  );
}

void main();
