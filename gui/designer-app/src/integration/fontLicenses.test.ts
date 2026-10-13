// @vitest-environment node
//
// Every font pack the Designer deploys carries its license text. The assembly
// copies what `packTextFiles` returns beside each pack's faces; this suite runs
// that same decision over the REAL `packs/fonts/` tree, so a pack added without
// its license (or a license renamed out of the predicate's reach) fails here
// rather than reaching the hosted site as faces with no terms attached.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packTextFiles } from '../build/assemble';

// src/integration/ -> repo root is four levels up.
const FONTS_DIR = fileURLToPath(new URL('../../../../packs/fonts/', import.meta.url));
const packIds = readdirSync(FONTS_DIR).filter((id) => statSync(join(FONTS_DIR, id)).isDirectory());

describe('shipped font packs', () => {
  it('finds the packs (a wrong path must not pass over nothing)', () => {
    expect(packIds.length).toBeGreaterThan(0);
  });

  it.each(packIds)('%s ships a license text beside its faces', (id) => {
    // packTextFiles THROWS on a pack with no license text; the throw is the
    // assertion, and the length check only rules out an empty answer.
    expect(packTextFiles(id, readdirSync(join(FONTS_DIR, id))).length).toBeGreaterThan(0);
  });
});
