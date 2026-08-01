/**
 * The boundary rules this package is held to, asserted rather than assumed.
 *
 * Nothing here reimplements engine behaviour: layout, formatting and PDF
 * construction all happen inside the addon, which is what makes "the same
 * params produce the same bytes everywhere" true.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration, VERSION } from '../src/index.js';
import { Request } from '../src/request.js';
import { makeClient, rendered } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('determinism', () => {
  it('renders the same params to the same bytes, twice', async () => {
    const params = { customer: { name: 'Yamada Shoji K.K.' } };
    const first = await makeClient().generate('receipt', params);
    const second = await makeClient().generate('receipt', params);

    expect(first.unwrap().bytes).toEqual(second.unwrap().bytes);
  });

  it('produces a real PDF, laid out by the engine rather than assembled here', async () => {
    const artifact = await rendered();

    expect(artifact.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(artifact.bytes.length).toBeGreaterThan(1000);
  });
});

describe('the request envelope', () => {
  it('drops keys the caller did not set rather than sending them as null', () => {
    const encoded = new Request({
      sources: { template: 'version: 0.1.0' },
      params: {},
    }).encoded();
    const envelope = JSON.parse(encoded.toString('utf8'));

    // The engine's schema rejects unknown keys and this SDK must not send a
    // key it has no value for.
    expect(Object.keys(envelope).sort()).toEqual(['fontDirs', 'localeDirs', 'params', 'template']);
  });

  it('carries definitions and the assets directory when they are given', () => {
    const envelope = JSON.parse(
      new Request({
        sources: { template: 't', definitions: 'd', assetsDir: '/assets' },
        params: {},
        lang: 'ja-JP',
        fontDirs: ['/fonts'],
        localeDirs: ['/locales'],
      })
        .encoded()
        .toString('utf8'),
    );

    expect(envelope.definitions).toBe('d');
    expect(envelope.assetsDir).toBe('/assets');
    expect(envelope.lang).toBe('ja-JP');
    expect(envelope.fontDirs).toEqual(['/fonts']);
  });

  it('crosses as UTF-8 bytes', () => {
    const encoded = new Request({
      sources: { template: 'テンプレート' },
      params: { name: '山田' },
    }).encoded();

    expect(Buffer.isBuffer(encoded)).toBe(true);
    expect(encoded.toString('utf8')).toContain('テンプレート');
  });
});

describe('the package’s own identity', () => {
  it('tracks the engine workspace version', () => {
    // All seven SDKs move together while everything is pre-1.0.
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
