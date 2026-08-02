/**
 * Signing, and the standing promise that key material never comes back out.
 *
 * Three audiences reach three different surfaces — a caught error, a console,
 * a log aggregator — so each gets its own test rather than one that proves
 * "something was redacted somewhere".
 */

import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalPem, resetConfiguration, UsageError } from '../src/index.js';
import { keyPath, makeClient, rendered, signer } from './support/fixtures.js';

afterEach(resetConfiguration);

const PASSPHRASE_TEXT = 'not-the-passphrase';

describe('sign', () => {
  it('appends a revision: the input is a byte-for-byte PREFIX of the output', async () => {
    const artifact = await rendered();
    const result = await artifact.sign(signer());

    expect(result.success).toBe(true);
    const signedBytes = result.unwrap().bytes;
    expect(signedBytes.length).toBeGreaterThan(artifact.bytes.length);
    expect(signedBytes.subarray(0, artifact.bytes.length)).toEqual(artifact.bytes);
  });

  it('signs with an encrypted key when the passphrase is supplied', async () => {
    const passphrase = await readFile(keyPath('passphrase.txt'));
    const provider = new LocalPem({
      key: keyPath('rsa2048.enc.pem'),
      cert: keyPath('rsa2048.cert.pem'),
      passphrase,
    });

    expect((await (await rendered()).sign(provider)).success).toBe(true);
  });

  it('takes a string passphrase as well as bytes', async () => {
    const text = (await readFile(keyPath('passphrase.txt'))).toString('utf8').trim();
    const provider = new LocalPem({
      key: keyPath('rsa2048.enc.pem'),
      cert: keyPath('rsa2048.cert.pem'),
      passphrase: text,
    });

    expect((await (await rendered()).sign(provider)).success).toBe(true);
  });

  it('says the key needs a passphrase rather than failing to parse', async () => {
    const provider = new LocalPem({
      key: keyPath('rsa2048.enc.pem'),
      cert: keyPath('rsa2048.cert.pem'),
    });
    const result = await (await rendered()).sign(provider);

    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('passphrase_required');
    expect(result.failure?.step).toBe('sign');
  });

  it('turns unreadable key material into a failed result, not a throw', async () => {
    const provider = new LocalPem({
      key: '/nonexistent/key.pem',
      cert: keyPath('rsa2048.cert.pem'),
    });
    const result = await (await rendered()).sign(provider);

    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('key_unreadable');
  });

  it('takes key and certificate as BYTES the application already holds', async () => {
    const provider = new LocalPem({
      keyPem: await readFile(keyPath('rsa2048.key.pem')),
      certPem: await readFile(keyPath('rsa2048.cert.pem')),
    });

    expect((await (await rendered()).sign(provider)).success).toBe(true);
  });

  it('signs through the client as well as through the artifact', async () => {
    const client = makeClient();
    const result = await client.sign(await rendered(client), signer());

    expect(result.success).toBe(true);
  });
});

describe('an unexpected error from a provider', () => {
  it('propagates rather than being swallowed as a document problem', async () => {
    // Only unreadable MATERIAL is an outcome of the operation. Anything else
    // coming out of a provider is a bug in that provider, and turning it into
    // a failed result would hide it behind a `success` check.
    const broken = {
      key: async () => {
        throw new TypeError('the provider is broken');
      },
      certificate: async () => Buffer.alloc(0),
      passphrase: null,
    };

    await expect((await rendered()).sign(broken)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('explicit, never sniffed — in BOTH directions', () => {
  it('refuses a key given as a path AND as bytes', () => {
    expect(() => new LocalPem({ key: 'k.pem', keyPem: Buffer.from('x'), cert: 'c.pem' })).toThrow(
      UsageError,
    );
  });

  it('refuses a certificate given as a path AND as bytes', () => {
    expect(() => new LocalPem({ key: 'k.pem', cert: 'c.pem', certPem: Buffer.from('x') })).toThrow(
      UsageError,
    );
  });

  it('refuses a key given as neither', () => {
    expect(() => new LocalPem({ cert: 'c.pem' })).toThrow(UsageError);
  });

  it('refuses a certificate given as neither', () => {
    expect(() => new LocalPem({ key: 'k.pem' })).toThrow(UsageError);
  });
});

describe('nothing echoes the material', () => {
  it('keeps key bytes and passphrase out of a FAILURE message', async () => {
    const key = await readFile(keyPath('rsa2048.enc.pem'));
    const provider = new LocalPem({
      keyPem: key,
      certPem: await readFile(keyPath('rsa2048.cert.pem')),
      passphrase: PASSPHRASE_TEXT,
    });
    const result = await (await rendered()).sign(provider);
    const rendered_message = result.failure?.causes.map((item) => item.message).join('\n') ?? '';
    const keyBody = key.toString('utf8').split('\n')[1];

    expect(result.failed).toBe(true);
    expect(rendered_message).not.toContain(keyBody);
    expect(rendered_message).not.toContain(PASSPHRASE_TEXT);
  });

  it('redacts the provider’s own printed form, through BOTH hooks', () => {
    const provider = new LocalPem({
      key: '/keys/signer.key',
      cert: '/keys/signer.crt',
      passphrase: PASSPHRASE_TEXT,
    });

    // `console.log` goes through util.inspect and never calls toString, so
    // overriding only one of them leaves the key printing in the console —
    // which is the single most likely place for it to be seen.
    for (const printed of [String(provider), inspect(provider), `${provider}`]) {
      expect(printed).toContain('[redacted]');
      expect(printed).not.toContain(PASSPHRASE_TEXT);
      // The configured PATH is not secret and is the one thing worth seeing.
      expect(printed).toContain('/keys/signer.key');
    }
  });

  it('says where each half came from when it came from memory', () => {
    const provider = new LocalPem({ keyPem: Buffer.from('secret'), certPem: Buffer.from('cert') });

    expect(inspect(provider)).toContain('[pem bytes]');
    expect(inspect(provider)).not.toContain('secret');
    expect(inspect(provider)).toContain('passphrase=none');
  });
});
