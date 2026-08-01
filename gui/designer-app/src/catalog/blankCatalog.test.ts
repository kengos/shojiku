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

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { appPresetContributions } from '../app/hookup';
import type { Catalog, CatalogPreset } from '../assets/manifest';
import { buildCatalog, validatePreset } from '../build/assemble';
import { catalogFor } from './catalog';

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
