// The PRESET half of the assembly: walk `examples/<bucket>/<id>/preset.yml`,
// validate each manifest, and copy the preset's files (template, params, the
// declared variant params, definitions, thumbnail, bundled assets) into
// `dist/data/presets/<id>/`. Returns the catalog entries the driver writes.
// Coverage-excluded (scripts/ is not a coverage target) — the
// validation it calls is unit-tested in src/build.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { CatalogPreset } from '../src/assets/manifest';
// `.ts` extensions: node runs this script under type stripping (no bundler), so
// the runtime import of the pure logic needs the explicit extension.
import { resolvePresetBuckets, validateAssetNames, validatePreset } from '../src/build/assemble.ts';
import { copyFile, EXAMPLES, ensureDir, OUT, PRESET_FILES } from './assembleIo.ts';

/** Every bundled preset as `{ id, dir }` — the IO half of the two-level
 * `examples/<bucket>/<id>/preset.yml` walk; `resolvePresetBuckets` owns the
 * id-collision decision. */
function presetDirs(): { id: string; dir: string }[] {
  const found: { id: string; bucket: string }[] = [];
  for (const bucket of readdirSync(EXAMPLES)) {
    if (!statSync(join(EXAMPLES, bucket)).isDirectory()) {
      continue;
    }
    for (const id of readdirSync(join(EXAMPLES, bucket))) {
      if (existsSync(join(EXAMPLES, bucket, id, 'preset.yml'))) {
        found.push({ id, bucket });
      }
    }
  }
  return [...resolvePresetBuckets(found)].map(([id, bucket]) => ({
    id,
    dir: join(EXAMPLES, bucket, id),
  }));
}

export function assemblePresets(): CatalogPreset[] {
  const presets: CatalogPreset[] = [];
  for (const { id, dir } of presetDirs()) {
    const manifestPath = join(dir, 'preset.yml');
    const preset = validatePreset(id, parse(readFileSync(manifestPath, 'utf8')));
    const outDir = join(OUT, 'presets', id);
    ensureDir(outDir);
    for (const file of PRESET_FILES) {
      const src = join(dir, file);
      if (existsSync(src)) {
        copyFile(src, join(outDir, file));
      }
    }
    // Declared sample-data variants: copy each `params-<id>.json` (a missing
    // file is a manifest error — fail the build rather than ship a 404).
    for (const variant of preset.variants ?? []) {
      const file = `params-${variant.id}.json`;
      const src = join(dir, file);
      if (!existsSync(src)) {
        throw new Error(`preset ${id}: variant '${variant.id}' needs ${file}`);
      }
      copyFile(src, join(outDir, file));
    }
    copyFile(join(dir, preset.thumbnail), join(outDir, preset.thumbnail));
    // Bundled assets (templates reference `assets/<name>`): copy them and
    // list them on the catalog entry so the app can fetch + inject at open.
    const assetsDir = join(dir, 'assets');
    const assetNames = existsSync(assetsDir) ? validateAssetNames(id, readdirSync(assetsDir)) : [];
    if (assetNames.length > 0) {
      const assetsOut = join(outDir, 'assets');
      ensureDir(assetsOut);
      for (const name of assetNames) {
        copyFile(join(assetsDir, name), join(assetsOut, name));
      }
      presets.push({ ...preset, assets: assetNames });
    } else {
      presets.push(preset);
    }
  }
  return presets;
}
