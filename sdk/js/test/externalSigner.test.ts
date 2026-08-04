/**
 * Signing with a key this process is never given.
 *
 * The engine hands out bytes, something else signs them, and the finished
 * document has to verify. Nothing is stubbed: the callback here runs `openssl`
 * over the bytes it is handed, which is exactly the shape a cloud key service
 * takes from this package's point of view.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect, promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { bytesToSign } from '../src/externalSigner.js';
import type { Algorithm } from '../src/index.js';
import { ExternalSigner, resetConfiguration, UsageError } from '../src/index.js';
import { keyPath, makeClient, rendered } from './support/fixtures.js';

afterEach(resetConfiguration);

const run = promisify(execFile);

/**
 * A stand-in for a key service: signs with a key this package never sees.
 *
 * `openssl dgst -sha256 -sign` produces exactly what the engine expects —
 * PKCS#1 v1.5 bytes for an RSA key, an ASN.1 DER sequence for an EC one —
 * which is also what AWS KMS and Google Cloud KMS return.
 */
function opensslSigner(stem: string): (toBeSigned: Buffer) => Promise<Buffer> {
  return async (toBeSigned) => {
    const dir = await mkdtemp(join(tmpdir(), 'shojiku-js-sign-'));
    try {
      const message = join(dir, 'to-be-signed.bin');
      const signature = join(dir, 'signature.bin');
      await writeFile(message, toBeSigned);
      await run('openssl', [
        'dgst',
        '-sha256',
        '-sign',
        keyPath(`${stem}.key.pem`),
        '-out',
        signature,
        message,
      ]);
      return await readFile(signature);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

function external(stem = 'rsa2048', algorithm: Algorithm = 'rsa-pkcs1-sha256'): ExternalSigner {
  return new ExternalSigner({
    cert: keyPath(`${stem}.cert.pem`),
    algorithm,
    sign: opensslSigner(stem),
  });
}

describe('signing with a key held elsewhere', () => {
  it('produces a document that verifies', async () => {
    const artifact = await rendered();

    const result = await artifact.sign(external());

    expect(result.success).toBe(true);
    const signed = result.unwrap();
    // Append-only: the input is a byte-for-byte prefix of the output.
    expect(signed.bytes.subarray(0, artifact.bytes.length)).toEqual(artifact.bytes);
    const verified = await signed.verify({ anchors: keyPath('rsa2048.cert.pem') });
    expect(verified.success).toBe(true);
  });

  it('signs with an elliptic-curve key as well', async () => {
    const result = await (await rendered()).sign(external('ec256', 'ecdsa-p256-sha256'));

    expect(result.success).toBe(true);
  });

  it('hands the callback the signed ATTRIBUTES, not the document digest', async () => {
    // The distinction the shorthand gets wrong: signing the digest instead
    // produces a document that fails verification.
    const seen: Buffer[] = [];
    const inner = opensslSigner('rsa2048');
    const provider = new ExternalSigner({
      cert: keyPath('rsa2048.cert.pem'),
      algorithm: 'rsa-pkcs1-sha256',
      sign: async (toBeSigned) => {
        seen.push(toBeSigned);
        return inner(toBeSigned);
      },
    });

    await (await rendered()).sign(provider);

    expect(seen).toHaveLength(1);
    // A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not the
    // 32-byte SHA-256 digest.
    expect(seen[0]?.[0]).toBe(0x31);
    expect(seen[0]?.length).not.toBe(32);
  });

  it('takes a certificate held in memory, so it never has to be written down', async () => {
    const provider = new ExternalSigner({
      certPem: await readFile(keyPath('rsa2048.cert.pem')),
      algorithm: 'rsa-pkcs1-sha256',
      sign: opensslSigner('rsa2048'),
    });

    expect((await (await rendered()).sign(provider)).success).toBe(true);
    expect(inspect(provider)).toContain('[pem bytes]');
  });
});

describe('what counts as misuse', () => {
  it('refuses a callback that returns nothing to write', async () => {
    const provider = new ExternalSigner({
      cert: keyPath('rsa2048.cert.pem'),
      algorithm: 'rsa-pkcs1-sha256',
      sign: () => Buffer.alloc(0),
    });

    await expect((await rendered()).sign(provider)).rejects.toThrow(UsageError);
  });

  it('refuses a callback that returns something other than bytes', async () => {
    const provider = new ExternalSigner({
      cert: keyPath('rsa2048.cert.pem'),
      algorithm: 'rsa-pkcs1-sha256',
      sign: (() => 'a signature, allegedly') as never,
    });

    await expect((await rendered()).sign(provider)).rejects.toThrow(/non-empty Buffer/);
  });

  it('needs a `sign` callback at all', () => {
    expect(() => new ExternalSigner({ cert: 'signer.crt', algorithm: 'rsa-pkcs1-sha256' })).toThrow(
      /`sign` callback/,
    );
  });

  it('takes its certificate explicitly, in both directions', () => {
    const sign = () => Buffer.from('x');
    expect(
      () =>
        new ExternalSigner({
          cert: 'signer.crt',
          certPem: Buffer.from('-----BEGIN CERTIFICATE-----'),
          algorithm: 'rsa-pkcs1-sha256',
          sign,
        }),
    ).toThrow(/not both/);
    expect(() => new ExternalSigner({ algorithm: 'rsa-pkcs1-sha256', sign })).toThrow(
      /needs either/,
    );
  });

  it('needs an algorithm, and names the accepted ones without echoing the request', () => {
    const sign = () => Buffer.from('x');
    expect(() => new ExternalSigner({ cert: 'signer.crt', sign })).toThrow(/needs `algorithm`/);

    let message = '';
    try {
      new ExternalSigner({ cert: 'signer.crt', algorithm: 'rsa-pkcs1-sha1' as never, sign });
    } catch (error) {
      message = String((error as Error).message);
    }
    expect(message).toContain('rsa-pkcs1-sha256');
    expect(message).toContain('ecdsa-p256-sha256');
    expect(message).not.toContain('sha1`');
  });
});

describe('what is not this package’s problem', () => {
  it('lets the callback’s own rejection out rather than filing it as a document failure', async () => {
    // A key service outage is the caller's, not a fact about this document.
    const provider = new ExternalSigner({
      cert: keyPath('rsa2048.cert.pem'),
      algorithm: 'rsa-pkcs1-sha256',
      sign: () => Promise.reject(new Error('the key service is unreachable')),
    });

    await expect((await rendered()).sign(provider)).rejects.toThrow(
      'the key service is unreachable',
    );
  });

  it('returns a failed prepare — a refused document — without asking for a signature', async () => {
    // The engine itself refuses: these bytes are not a document it rendered.
    let asked = false;
    const client = makeClient();
    const notADocument = client.artifact(Buffer.from('not a PDF at all'));
    const provider = new ExternalSigner({
      cert: keyPath('rsa2048.cert.pem'),
      algorithm: 'rsa-pkcs1-sha256',
      sign: () => {
        asked = true;
        return Buffer.from('never reached');
      },
    });

    const result = await client.sign(notADocument, provider);

    expect(result.failed).toBe(true);
    expect(asked).toBe(false);
  });

  it('refuses a prepare payload that names no bytes to sign', () => {
    // The real engine always reports them, so this is the shape only a
    // different program on the other end could produce.
    expect(() => bytesToSign('{}')).toThrow(/no bytes to sign/);
    expect(bytesToSign('{"toBeSigned":"MTIz"}').toString()).toBe('123');
  });

  it('returns an unreadable certificate without ever asking for a signature', async () => {
    // An unreadable certificate is a fact about the inputs; paying for a
    // signature afterwards would tell the caller nothing new.
    let asked = false;
    const provider = new ExternalSigner({
      cert: '/nonexistent/signer.crt',
      algorithm: 'rsa-pkcs1-sha256',
      sign: () => {
        asked = true;
        return Buffer.from('never reached');
      },
    });

    const result = await (await rendered()).sign(provider);

    expect(result.failed).toBe(true);
    expect(asked).toBe(false);
  });
});

describe('what it prints', () => {
  it('shows the certificate form and the algorithm, and nothing else', () => {
    const provider = external('rsa2048', 'ecdsa-p256-sha256');

    const shown = inspect(provider);
    expect(shown).toContain('rsa2048.cert.pem');
    expect(shown).toContain('ecdsa-p256-sha256');
    expect(shown).not.toContain('sign');
    expect(JSON.stringify(provider)).not.toContain('function');
  });
});

describe('under a locked-down client', () => {
  it('signs when registered by name', async () => {
    // The provider a strict deployment may use is a NAMED one, and an
    // external signer is as nameable as a local key.
    const client = makeClient({ providers: { kms: external() } });

    expect((await client.sign(await rendered(), 'kms')).success).toBe(true);
  });

  it('is refused as a bare value when the client is strict', async () => {
    const client = makeClient({ strict: true, providers: { kms: external() } });

    await expect(client.sign(await rendered(), external())).rejects.toThrow(
      /registered in configuration/,
    );
  });
});
