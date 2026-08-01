// Where the assembly reads from and writes to, and the two filesystem
// primitives every copy step uses. Split out so the per-kind steps
// (`assemblePresets.ts`, `assembleAssets.ts`) and the driver share ONE set of
// resolved paths — `import.meta.url` is relative to this directory, the same
// `scripts/` dir the driver lives in.
// Coverage-excluded (scripts/ is not a coverage target).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = new URL('../', import.meta.url);
const REPO = new URL('../../../', import.meta.url);
const repoPath = (rel: string) => fileURLToPath(new URL(rel, REPO));
export const OUT = fileURLToPath(new URL('dist/data/', APP));

export const EXAMPLES = repoPath('examples');
export const FONTS = repoPath('packs/fonts');
export const LOCALES = repoPath('packs/locale');
export const PKG = repoPath('engine/wasm/pkg');
export const FONT_CATALOG = fileURLToPath(new URL('data/font-catalog.json', APP));
export const PRESET_FILES = ['templates.yml', 'params.json', 'definitions.yml'];
export const FACE_EXT = /\.(ttf|otf)$/i;

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function copyFile(from: string, to: string): void {
  writeFileSync(to, readFileSync(from));
}
