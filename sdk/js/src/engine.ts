/**
 * The boundary: one loaded addon, and the operations it exposes.
 *
 * The thinnest module in the package on purpose. Everything that could be got
 * wrong at an FFI boundary — pointer ownership, buffer lengths, freeing the
 * result handle, the panic shield — happens in Rust, inside the addon, because
 * node's binding layer is Rust rather than a foreign-function shim. What is
 * left here is naming the operations and handing bytes to them.
 *
 * Every lifecycle call is a Promise: the addon runs the work on the libuv
 * threadpool, so a render never blocks node's event loop. That is why this
 * package's surface is async-only, and it is the recorded reason node was
 * granted an async surface at all.
 */

import type { Addon, Library, Snapshot } from './library.js';

/** One opened engine, per client. */
export class Engine {
  private readonly addon: Addon;

  constructor(library: Library) {
    this.addon = library.addon;
  }

  engineInfo(): Promise<Snapshot> {
    return this.addon.engineInfo();
  }

  /** `request` is the serialized envelope; this package never re-reads it. */
  render(request: Buffer): Promise<Snapshot> {
    return this.addon.render(request);
  }

  sign(
    pdf: Buffer,
    key: Buffer,
    certificate: Buffer,
    passphrase: Buffer | null,
  ): Promise<Snapshot> {
    return this.addon.sign(pdf, key, certificate, passphrase);
  }

  /**
   * Reserves the signature window and reports what a signature must cover.
   *
   * The payload arrives on the snapshot's `json`, unparsed by the addon —
   * that host has no schema of its own.
   */
  signPrepare(pdf: Buffer, certificate: Buffer, algorithm: Buffer): Promise<Snapshot> {
    return this.addon.signPrepare(pdf, certificate, algorithm);
  }

  /** Writes a signature produced elsewhere into the document. */
  signComplete(
    pdf: Buffer,
    certificate: Buffer,
    algorithm: Buffer,
    signature: Buffer,
  ): Promise<Snapshot> {
    return this.addon.signComplete(pdf, certificate, algorithm, signature);
  }

  verify(pdf: Buffer, anchors: Buffer): Promise<Snapshot> {
    return this.addon.verify(pdf, anchors);
  }
}
