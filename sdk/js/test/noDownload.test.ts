/**
 * No SDK downloads anything, at install time or at run time.
 *
 * An SDK that fetches an executable is a supply-chain surface this product
 * cannot justify, so the claim is pinned by the package manifest and by a
 * sweep of the source rather than left as a sentence in a README.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

async function manifest(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
}

describe('the published package', () => {
  it('declares no install-time script at all', async () => {
    const scripts = ((await manifest()).scripts ?? {}) as Record<string, string>;

    // `postinstall` and friends are how a package would fetch a binary behind
    // the user's back; there are none, and this is what keeps it that way.
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish']) {
      expect(scripts[hook]).toBeUndefined();
    }
  });

  it('has no runtime dependencies', async () => {
    // The transport is the addon; everything else is a dev tool. A runtime
    // dependency list of zero keeps the supply chain the engine's own.
    expect((await manifest()).dependencies).toBeUndefined();
  });

  it('ships only the built output', async () => {
    expect((await manifest()).files).toEqual(['dist']);
  });
});

describe('the source', () => {
  it('opens no socket and spawns no process', () => {
    const forbidden = ['node:http', 'node:https', 'node:net', 'child_process', 'fetch('];
    const files = sourceFiles(join(PACKAGE_ROOT, 'src'));

    // The INPUT count first: a sweep over an empty file list would otherwise
    // report zero matches and read as a clean result.
    expect(files.length).toBeGreaterThan(15);

    for (const path of files) {
      const source = readFileSync(path, 'utf8');
      for (const needle of forbidden) {
        expect(source, `${path} must not reach for ${needle}`).not.toContain(needle);
      }
    }
  });
});
