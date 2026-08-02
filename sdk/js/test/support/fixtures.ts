/**
 * Fixtures shared by every suite: the real engine addon, the repository's own
 * font and locale packs, and generated key material.
 *
 * Nothing here is a stub. This SDK's whole job is to be a faithful binding, so
 * a suite that mocked the boundary would test the mock. What it does avoid is
 * repeating the setup — one key generation, one rendered document, one signed
 * document, each built once per run.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, type ClientOptions, type DocumentArtifact, LocalPem } from '../../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(HERE, '../../../..');
export const FIXTURE_TEMPLATES = resolve(HERE, '../fixtures/templates');

/**
 * Where the bytes-first entrance's bundled assets live. A directory rather
 * than a template root: `generateSource` resolves `assets/logo.svg` against it
 * and resolves NOTHING else, since there is no name to look up.
 */
export const SOURCE_ASSETS = resolve(HERE, '../fixtures/sources');

/** The addon path, read from the environment the gate image sets. */
export function enginePath(): string {
  const path = process.env.SHOJIKU_LIBRARY;
  if (!path) {
    throw new Error('SHOJIKU_LIBRARY is unset; the gate image sets it');
  }
  return path;
}

/**
 * Generated, never committed.
 *
 * A repository checkout holds no private key, and a leaked test key is worth
 * nothing. The same generator the Rust suites use, so both sides sign with the
 * same shapes. Memoized so the GENERATOR runs once — a generator that is
 * merely idempotent is still unsafe to run beside itself, because it writes
 * its completion sentinel last.
 */
let keyDir: string | null = null;

export function keys(): string {
  if (keyDir === null) {
    const dir = mkdtempSync(join(tmpdir(), 'shojiku-js-keys-'));
    execFileSync('sh', [join(REPO_ROOT, 'scripts/gen-test-keys.sh'), dir], { stdio: 'ignore' });
    keyDir = dir;
  }
  return keyDir;
}

export function keyPath(name: string): string {
  return join(keys(), name);
}

export function readMaterialFile(path: string): Promise<Buffer> {
  return readFile(path);
}

/**
 * A client over the fixture template root, with the packs wired up.
 *
 * The environment is deliberately OFF — a test that accidentally inherited a
 * `SHOJIKU_*` variable from the runner would be testing the runner. Overrides
 * WIN rather than colliding with the defaults: a test that passes
 * `localeDirs: []` is deliberately taking the packs away.
 */
export function makeClient(overrides: ClientOptions = {}): Client {
  return new Client({
    templates: FIXTURE_TEMPLATES,
    fontDirs: [join(REPO_ROOT, 'packs/fonts')],
    localeDirs: [join(REPO_ROOT, 'packs/locale')],
    library: enginePath(),
    env: false,
    ...overrides,
  });
}

export async function rendered(client: Client = makeClient()): Promise<DocumentArtifact> {
  const result = await client.generate('receipt', { customer: { name: 'Yamada Shoji K.K.' } });
  if (result.failed) {
    throw new Error(`the fixture template did not render: ${result.failure}`);
  }
  return result.unwrap();
}

export function signer(): LocalPem {
  return new LocalPem({ key: keyPath('rsa2048.key.pem'), cert: keyPath('rsa2048.cert.pem') });
}

export async function signed(client: Client = makeClient()): Promise<DocumentArtifact> {
  const result = await (await rendered(client)).sign(signer());
  if (result.failed) {
    throw new Error(`the fixture document did not sign: ${result.failure}`);
  }
  return result.unwrap();
}

/**
 * A template as SOURCE TEXT, for the entrance that never reads a file.
 *
 * `items` is spliced in already indented into the flow's item list.
 */
export function sourceTemplate(
  items: string,
  overrides: { style?: string; locale?: string } = {},
): string {
  const style = overrides.style ?? '{ fontFamily: noto-sans, fontSize: 10.5 }';
  const indented = items
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
  return [
    'version: 0.1.0',
    'name: inline',
    'page: { size: A4, margin: 25 }',
    'defaults:',
    `  locale: ${overrides.locale ?? 'en-US'}`,
    `  style: ${style}`,
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    indented,
    '',
  ].join('\n');
}

/**
 * One text item binding `key`. Sized from the fixture templates that render
 * warning-free at this font size.
 */
export function textItem(key: string): string {
  return [
    '- id: line',
    '  type: text',
    '  box: { x: 0, y: 0, w: 400, h: 16 }',
    `  text: "Billed to {${key}}"`,
  ].join('\n');
}
