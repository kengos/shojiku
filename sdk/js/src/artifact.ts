/**
 * A rendered (and possibly signed) document.
 *
 * The application sees bytes and metadata — never a layout-engine internal, and
 * never a handle it has to free. Freeing is the binding's job, and in this SDK
 * the binding is Rust: the handle is already gone by the time this object
 * exists.
 */

import { writeFile } from 'node:fs/promises';
import type { Client } from './client.js';
import type { Diagnostic } from './diagnostic.js';
import type { Result } from './result.js';
import type { VerificationReport } from './verificationReport.js';

/**
 * Where a document came from, which is what a strict client signs on.
 *
 * - `rendered` — laid out from a template the configured root resolved,
 * - `source` — laid out from template bytes the application supplied,
 * - `loaded` — bytes the application supplied whole.
 *
 * Only the first is signable under a lockdown: in the other two the provenance
 * of what gets signed is the application's rather than the deployment's, which
 * is the distinction strict exists to draw. Signing inherits the origin of what
 * it signed — appending a revision does not launder where the document came
 * from. Verification is never restricted.
 */
export const Origin = {
  RENDERED: 'rendered',
  SOURCE: 'source',
  LOADED: 'loaded',
} as const;

export type Origin = (typeof Origin)[keyof typeof Origin];

/** What one artifact is built from. */
export interface ArtifactInit {
  bytes: Buffer;
  diagnostics: Diagnostic[];
  client: Client;
  pageCount?: number | null;
  origin?: Origin;
}

/** PDF bytes plus what the engine knows about them. */
export class DocumentArtifact {
  /**
   * The PDF, as binary. PDF bytes are not text, and decoding them to a string
   * is how a document gets corrupted on the way to disk.
   */
  readonly bytes: Buffer;
  /**
   * How many pages the engine laid out. Null for an artifact that was signed
   * rather than rendered — signing appends a revision to bytes it never
   * measured, and a zero there would read as "a document with no pages".
   */
  readonly pageCount: number | null;
  readonly diagnostics: Diagnostic[];
  readonly origin: Origin;
  private readonly client: Client;

  constructor({ bytes, diagnostics, client, pageCount, origin }: ArtifactInit) {
    this.bytes = bytes;
    this.diagnostics = diagnostics;
    this.client = client;
    this.pageCount = pageCount ?? null;
    // The LEAST privileged value, not the most: every internal path states it
    // explicitly, so the default only ever applies to an artifact somebody
    // built by hand — which is bytes handed over whole, and must not become
    // signable under a lockdown by omission.
    this.origin = origin ?? Origin.LOADED;
  }

  /** Whether these bytes were handed over whole rather than laid out here. */
  get loaded(): boolean {
    return this.origin === Origin.LOADED;
  }

  get size(): number {
    return this.bytes.length;
  }

  /**
   * Write the document.
   *
   * Bytes, never a string: a PDF contains NUL and every other byte value, and
   * an encoding round-trip would corrupt it.
   */
  async write(path: string): Promise<string> {
    await writeFile(path, this.bytes);
    return path;
  }

  /**
   * Sign this document, resolving to a result carrying the signed artifact.
   *
   * The signed bytes begin with these bytes byte for byte: signing appends a
   * revision, it never rewrites what was there.
   */
  sign(provider: unknown): Promise<Result<DocumentArtifact>> {
    return this.client.sign(this, provider);
  }

  /** Verify this document against caller-supplied trust anchors. */
  verify(anchors: {
    anchors?: string | string[];
    anchorsPem?: Buffer;
  }): Promise<Result<VerificationReport>> {
    return this.client.verify(this, anchors);
  }
}
