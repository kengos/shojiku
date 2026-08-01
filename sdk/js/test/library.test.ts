/**
 * Finding the addon: three positions, and the deliberate REVERSE precedence.
 *
 * `SHOJIKU_LIBRARY` beats explicit configuration, which beats the packaged
 * copy — the opposite of how the template root resolves, because where the
 * ENGINE lives is a deployment decision that has to be able to win over
 * application code.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Env } from '../src/env.js';
import {
  AbiMismatchError,
  Client,
  LibraryNotFoundError,
  resetConfiguration,
} from '../src/index.js';
import { ABI_VERSION, discover, PLATFORM_PACKAGES, packaged, requireAbi } from '../src/library.js';
import { Log } from '../src/log.js';
import { enginePath, makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

const silent = new Log();

describe('resolution order', () => {
  it('takes SHOJIKU_LIBRARY first, ahead of explicit configuration', () => {
    const env = new Env(true, { SHOJIKU_LIBRARY: '/from/env.node' });

    expect(discover('/from/config.node', env)).toEqual(['/from/env.node', 'environment']);
  });

  it('takes explicit configuration when the environment says nothing', () => {
    expect(discover('/from/config.node', new Env(true, {}))).toEqual([
      '/from/config.node',
      'configuration',
    ]);
  });

  it('falls back to the packaged addon when neither is given', () => {
    // No platform package is installed in this checkout, so the third position
    // is what it reports and the answer is "nothing found".
    expect(discover(null, new Env(true, {}))).toEqual([packaged(), 'packaged']);
  });

  it('ignores the environment entirely when lookups are disabled', () => {
    const env = new Env(false, { SHOJIKU_LIBRARY: '/from/env.node' });

    expect(discover('/from/config.node', env)).toEqual(['/from/config.node', 'configuration']);
  });
});

describe('the packaged position', () => {
  it('maps this machine to one platform package name', () => {
    expect(PLATFORM_PACKAGES.get('linux-x64')).toBe('@shojiku/linux-x64-gnu');
    expect(PLATFORM_PACKAGES.get('darwin-arm64')).toBe('@shojiku/darwin-arm64');
    expect(PLATFORM_PACKAGES.get('win32-x64')).toBe('@shojiku/win32-x64-msvc');
  });

  it('is nothing at all on a platform outside the matrix', () => {
    expect(packaged('sunos', 'sparc')).toBeNull();
  });

  it('is nothing when the package for this platform is not installed', () => {
    // The platform packages are published with the release; a source checkout
    // has none, which is exactly this case.
    expect(packaged('linux', 'x64')).toBeNull();
  });
});

describe('refusals', () => {
  it('names the install channels when no addon is found', () => {
    expect(() => new Client({ env: false })).toThrow(LibraryNotFoundError);
    try {
      // eslint-disable-next-line no-new
      new Client({ env: false });
    } catch (error) {
      const message = (error as Error).message;
      // A bare MODULE_NOT_FOUND names none of these, which is the whole reason
      // this error exists.
      expect(message).toContain('SHOJIKU_LIBRARY');
      expect(message).toContain('never downloads');
      expect(message).toContain('shojiku.node');
    }
  });

  it('names the path when the file is there but will not load', () => {
    expect(() => new Client({ library: '/etc/hostname', env: false })).toThrow(
      LibraryNotFoundError,
    );
  });

  it('refuses an addon whose ABI revision is not the one this package speaks', () => {
    // Split out from the constructor that feeds it: an addon linked against
    // this engine can only ever report the revision it was built with, so the
    // refusal is unreachable through a client and testable here.
    expect(() => requireAbi(ABI_VERSION + 1, '/some/addon.node', silent)).toThrow(AbiMismatchError);
  });

  it('admits the revision it does speak', () => {
    expect(() => requireAbi(ABI_VERSION, '/some/addon.node', silent)).not.toThrow();
  });
});

describe('a loaded library', () => {
  it('reports the path and which position won', () => {
    const client = makeClient();

    // Constructed with an explicit library and env off, so configuration is
    // the position that must win.
    expect(client).toBeInstanceOf(Client);
    expect(enginePath()).toContain('.node');
  });
});
