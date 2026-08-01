// The preset side of the hook surface: the contribution shape an
// `init:presets` subscriber registers, plus the collecting context with its
// defense-in-depth guards. The HOST's own contributions are SEEDED into the
// collector before the event fires (the app's boot composition does this), so
// a package can never shadow a bundled id regardless of import order.
// Contributions are integrator CODE (npm-standard trust), but ids become
// localStorage draft keys and thumbnails become <img> URLs, so both are
// re-guarded here: an invalid contribution is dropped and REPORTED, never a
// boot crash.

import type { PresetVariant } from '../sample/variants';

/** One bundled asset a preset ships (the template references
 * `assets/<name>`; the host injects the bytes at preset-open). */
export interface PresetAsset {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** A preset's authored files: the template (editable), sample params, the
 * definitions base (the engineer's file, when one exists), bundled asset
 * bytes, and declared sample-data variants beyond the default `params.json`. */
export interface PresetFiles {
  readonly source: string;
  readonly params: string;
  readonly definitions?: string;
  readonly assets: readonly PresetAsset[];
  readonly variants: readonly PresetVariant[];
}

/** One catalog-surfaceable preset as a hook contribution: display metadata
 * (the same locale-keyed shapes the assembled catalog carries) plus a `load`
 * that produces the authored files when the user opens it. */
export interface PresetContribution {
  /** Safe-charset id (also the draft/document key — guarded at contribution). */
  readonly id: string;
  /** Lowercased locale tags the catalog surfaces this preset for. */
  readonly locales: readonly string[];
  /** The engine locale its template targets (`setLocale` tag, e.g. `ja-JP`). */
  readonly engineLocale: string;
  /** Localized display name per catalog-language key. */
  readonly name: Readonly<Record<string, string>>;
  /** Card image URL — http:/https:, data:image/*, or a relative path;
   * anything else is stripped (the card renders without an image). */
  readonly thumbnailUrl?: string;
  readonly load: () => Promise<PresetFiles>;
}

/** The `init:presets` context: contribute one catalog entry per call. */
export interface PresetsInitContext {
  addPreset(preset: PresetContribution): void;
}

/** The host-side collector behind an `init:presets` emit. */
export interface PresetsCollector {
  readonly ctx: PresetsInitContext;
  close(): void;
  entries(): readonly PresetContribution[];
}

/** Same fixed charset the app's asset guard enforces — a contributed id
 * becomes a localStorage draft key and a document key, so separators and
 * traversal never pass. Length-capped: an id is a key, not content. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

function safeId(id: string): boolean {
  return SAFE_ID.test(id) && id !== '.' && id !== '..';
}

/** Whether a thumbnail URL is renderable as a card image: relative paths,
 * http:/https: (the app's own thumbnails are absolute over its data base, and
 * a plain-http mount is legitimate — mixed-content policy stays the
 * browser's), and data:image/* pass; every other scheme (javascript:,
 * data:text/html, protocol-relative //host) is stripped, and so is any URL
 * carrying control characters or spaces — browsers STRIP tab/newline inside
 * URLs, so `java\tscript:` would otherwise sail past a scheme regex. */
function safeThumbnailUrl(url: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters IS this guard's job
  if (/[\u0000-\u0020\u007f]/.test(url) || url.startsWith('//')) {
    return false;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);
  if (scheme === null) {
    return true;
  }
  const name = scheme[1].toLowerCase();
  return (
    name === 'https' ||
    name === 'http' ||
    (name === 'data' && url.slice(scheme[0].length).startsWith('image/'))
  );
}

/** Collect `init:presets` contributions with the guards above. Invalid ids and
 * duplicate ids (first-wins) drop the contribution; a disallowed thumbnail URL
 * drops only the thumbnail — each reported via `report`, never thrown, so one
 * bad package cannot abort a sibling's registrations. */
export function collectPresets(report: (error: Error) => void): PresetsCollector {
  const byId = new Map<string, PresetContribution>();
  let closed = false;
  return {
    ctx: {
      addPreset(preset) {
        if (closed) {
          throw new Error('init:presets has already fired — register during the event, not later');
        }
        if (!safeId(preset.id)) {
          report(new Error(`preset contribution dropped: unsafe id ${JSON.stringify(preset.id)}`));
          return;
        }
        if (byId.has(preset.id)) {
          report(new Error(`preset contribution dropped: duplicate id "${preset.id}"`));
          return;
        }
        if (preset.thumbnailUrl !== undefined && !safeThumbnailUrl(preset.thumbnailUrl)) {
          report(new Error(`preset "${preset.id}": disallowed thumbnail URL stripped`));
          byId.set(preset.id, { ...preset, thumbnailUrl: undefined });
          return;
        }
        byId.set(preset.id, preset);
      },
    },
    close() {
      closed = true;
    },
    entries() {
      return [...byId.values()];
    },
  };
}
