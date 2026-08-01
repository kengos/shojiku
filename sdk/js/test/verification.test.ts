/**
 * Verification: fail-closed, and the report that survives a failing verdict.
 *
 * `notChecked` is the field this whole suite protects. A verifier that quietly
 * drops what it did not look at turns a missing capability into a false
 * assurance, which is exactly the trust a signing feature sells.
 */

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration, UsageError, VerificationReport } from '../src/index.js';
import { keyPath, makeClient, rendered, signed } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('verify', () => {
  it('passes a signature this engine made against its own anchor', async () => {
    const client = makeClient();
    const result = await client.verify(await signed(client), {
      anchors: keyPath('rsa2048.cert.pem'),
    });

    expect(result.success).toBe(true);
    expect(result.report?.valid).toBe(true);
    expect(result.report?.signature.passed).toBe(true);
    expect(result.report?.coverage.passed).toBe(true);
  });

  it('carries notChecked on a PASSING verdict', async () => {
    const client = makeClient();
    const result = await client.verify(await signed(client), {
      anchors: keyPath('rsa2048.cert.pem'),
    });

    expect(result.report?.notChecked.length).toBeGreaterThan(0);
  });

  it('carries notChecked on a FAILING verdict too', async () => {
    const client = makeClient();
    const original = await rendered(client);
    const document = await signed(client);
    const tampered = Buffer.from(document.bytes);
    // Flip a byte inside the ORIGINAL body, not the appended revision: the
    // midpoint of a signed file lands in the part signing added, which leaves a
    // container the verifier cannot parse a signature out of at all — a
    // different outcome from the one this test pins.
    tampered[Math.floor(original.bytes.length / 2)] ^= 0xff;

    const result = await client.verify(client.artifact(tampered), {
      anchors: keyPath('rsa2048.cert.pem'),
    });

    // Fail-closed: a caller who checks only `success` is not told a forgery is
    // fine. And the report still rides the failed result.
    expect(result.failed).toBe(true);
    expect(result.report).not.toBeNull();
    expect(result.report?.notChecked.length).toBeGreaterThan(0);
    expect(result.failure?.step).toBe('verify');
  });

  it('has NO report at all for a document it cannot evaluate', async () => {
    const client = makeClient();
    const result = await client.verify(client.artifact(Buffer.from('not a pdf')), {
      anchors: keyPath('rsa2048.cert.pem'),
    });

    // A different fact from an empty report, and the SDK keeps them apart.
    expect(result.failed).toBe(true);
    expect(result.report).toBeNull();
  });

  it('is never restricted by a lockdown — that is the whole point of verify', async () => {
    const strict = makeClient({ strict: true, providers: {} });
    const document = await signed();

    const result = await strict.verify(strict.artifact(document.bytes), {
      anchors: keyPath('rsa2048.cert.pem'),
    });

    // A locked-down deployment is precisely the one that must be able to check
    // an archived document it did not produce.
    expect(result.success).toBe(true);
  });

  it('takes anchors as bytes as well as paths', async () => {
    const client = makeClient();
    const pem = await readFile(keyPath('rsa2048.cert.pem'));
    const result = await client.verify(await signed(client), { anchorsPem: pem });

    expect(result.success).toBe(true);
  });

  it('refuses both anchor forms at once rather than preferring one', async () => {
    const client = makeClient();
    const document = await signed(client);

    await expect(
      client.verify(document, {
        anchors: keyPath('rsa2048.cert.pem'),
        anchorsPem: Buffer.from('x'),
      }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  it('needs anchors: there is no fallback to the machine trust store', async () => {
    const client = makeClient();

    await expect(client.verify(await signed(client), {})).rejects.toThrow(/verify needs/);
  });

  it('turns unreadable anchor material into a failed result, not a throw', async () => {
    const client = makeClient();
    const result = await client.verify(await signed(client), {
      anchors: '/nonexistent/anchor.pem',
    });

    expect(result.failed).toBe(true);
    expect(result.failure?.kind).toBe('anchor_unreadable');
  });

  it('concatenates several anchor files', async () => {
    const client = makeClient();
    const result = await client.verify(await signed(client), {
      anchors: [keyPath('rsa2048.cert.pem'), keyPath('rsa2048.cert.pem')],
    });

    expect(result.success).toBe(true);
  });
});

describe('the report’s own shape', () => {
  it('keeps the four checks separate, because they are different facts', () => {
    const report = VerificationReport.parse(
      JSON.stringify({
        valid: true,
        signature: { status: 'passed' },
        coverage: { status: 'failed', reason: 'trailing unsigned bytes' },
        certificateValidity: { status: 'passed' },
        trustChain: { status: 'passed' },
        notChecked: ['revocation', 'timestamp'],
      }),
    );

    // "The signature is valid but covers only part of the file" is a different
    // fact from "the signature is wrong".
    expect(report.signature.passed).toBe(true);
    expect(report.coverage.passed).toBe(false);
    expect(report.coverage.reason).toBe('trailing unsigned bytes');
    expect(report.notChecked).toEqual(['revocation', 'timestamp']);
    expect([...report.checks.keys()]).toEqual([
      'signature',
      'coverage',
      'certificateValidity',
      'trustChain',
    ]);
  });

  it('is not valid unless the wire says so exactly', () => {
    expect(VerificationReport.parse('{"valid":true}').valid).toBe(true);
    expect(VerificationReport.parse('{"valid":"true"}').valid).toBe(false);
    expect(VerificationReport.parse('{}').valid).toBe(false);
  });

  it('reports no notChecked list rather than inventing one', () => {
    expect(VerificationReport.parse('{}').notChecked).toEqual([]);
    expect(VerificationReport.parse('{"notChecked":null}').notChecked).toEqual([]);
  });

  it('copes with an absent or malformed check', () => {
    const report = VerificationReport.parse('{"signature":null,"coverage":7}');

    expect(report.signature.status).toBeNull();
    expect(report.signature.passed).toBe(false);
    expect(report.coverage.status).toBeNull();
  });

  it('prints a check as its status, with the reason when there is one', () => {
    const report = VerificationReport.parse(
      '{"signature":{"status":"failed","reason":"bad"},"coverage":{"status":"passed"}}',
    );

    expect(String(report.signature)).toBe('failed: bad');
    expect(String(report.coverage)).toBe('passed');
  });

  it('parses a non-object payload as an empty report rather than throwing', () => {
    expect(VerificationReport.parse('null').valid).toBe(false);
  });
});
