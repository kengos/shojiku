// Composing the export kit.
//
// A template that uses a picked font needs three things the bare `templates.yml`
// cannot carry: the pack manifest (with its `url:` pins + `sha256:`), the
// licence text those pins' terms require, and a locale overlay naming the pack
// in `fonts.uses`. Shipped together in the CLI's own directory layout, the kit
// renders on a fresh machine with no flags — the CLI auto-fetches each pinned
// face and verifies it against the manifest.
//
// With no picked fonts there is nothing extra to carry, so the export stays the
// single YAML file it was.

import { DEFAULT_VARIANT_ID, type SampleSet } from '@shojiku/designer';
import type { ExportBytes, ExportFile } from '../persistence/files';
import type { InstalledFont } from './library';
import { buildZip, type ZipEntry } from './zip';

/** What an export produces: the plain YAML file, or a binary kit. */
export type ExportArtifact = ExportFile | ExportBytes;

/** Strip everything off a name that could steer a path, keeping only a fixed
 * charset. Dot RUNS collapse to one: `.` is legal inside a name (`OFL.txt`) but
 * `..` is traversal, and replacing separators alone would leave it intact
 * (`../../evil` → `..-..-evil`). Leading dots/dashes go too, so no entry can
 * start a segment with one. */
function clean(name: string, allowed: RegExp): string {
  return name
    .replace(allowed, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
}

/** A safe path stem for an id. Lowercased: these become an id-derived file or
 * directory name, and the CLI looks a locale pack up by its lowercased id. */
function safeStem(id: string): string {
  const cleaned = clean(id.toLowerCase(), /[^a-z0-9._-]+/g);
  return cleaned.length > 0 ? cleaned : 'font';
}

/** The same guard for a name whose CASE is meaningful: a licence file travels
 * under its upstream name (`OFL.txt`), which is how its own terms refer to it. */
function safeName(name: string): string {
  const cleaned = clean(name, /[^A-Za-z0-9._-]+/g);
  return cleaned.length > 0 ? cleaned : 'LICENSE.txt';
}

/** The params file name for a variant: `params.json` for the default, else a
 * sanitized `params-<slug>.json` (from a user variant's name or a preset
 * variant's id), deduped against `used` by an ordinal suffix. */
function variantFile(variant: SampleSet['variants'][number], used: Set<string>): string {
  if (variant.id === DEFAULT_VARIANT_ID) {
    return 'params.json';
  }
  const source = variant.origin === 'user' ? variant.name : variant.id;
  const stem = clean(source.toLowerCase(), /[^a-z0-9-]+/g) || 'variant';
  let file = `params-${stem}.json`;
  for (let n = 2; used.has(file); n += 1) {
    file = `params-${stem}-${n}.json`;
  }
  used.add(file);
  return file;
}

/** The params entries for a set: `params.json` (default) first, then each other
 * variant's `params-<slug>.json` (collision-deduped). */
function sampleEntries(set: SampleSet): ZipEntry[] {
  const used = new Set<string>(['params.json']);
  const entries: ZipEntry[] = [];
  for (const variant of set.variants) {
    entries.push({ path: variantFile(variant, used), text: variant.text });
  }
  return entries;
}

function readme(
  fonts: readonly InstalledFont[],
  localeId: string,
  variantFiles: readonly string[],
): string {
  const lines = [
    '# Shojiku export',
    '',
    'Render this template with the Shojiku CLI, from this directory (the',
    '`packs/` layout here is the default search path, so no pack flags are',
    'needed):',
    '',
    '```sh',
    `shojiku render --templates templates.yml --params params.json --lang ${localeId} --output output.pdf`,
    '```',
    '',
    '`params.json` holds the sample data; `definitions.yml`, when present, is the',
    'data schema (used by authoring tools and validation, not required to render).',
  ];
  const extraVariants = variantFiles.filter((file) => file !== 'params.json');
  if (extraVariants.length > 0) {
    lines.push(
      '',
      'Other sample-data variants ship beside it — render one by swapping the',
      `\`--params\` file, e.g. \`--params ${extraVariants[0]}\`:`,
      '',
      ...extraVariants.map((file) => `- \`${file}\``),
    );
  }
  if (fonts.length > 0) {
    lines.push(
      '',
      '## Fonts',
      '',
      'The fonts below are referenced by pinned URL, not bundled as bytes. The CLI',
      'fetches each one into its cache on the first render and verifies it against',
      'the `sha256` in the pack manifest; later renders are offline and produce',
      'byte-identical output. Add `--offline` to require the cache and never fetch.',
      '',
      ...fonts.map((f) => `- ${f.displayName} (\`fontFamily: ${f.familyId}\`, ${f.licenseFile})`),
      '',
      'Each font ships its licence text beside its manifest, as its licence requires.',
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Compose the export for a preset's edited template, its sample-data variants,
 * and any picked fonts. Returns a plain YAML file only when nothing beyond the
 * bare template needs to travel (no picked fonts, unedited sample data, no
 * inferred definitions stub); otherwise a ZIP kit carrying `params.json` plus a
 * `params-<slug>.json` per additional variant, the optional `definitions.yml`
 * stub, and the font packs. */
export function buildKit(args: {
  readonly presetId: string;
  readonly text: string;
  /** The CURRENT sample-data variant set. `params.json` is the default
   * variant; each other variant becomes a `params-<slug>.json`. */
  readonly sampleSet: SampleSet;
  /** Whether the sample data differs from the preset's originals (edited text
   * OR any user-added variant) — drives the plain-vs-kit choice. */
  readonly sampleEdited: boolean;
  /** The inferred definitions stub (workshop mode), when present — carried so the
   * exported kit has a schema for authoring/validation. */
  readonly definitions?: string;
  readonly fonts: readonly InstalledFont[];
  /** The composed locale overlay naming every pack in `fonts.uses`. */
  readonly overlay: string;
  /** The engine locale id the overlay is for (`ja-JP`) — its file stem. */
  readonly localeId: string;
  readonly plain: (presetId: string, text: string) => ExportFile;
}): ExportArtifact {
  const { presetId, text, sampleSet, sampleEdited, definitions, fonts, overlay, localeId, plain } =
    args;
  if (fonts.length === 0 && !sampleEdited && definitions === undefined) {
    return plain(presetId, text);
  }

  const sample = sampleEntries(sampleSet);
  const entries: ZipEntry[] = [{ path: 'templates.yml', text }, ...sample];
  if (definitions !== undefined) {
    entries.push({ path: 'definitions.yml', text: definitions });
  }
  if (fonts.length > 0) {
    entries.push({ path: `packs/locale/${safeStem(localeId)}.yml`, text: overlay });
    for (const font of fonts) {
      const dir = `packs/fonts/${safeStem(font.packId)}`;
      entries.push({ path: `${dir}/manifest.yml`, text: font.manifest });
      entries.push({ path: `${dir}/${safeName(font.licenseFile)}`, text: font.licenseText });
    }
  }
  entries.push({
    path: 'README.md',
    text: readme(
      fonts,
      localeId,
      sample.map((e) => e.path),
    ),
  });

  return { filename: `${safeStem(presetId)}-kit.zip`, bytes: buildZip(entries) };
}
