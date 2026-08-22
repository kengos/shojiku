// What the app fetches from its assembled `data/` tree, and the mounted-host
// discovery that decides whether it runs standalone: the preset loader the
// catalog contribution hands to the registry, and the `config.json` probe.
// Part of the browser-entry group (`src/browser/`, coverage-excluded with
// `main.tsx`) — both close over the real `fetch`.

import { parseMountConfig } from '../app/config';
import type { PresetFiles } from '../app/services';
import type { Catalog } from '../assets/manifest';
import { isSafeAssetName } from '../assets/paths';
import { wantsDefinitions } from '../catalog/catalog';
import { loadPresetAssets } from '../engine/assetSource';
import { loadPresetVariants } from '../engine/variantSource';
import { HttpStore } from '../persistence/http';
import { fetchBytes, fetchText } from './io';

export function makeLoadPreset(
  catalog: Catalog,
  dataBase: string,
): (id: string) => Promise<PresetFiles> {
  return async (id) => {
    // Defense in depth: the assembly validates preset ids at build time, but a
    // catalog-derived name never reaches a URL unchecked (same posture as
    // thumbnailUrl).
    if (!isSafeAssetName(id)) {
      throw new Error('unsafe preset id');
    }
    const base = `${dataBase}presets/${id}/`;
    const entry = catalog.presets.find((p) => p.id === id);
    const assetNames = entry?.assets ?? [];
    const variantDecls = entry?.variants ?? [];
    const [source, params, definitions, assets, variants] = await Promise.all([
      fetchText(`${base}templates.yml`),
      fetchText(`${base}params.json`),
      // Ask only when the catalog says the file is there. `.catch` handles a
      // miss, but it cannot un-log the browser's own 404 — and the presets
      // with no definitions are the BLANK ones, i.e. every first-time start.
      wantsDefinitions(entry)
        ? fetchText(`${base}definitions.yml`).catch(() => undefined)
        : Promise.resolve(undefined),
      loadPresetAssets({ fetchBytes, base: dataBase }, id, assetNames),
      loadPresetVariants({ fetchText, base: dataBase }, id, variantDecls),
    ]);
    return { source, params, definitions, assets, variants };
  };
}

/** Mounted-host discovery: a valid `config.json` beside `index.html` yields
 * the HTTP provider stores (registered into the hook registry as the
 * persistence provider events); anything else (404, malformed, unknown kind,
 * cross-origin base) runs standalone. */
export async function loadRemoteStores(): Promise<
  { store: HttpStore; projects: HttpStore; definitions: HttpStore } | undefined
> {
  try {
    const res = await fetch(new URL('config.json', document.baseURI).href);
    if (!res.ok) {
      return undefined;
    }
    const config = parseMountConfig(await res.text(), document.baseURI);
    if (config === null) {
      return undefined;
    }
    const store = new HttpStore({ fetch: (url, init) => fetch(url, init), base: config.apiBase });
    return { projects: store, store, definitions: store };
  } catch {
    return undefined;
  }
}
