/**
 * Template names are identifiers, not paths — one test per refused class.
 *
 * The rejection rules are the UNION across platforms, not this host's. Windows
 * is a first-class target, so a backslash is a separator, `C:name` is
 * drive-relative, `\\host\share` is a UNC path and `CON`/`NUL` are reserved
 * devices — every one of them refused on EVERY platform.
 *
 * Every refusal is a FAILED RESULT, never a throw: a hostile name is a fact
 * about the request, not a bug in the calling program.
 */

import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ECHO_LIMIT } from '../src/errors.js';
import { resetConfiguration } from '../src/index.js';
import { FIXTURE_TEMPLATES, makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

async function refused(name: string) {
  return makeClient().generate(name, {});
}

describe('refused name classes', () => {
  it('refuses an empty name', async () => {
    const result = await refused('');
    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('template_name');
  });

  it('refuses a blank-but-not-empty name', async () => {
    expect((await refused('   ')).failure?.kind).toBe('template_name');
  });

  it('refuses an absolute path', async () => {
    expect((await refused('/etc/passwd')).failure?.kind).toBe('template_name');
  });

  it('refuses a drive-relative name, which Windows resolves per drive', async () => {
    expect((await refused('C:receipt')).failure?.kind).toBe('template_name');
  });

  it('refuses a UNC path', async () => {
    expect((await refused('\\\\host\\share')).failure?.kind).toBe('template_name');
  });

  it('refuses `..` traversal', async () => {
    expect((await refused('../receipt')).failure?.kind).toBe('template_name');
  });

  it('refuses a forward separator', async () => {
    expect((await refused('nested/receipt')).failure?.kind).toBe('template_name');
  });

  it('refuses a backslash separator, on every platform', async () => {
    expect((await refused('nested\\receipt')).failure?.kind).toBe('template_name');
  });

  it('refuses a control character', async () => {
    expect((await refused('recei\x00pt')).failure?.kind).toBe('template_name');
    expect((await refused('recei\x1bpt')).failure?.kind).toBe('template_name');
  });

  it('refuses reserved DOS device names, with or without an extension', async () => {
    expect((await refused('CON')).failure?.kind).toBe('template_name');
    expect((await refused('nul')).failure?.kind).toBe('template_name');
    expect((await refused('COM1.yml')).failure?.kind).toBe('template_name');
    // Windows STRIPS trailing dots and spaces before resolving, so these are
    // the CON device too.
    expect((await refused('CON.')).failure?.kind).toBe('template_name');
    expect((await refused('CON ')).failure?.kind).toBe('template_name');
  });

  it('bounds and strips the name it echoes back', async () => {
    const hostile = `${'a'.repeat(200)}\x07/x`;
    const message = (await refused(hostile)).failure?.message ?? '';

    // The invariant is about the ECHOED TEXT, not the whole message: the
    // explanation beside it is longer than some hostile names, so comparing
    // total lengths would measure the explanation instead of the cap.
    expect(message).not.toContain('\x07');
    expect(/a+/.exec(message)?.[0].length ?? 0).toBeLessThanOrEqual(ECHO_LIMIT);
  });

  it('does not resolve a prototype name through an inherited property', async () => {
    // A plain-object lookup table would answer `constructor` with an inherited
    // FUNCTION, which reads as a hit. These must all be ordinary misses.
    for (const name of ['constructor', '__proto__', 'toString']) {
      const result = await refused(name);
      expect(result.failed).toBe(true);
      expect(result.failure?.kind).toBe('template_not_found');
    }
  });
});

describe('containment', () => {
  it('reports a name that is shaped fine but absent', async () => {
    expect((await refused('nosuchtemplate')).failure?.kind).toBe('template_not_found');
  });

  it('carries the underlying cause under the refusal', async () => {
    const failure = (await refused('nosuchtemplate')).failure;

    expect(failure?.cause?.kind).toBe('io');
    // Outermost first, so a log shows the refusal before its reason.
    expect(failure?.causes.map((item) => item.kind)).toEqual(['template_not_found', 'io']);
  });

  it('does NOT follow a symlink that points outside the root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'shojiku-root-'));
    const root = join(base, 'root');
    const outside = join(base, 'outside');
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'templates.yml'), 'version: 0.1.0\n');
    await symlink(outside, join(root, 'escape'));

    const result = await makeClient({ templates: root }).generate('escape', {});

    // The check a name-shape rule cannot make: after following the filesystem,
    // is the answer still inside the root?
    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('template_escapes_root');
  });

  it('is structural, so a sibling directory sharing the root’s prefix cannot pass', async () => {
    const base = await mkdtemp(join(tmpdir(), 'shojiku-prefix-'));
    const root = join(base, 'root');
    await mkdir(root, { recursive: true });
    await mkdir(join(base, 'root-evil'), { recursive: true });
    await writeFile(join(base, 'root-evil', 'templates.yml'), 'version: 0.1.0\n');
    await symlink(join(base, 'root-evil'), join(root, 'sneak'));

    const result = await makeClient({ templates: root }).generate('sneak', {});

    // A string prefix compare would admit `/…/root-evil` as inside `/…/root`.
    expect(result.failure?.kind).toBe('template_escapes_root');
  });

  it('reads the optional definitions file when there is one, and copes when there is not', async () => {
    const withDefinitions = await makeClient().generate('receipt', {
      customer: { name: 'x' },
    });
    const without = await makeClient().generate('warns', {});

    expect(withDefinitions.success).toBe(true);
    expect(without.success).toBe(true);
  });

  it('refuses a definitions.yml that is there and cannot be read', async () => {
    const base = await mkdtemp(join(tmpdir(), 'shojiku-defs-'));
    const entry = join(base, 'has-bad-definitions');
    await mkdir(entry, { recursive: true });
    await writeFile(join(entry, 'templates.yml'), 'version: 0.1.0\n');
    // A DIRECTORY where the definitions file belongs: unreadable structurally,
    // which holds even in a container running as root where a chmod would not.
    await mkdir(join(entry, 'definitions.yml'), { recursive: true });

    const result = await makeClient({ templates: base }).generate('has-bad-definitions', {});

    // ABSENCE is what makes definitions optional, not unreadability: swallowing
    // this would render the document as though it declared no schema at all.
    expect(result.failure?.kind).toBe('template_unreadable');
  });

  it('refuses a template directory whose templates.yml cannot be read', async () => {
    const base = await mkdtemp(join(tmpdir(), 'shojiku-unreadable-'));
    // A DIRECTORY where the template file belongs: structurally unreadable, so
    // it holds even in a container running as root, where a chmod would not.
    await mkdir(join(base, 'broken-entry', 'templates.yml'), { recursive: true });

    const result = await makeClient({ templates: base }).generate('broken-entry', {});

    expect(result.failure?.kind).toBe('template_unreadable');
  });

  it('resolves the ordinary case against the configured root', async () => {
    expect(makeClient().templateRoot?.path).toBe(FIXTURE_TEMPLATES);
  });
});
