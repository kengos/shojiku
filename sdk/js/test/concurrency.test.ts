/**
 * What this client guarantees under concurrency, stated rather than assumed.
 *
 * The addon runs each operation on the libuv threadpool and the C surface
 * documents its operations as concurrency-safe, so several renders in flight
 * are a supported shape — and they must produce the SAME bytes, because
 * determinism is the product promise underneath every SDK.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { resetConfiguration } from '../src/index.js';
import { makeClient } from './support/fixtures.js';

afterEach(resetConfiguration);

describe('concurrent renders', () => {
  it('produce byte-identical documents', async () => {
    const client = makeClient();
    const params = { customer: { name: 'Yamada Shoji K.K.' } };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => client.generate('receipt', params)),
    );

    for (const result of results) {
      expect(result.success).toBe(true);
    }
    const [first, ...rest] = results.map((result) => result.unwrap().bytes);
    for (const bytes of rest) {
      expect(bytes).toEqual(first);
    }
  });

  it('leave the event loop free while they run', async () => {
    const client = makeClient();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 1);

    try {
      await Promise.all(
        Array.from({ length: 4 }, () => client.generate('receipt', { customer: { name: 'x' } })),
      );
    } finally {
      clearInterval(timer);
    }

    // A synchronous binding would block the loop for the whole batch and the
    // timer would never have fired. This is the claim the async-only surface
    // is built on.
    expect(ticks).toBeGreaterThan(0);
  });

  it('let several clients over the same addon run at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () => makeClient().generate('receipt', {})),
    );

    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });
});
