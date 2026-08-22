// @vitest-environment node
//
// The locale-keyed blank-preset contract, checked against the REAL
// bundled `examples/*/preset.yml` + `templates.yml` — never a synthetic
// catalog. Every registry locale must open exactly one blank preset at ITS
// standard page size, with a `defaults.locale`/`engineLocale` the engine can
// resolve. This suite is the cross-check gate that keeps the three sources —
// the locale registry (`LOCALES`), the preset manifests, and the templates —
// in agreement; drift in any one reds here.

/// <reference types="node" />

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { appPresetContributions } from '../app/hookup';
import type { Catalog, CatalogPreset } from '../assets/manifest';
import { buildCatalog, presetWithFiles, validatePreset } from '../build/assemble';
import { catalogFor, wantsDefinitions } from './catalog';

// src/catalog/ -> repo root is four levels up.
const EXAMPLES = fileURLToPath(new URL('../../../../examples/', import.meta.url));

/** Preset id -> its directory. `examples/` is grouped by document kind
 * (`<bucket>/<id>/`), and the id stays the LEAF name, exactly as the site
 * assembly resolves it. */
const PRESET_DIRS: ReadonlyMap<string, string> = new Map(
  readdirSync(EXAMPLES, { withFileTypes: true })
    .filter((bucket) => bucket.isDirectory())
    .flatMap((bucket) =>
      readdirSync(`${EXAMPLES}/${bucket.name}`, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry): [string, string] => [entry.name, `${EXAMPLES}/${bucket.name}/${entry.name}`]),
    ),
);

/** Every bundled preset, validated exactly as the site assembly does. */
function loadCatalog(): Catalog {
  const presets: CatalogPreset[] = [];
  for (const [id, dir] of PRESET_DIRS) {
    let manifest: string;
    try {
      manifest = readFileSync(`${dir}/preset.yml`, 'utf8');
    } catch {
      continue; // not a preset dir
    }
    presets.push(validatePreset(id, parse(manifest)));
  }
  return buildCatalog(presets);
}

/** The parsed `page` + `defaults` + `styles` of a preset's templates.yml. */
function readTemplate(id: string): { size: string; locale: string; styleNames: string[] } {
  const raw = parse(readFileSync(`${PRESET_DIRS.get(id)}/templates.yml`, 'utf8')) as {
    page?: { size?: unknown };
    defaults?: { locale?: unknown };
    styles?: Record<string, unknown>;
  };
  return {
    size: String(raw.page?.size),
    locale: String(raw.defaults?.locale),
    styleNames: Object.keys(raw.styles ?? {}),
  };
}

const catalog = loadCatalog();
// The real catalog data rides the same contribution mapper the app boot uses;
// `load` is never called in this suite.
const presets = appPresetContributions(catalog, 'https://x/data/', async () => {
  throw new Error('not loaded in this suite');
});
const isBlank = (preset: { readonly id: string }): boolean => preset.id.startsWith('blank-');

describe('locale-keyed blank presets', () => {
  it.each(LOCALES)('$tag opens exactly one blank preset at its standard size', (locale) => {
    const blanks = catalogFor(presets, locale.tag)
      .map((entry) => entry.preset)
      .filter(isBlank);
    // (a) exactly one blank surfaces for this locale.
    expect(blanks.length, locale.tag).toBe(1);
    const preset = blanks[0];
    const template = readTemplate(preset.id);
    // (b) its page size is the locale's standard (first) size.
    expect(template.size, `${locale.tag} page.size`).toBe(locale.pageSizes[0]);
    // (c) the manifest's engineLocale matches the registry.
    expect(preset.engineLocale, `${locale.tag} preset.engineLocale`).toBe(locale.engineLocale);
    // (d) the template's defaults.locale matches the registry engine locale.
    expect(template.locale, `${locale.tag} defaults.locale`).toBe(locale.engineLocale);
  });

  it('every blank preset ships the primitive-style ramp (5 entries)', () => {
    // The blank-start pain the ramp closes: an EMPTY styles registry gives the
    // picker nothing to offer. Every blank must carry the curated ramp so
    // "pick a style" works from the first click. Names are localized per
    // preset (not pinned here — that is a per-locale authoring choice); the
    // COUNT is the contract.
    const blanks = catalog.presets.filter(isBlank).map((preset) => preset.id);
    expect(blanks.length).toBeGreaterThan(0);
    for (const id of blanks) {
      expect(readTemplate(id).styleNames.length, `${id} styles count`).toBe(5);
    }
  });

  it('every bundled blank preset surfaces for at least one registry locale (no orphans)', () => {
    const surfaced = new Set<string>();
    for (const locale of LOCALES) {
      for (const entry of catalogFor(presets, locale.tag)) {
        if (isBlank(entry.preset)) {
          surfaced.add(entry.preset.id);
        }
      }
    }
    const bundled = catalog.presets.filter(isBlank).map((preset) => preset.id);
    for (const id of bundled) {
      expect(surfaced.has(id), id).toBe(true);
    }
  });
});

// The `definitions` flag decides whether the app REQUESTS `definitions.yml` at
// open, so the two ends of that decision (`presetWithFiles` writes it,
// `wantsDefinitions` reads it) are each unit-tested — but the thing that can
// silently break the feature is the GLUE between them, the filesystem probe in
// `scripts/assemblePresets.ts`, and no gate runs that script at all.
//
// So this walks the real bundled tree the way the assembly does and pins the
// flag against the FILE, in both directions. It is a cross-check gate like the
// blank-preset one above, and it carries its own positive control: without the
// counts below, a probe that answered `false` for everything would still pass
// the "blank presets ask for nothing" half — which is the only half the live
// walkthrough could observe.
describe('the definitions flag matches the tree', () => {
  const rows = [...PRESET_DIRS]
    .filter(([, dir]) => existsSync(`${dir}/preset.yml`))
    .map(([id, dir]) => ({
      id,
      hasFile: existsSync(`${dir}/definitions.yml`),
      entry: presetWithFiles(
        validatePreset(id, parse(readFileSync(`${dir}/preset.yml`, 'utf8'))),
        [],
        existsSync(`${dir}/definitions.yml`),
      ),
    }));

  it('asks for the file exactly when the preset ships one', () => {
    for (const { id, hasFile, entry } of rows) {
      expect(wantsDefinitions(entry), `${id} ships definitions: ${hasFile}`).toBe(hasFile);
    }
  });

  // The positive control. A probe stuck at `false` would make the app stop
  // fetching definitions for every preset that HAS them — a silent loss of the
  // field palette, invisible to the "no 404 on a blank preset" observation.
  it('finds presets on BOTH sides, so neither answer is vacuous', () => {
    const withDefs = rows.filter((r) => r.hasFile);
    const without = rows.filter((r) => !r.hasFile);
    expect(withDefs.length).toBeGreaterThan(1);
    expect(without.length).toBeGreaterThan(1);
    // Every preset with no definitions is a BLANK one — which is why the
    // console error fired on precisely the first-time-user path.
    expect(without.every((r) => r.id.startsWith('blank-'))).toBe(true);
  });
});
