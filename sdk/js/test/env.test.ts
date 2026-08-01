/**
 * The environment, and the ONE flag that governs every `SHOJIKU_*` lookup.
 *
 * One flag rather than one per variable is the reference decision the other six
 * SDKs mirror: an application that wants a hermetic configuration wants all of
 * it off.
 */

import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Env } from '../src/env.js';
import { resetConfiguration } from '../src/index.js';
import { enginePath, FIXTURE_TEMPLATES, makeClient, REPO_ROOT } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('Env', () => {
  it('reads a variable when lookups are on', () => {
    expect(new Env(true, { SHOJIKU_TEMPLATE_ROOT: '/from/env' }).get('SHOJIKU_TEMPLATE_ROOT')).toBe(
      '/from/env',
    );
  });

  it('reads nothing at all when they are off', () => {
    expect(
      new Env(false, { SHOJIKU_TEMPLATE_ROOT: '/from/env' }).get('SHOJIKU_TEMPLATE_ROOT'),
    ).toBeNull();
  });

  it('treats an unset and a BLANK variable the same', () => {
    expect(new Env(true, {}).get('SHOJIKU_TEMPLATE_ROOT')).toBeNull();
    expect(new Env(true, { SHOJIKU_TEMPLATE_ROOT: '' }).get('SHOJIKU_TEMPLATE_ROOT')).toBeNull();
  });

  it('splits a multi-path variable on the platform delimiter', () => {
    const env = new Env(true, { SHOJIKU_FONT_DIR: ['/a', '/b'].join(delimiter) });

    expect(env.paths('SHOJIKU_FONT_DIR')).toEqual(['/a', '/b']);
  });

  it('drops empty entries in a multi-path variable', () => {
    const env = new Env(true, { SHOJIKU_FONT_DIR: `${delimiter}/a${delimiter}` });

    expect(env.paths('SHOJIKU_FONT_DIR')).toEqual(['/a']);
  });

  it('reports no paths at all when the variable is unset or lookups are off', () => {
    expect(new Env(true, {}).paths('SHOJIKU_FONT_DIR')).toEqual([]);
    expect(new Env(false, { SHOJIKU_FONT_DIR: '/a' }).paths('SHOJIKU_FONT_DIR')).toEqual([]);
  });

  it('falls back to the real process environment when given no source', () => {
    // The gate image sets this one, which is what makes it a safe probe.
    expect(new Env(true).get('SHOJIKU_LIBRARY')).toBe(enginePath());
  });
});

describe('the template root through the environment', () => {
  it('is HONOURED when nothing else configures one', async () => {
    process.env.SHOJIKU_TEMPLATE_ROOT = FIXTURE_TEMPLATES;
    try {
      const client = makeClient({ templates: null, env: true });
      expect(client.templateRoot?.path).toBe(FIXTURE_TEMPLATES);
    } finally {
      delete process.env.SHOJIKU_TEMPLATE_ROOT;
    }
  });

  it('is BEATEN by explicit configuration', () => {
    process.env.SHOJIKU_TEMPLATE_ROOT = '/from/env';
    try {
      // What an application renders is the application's own decision — the
      // deliberate opposite of how the engine library resolves.
      expect(makeClient({ env: true }).templateRoot?.path).toBe(FIXTURE_TEMPLATES);
    } finally {
      delete process.env.SHOJIKU_TEMPLATE_ROOT;
    }
  });

  it('is DISABLED by the one env flag', () => {
    process.env.SHOJIKU_TEMPLATE_ROOT = FIXTURE_TEMPLATES;
    try {
      expect(makeClient({ templates: null, env: false }).templateRoot).toBeNull();
    } finally {
      delete process.env.SHOJIKU_TEMPLATE_ROOT;
    }
  });
});

describe('the pack directories through the environment', () => {
  it('are read from SHOJIKU_FONT_DIR and SHOJIKU_LOCALE_DIR when unconfigured', async () => {
    process.env.SHOJIKU_FONT_DIR = join(REPO_ROOT, 'packs/fonts');
    process.env.SHOJIKU_LOCALE_DIR = join(REPO_ROOT, 'packs/locale');
    try {
      const client = makeClient({ fontDirs: null, localeDirs: null, env: true });
      const result = await client.generate('receipt', { customer: { name: 'x' } });

      // The packs reached the engine, or this template could not have rendered.
      expect(result.success).toBe(true);
    } finally {
      delete process.env.SHOJIKU_FONT_DIR;
      delete process.env.SHOJIKU_LOCALE_DIR;
    }
  });
});
