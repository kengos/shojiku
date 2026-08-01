import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentArtifact, resetConfiguration } from '../src/index.js';
import {
  keyPath,
  makeClient,
  rendered,
  signed,
  signer,
  sourceTemplate,
  textItem,
} from './support/fixtures.js';

afterEach(resetConfiguration);

describe('DocumentArtifact', () => {
  it('carries the PDF as bytes, never as text', async () => {
    const artifact = await rendered();

    expect(Buffer.isBuffer(artifact.bytes)).toBe(true);
    expect(artifact.size).toBe(artifact.bytes.length);
  });

  it('reports the page count the engine laid out', async () => {
    expect((await rendered()).pageCount).toBe(1);
  });

  it('reports NO page count on a signed artifact — absent, not zero', async () => {
    // Signing appends a revision to bytes it never measured, and a zero here
    // would read as "a document with no pages".
    expect((await signed()).pageCount).toBeNull();
  });

  it('writes the document byte for byte', async () => {
    const artifact = await rendered();
    const path = join(await mkdtemp(join(tmpdir(), 'shojiku-write-')), 'out.pdf');

    expect(await artifact.write(path)).toBe(path);
    expect(await readFile(path)).toEqual(artifact.bytes);
  });

  it('is `rendered` from the root, `source` from bytes, `loaded` when handed over', async () => {
    const client = makeClient();
    const fromRoot = await rendered(client);
    const fromBytes = await client.generateSource({
      template: sourceTemplate(textItem('customer.name')),
      params: { customer: { name: 'x' } },
    });

    expect(fromRoot.origin).toBe('rendered');
    expect(fromBytes.unwrap().origin).toBe('source');
    expect(client.artifact(fromRoot.bytes).origin).toBe('loaded');
    expect(client.artifact(fromRoot.bytes).loaded).toBe(true);
    expect(fromRoot.loaded).toBe(false);
  });

  it('INHERITS the origin through signing — a revision cannot launder provenance', async () => {
    const artifact = await rendered();
    const signedResult = await artifact.sign(signer());

    expect(signedResult.success).toBe(true);
    expect(signedResult.unwrap().origin).toBe('rendered');
  });

  it('re-enters archived bytes with no page count, honestly', async () => {
    const client = makeClient();
    const reentered = client.artifact((await rendered(client)).bytes);

    // Nothing here laid anything out.
    expect(reentered.pageCount).toBeNull();
    expect(reentered.diagnostics).toEqual([]);
  });

  it('defaults a hand-built artifact to the LEAST privileged origin', () => {
    // The default only ever applies to an artifact somebody built by hand, and
    // it must land on `loaded` — the value a strict client refuses to sign —
    // rather than becoming signable by omission.
    const client = makeClient();
    const artifact = new DocumentArtifact({
      bytes: Buffer.from('%PDF-'),
      diagnostics: [],
      client,
    });

    expect(artifact.origin).toBe('loaded');
    expect(artifact.loaded).toBe(true);
    expect(artifact.pageCount).toBeNull();
  });

  it('verifies through the artifact as well as through the client', async () => {
    const artifact = await signed();
    const result = await artifact.verify({ anchors: keyPath('rsa2048.cert.pem') });

    expect(result.success).toBe(true);
  });
});
