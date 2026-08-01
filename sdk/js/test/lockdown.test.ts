/**
 * The lockdown, ONE CLAUSE PER TEST.
 *
 * A lockdown tested as a whole reports "something was refused" and stops
 * proving which rule did it — so each clause gets its own case, and each
 * refusal is asserted to be a `UsageError` rather than a failed result. Strict
 * disables an ENTRANCE, so calling it is the program contradicting its own
 * deployment's configuration, and a failed result is something an
 * `if (result.success)` can swallow.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ECHO_LIMIT } from '../src/errors.js';
import { configure, resetConfiguration, UsageError } from '../src/index.js';
import {
  keyPath,
  makeClient,
  rendered,
  signer,
  sourceTemplate,
  textItem,
} from './support/fixtures.js';

afterEach(resetConfiguration);

function strictClient(providers: Record<string, unknown> = {}) {
  return makeClient({ strict: true, providers });
}

describe('the bytes entrance', () => {
  it('is refused by a strict client, as programmer misuse', async () => {
    const client = strictClient();

    // A REJECTION, not a synchronous throw: every entrance on this surface is
    // a Promise, so a caller's `.catch()` must see a refusal too.
    await expect(
      client.generateSource({ template: sourceTemplate(textItem('a')), params: {} }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  it('is open on a client that is not strict', async () => {
    const result = await makeClient().generateSource({
      template: sourceTemplate(textItem('customer.name')),
      params: { customer: { name: 'x' } },
    });

    expect(result.success).toBe(true);
  });
});

describe('what may be signed', () => {
  it('refuses to sign an artifact whose origin is not `rendered`', async () => {
    const client = strictClient({ local: signer() });
    const loaded = client.artifact((await rendered()).bytes);

    await expect(client.sign(loaded, 'local')).rejects.toBeInstanceOf(UsageError);
  });

  it('still VERIFIES that same artifact — verification is never restricted', async () => {
    const client = strictClient({ local: signer() });
    const plain = makeClient();
    const document = await (await rendered(plain)).sign(signer());
    const loaded = client.artifact(document.unwrap().bytes);

    const result = await client.verify(loaded, { anchors: keyPath('rsa2048.cert.pem') });

    expect(result.success).toBe(true);
  });

  it('signs a document it rendered from its own root', async () => {
    const client = strictClient({ local: signer() });
    const result = await client.sign(await rendered(client), 'local');

    expect(result.success).toBe(true);
  });
});

describe('signing material', () => {
  it('refuses a provider OBJECT in favour of a registered name', async () => {
    const client = strictClient({ local: signer() });
    const artifact = await rendered(client);

    await expect(client.sign(artifact, signer())).rejects.toBeInstanceOf(UsageError);
  });

  it('names an unknown provider without echoing anything unbounded', async () => {
    const client = strictClient({ local: signer() });
    const artifact = await rendered(client);
    const hostile = 'b'.repeat(500);

    try {
      await client.sign(artifact, hostile);
      expect.unreachable('an unregistered provider name must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageError);
      expect(/b+/.exec((error as Error).message)?.[0].length ?? 0).toBeLessThanOrEqual(ECHO_LIMIT);
    }
  });

  it('resolves a provider name through a Map, never an inherited property', async () => {
    const client = strictClient({ local: signer() });
    const artifact = await rendered(client);

    // A plain-object registry would answer `constructor` with an inherited
    // function, which the client would then try to sign with.
    for (const name of ['constructor', '__proto__', 'toString']) {
      await expect(client.sign(artifact, name)).rejects.toBeInstanceOf(UsageError);
    }
  });

  it('takes a registered name on a client that is NOT strict, too', async () => {
    const client = makeClient({ providers: { local: signer() } });
    const result = await client.sign(await rendered(client), 'local');

    expect(result.success).toBe(true);
  });
});

describe('who may lift it', () => {
  it('survives a call site asking for strict: false', async () => {
    // The ONE place configuration beats a constructor argument: a restriction
    // an operator declared must not be liftable by application code.
    configure({ strict: true });
    const client = makeClient({ strict: false });

    await expect(
      client.generateSource({ template: sourceTemplate(textItem('a')), params: {} }),
    ).rejects.toBeInstanceOf(UsageError);
  });

  it('is off by default', async () => {
    await expect(
      makeClient().generateSource({ template: sourceTemplate(textItem('a')), params: {} }),
    ).resolves.toBeDefined();
  });
});
