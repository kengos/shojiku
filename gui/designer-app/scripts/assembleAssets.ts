// The FONT / LOCALE / wasm half of the assembly: copy every font pack (splitting
// an oversized face into the chunk slices the index plans), every locale pack,
// and the built wasm `pkg/`. Returns what the driver needs to write the two
// indexes. Coverage-excluded (scripts/ is not a coverage target) — the chunk
// plan it calls is unit-tested in src/build.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
// `.ts` extensions: node runs this script under type stripping (no bundler), so
// the runtime import of the pure logic needs the explicit extension.
import { CHUNK_SIZE, planFace } from '../src/build/assemble.ts';
import { copyFile, ensureDir, FACE_EXT, FONTS, LOCALES, OUT, PKG } from './assembleIo.ts';

/** Copy a face whole, or write its chunk slices, per the index plan. */
function emitFace(srcDir: string, outDir: string, name: string, size: number): void {
  const planned = planFace(name, size);
  if (planned.parts === undefined) {
    copyFile(join(srcDir, name), join(outDir, name));
    return;
  }
  const bytes = readFileSync(join(srcDir, name));
  planned.parts.forEach((part, i) => {
    writeFileSync(join(outDir, part), bytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  });
}

export function assembleFonts(): { id: string; faces: { name: string; size: number }[] }[] {
  const packs: { id: string; faces: { name: string; size: number }[] }[] = [];
  for (const id of readdirSync(FONTS)) {
    const srcDir = join(FONTS, id);
    if (!statSync(srcDir).isDirectory()) {
      continue;
    }
    const faceNames = readdirSync(srcDir).filter((f) => FACE_EXT.test(f));
    const faces = faceNames.map((name) => ({ name, size: statSync(join(srcDir, name)).size }));
    const outDir = join(OUT, 'fonts', id);
    ensureDir(outDir);
    copyFile(join(srcDir, 'manifest.yml'), join(outDir, 'manifest.yml'));
    for (const face of faces) {
      emitFace(srcDir, outDir, face.name, face.size);
    }
    packs.push({ id, faces });
  }
  return packs;
}

/** Copy every `packs/locale/<id>.yml` and return the file names for the index. */
export function assembleLocales(): string[] {
  const names = readdirSync(LOCALES).filter((f) => f.endsWith('.yml'));
  const outDir = join(OUT, 'locale');
  ensureDir(outDir);
  for (const name of names) {
    copyFile(join(LOCALES, name), join(outDir, name));
  }
  return names;
}

export function copyPkg(): void {
  const outDir = join(OUT, 'pkg');
  ensureDir(outDir);
  for (const file of readdirSync(PKG)) {
    copyFile(join(PKG, file), join(outDir, basename(file)));
  }
}
