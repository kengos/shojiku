/**
 * The log channel: what the BINDING did, and nothing about the document.
 *
 * A log line is the easiest way for a secret to leave a process, so what may
 * NOT be in one is asserted explicitly rather than left to a reviewer's eye.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration } from '../src/index.js';
import { Log } from '../src/log.js';
import { Result } from '../src/result.js';
import { keyPath, makeClient, rendered, signer } from './support/fixtures.js';

afterEach(resetConfiguration);

function recorder() {
  const lines: string[] = [];
  return { lines, logger: { debug: (message: string) => lines.push(message) } };
}

describe('Log', () => {
  it('is silent when no logger was supplied', () => {
    // Nothing to assert but that it does not blow up: the null check is the
    // whole implementation, and a silent log must cost no formatting.
    expect(() => new Log().event('library_loaded', { path: '/x' })).not.toThrow();
  });

  it('renders an event as its name and fields', () => {
    const { lines, logger } = recorder();
    new Log(logger).event('abi_checked', { found: 1, expected: 1 });

    expect(lines).toEqual(['shojiku abi_checked found=1 expected=1']);
  });

  it('renders an event with no fields at all', () => {
    const { lines, logger } = recorder();
    new Log(logger).event('bare');

    expect(lines).toEqual(['shojiku bare']);
  });

  it('times an operation and records its verdict, returning what it returned', async () => {
    const { lines, logger } = recorder();
    const value = Result.succeeded('x', []);
    const returned = await new Log(logger).timed('generate', async () => value, {
      template: 'receipt',
    });

    expect(returned).toBe(value);
    expect(lines[0]).toMatch(/^shojiku generate template=receipt ms=[\d.]+ ok=true$/);
  });

  it('records a failed verdict as ok=false', async () => {
    const { lines, logger } = recorder();
    await new Log(logger).timed('verify', async () =>
      Result.fromFailure(
        new (await import('../src/failure.js')).Failure({
          step: 'verify',
          kind: 'signature',
          message: 'no',
        }),
      ),
    );

    expect(lines[0]).toContain('ok=false');
  });
});

describe('what a real client logs', () => {
  it('reports which addon it loaded and which position won', () => {
    const { lines, logger } = recorder();
    makeClient({ logger });

    expect(lines.join('\n')).toContain('library_loaded');
    expect(lines.join('\n')).toContain('source=configuration');
    expect(lines.join('\n')).toContain('abi_checked');
  });

  it('never logs params, diagnostics, document bytes or key material', async () => {
    const { lines, logger } = recorder();
    const client = makeClient({ logger });
    const artifact = await rendered(client);
    await client.sign(artifact, signer());
    await client.verify(artifact, { anchors: keyPath('rsa2048.cert.pem') });
    const logged = lines.join('\n');

    // The params value, which a naive "log the request" would carry.
    expect(logged).not.toContain('Yamada Shoji K.K.');
    // The diagnostics belong to the result the caller already holds.
    expect(logged).not.toContain('items');
    // Neither the document nor anything PEM-shaped.
    expect(logged).not.toContain('%PDF-');
    expect(logged).not.toContain('BEGIN');
    expect(logged).not.toContain('PRIVATE KEY');
    // What it DOES carry: the step, how long it took, and whether it worked.
    expect(logged).toContain('shojiku generate');
    expect(logged).toContain('shojiku sign');
    expect(logged).toContain('shojiku verify');
  });

  it('bounds a hostile template name before it reaches a log line', async () => {
    const { lines, logger } = recorder();
    const hostile = 'c'.repeat(500);
    await makeClient({ logger }).generate(hostile, {});

    for (const line of lines) {
      expect(line.length).toBeLessThan(hostile.length);
    }
  });
});
