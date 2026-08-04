/**
 * A signing provider for a key this process is never given.
 *
 * The second provider, and the shape `LocalPem`'s own comment promised: a new
 * class rather than new arguments on `sign`, so the call site is unchanged in
 * all seven SDKs.
 *
 * The engine hands out the bytes a signature has to cover; the callback signs
 * them wherever the key actually lives — AWS KMS, Google Cloud KMS, an HSM, a
 * smartcard, another service entirely — and hands the signature back:
 *
 * ```ts
 * const provider = new ExternalSigner({
 *   cert: 'signer.crt',
 *   algorithm: 'ecdsa-p256-sha256',
 *   sign: async (toBeSigned) => {
 *     const { Signature } = await kms.send(
 *       new SignCommand({
 *         KeyId: process.env.KEY_ID,
 *         Message: toBeSigned,
 *         MessageType: 'RAW',
 *         SigningAlgorithm: 'ECDSA_SHA_256',
 *       }),
 *     );
 *     return Buffer.from(Signature);
 *   },
 * });
 * await client.sign(artifact, provider);
 * ```
 *
 * Shojiku ships no cloud client of its own, deliberately: the callback is
 * whatever client your application already has, and the SDK stays a wrapper
 * with nothing to keep in step with a vendor's releases.
 *
 * **What the callback receives is the signed ATTRIBUTES, not the document
 * digest.** A service that signs a digest must hash these bytes with SHA-256
 * itself. Signing the document digest instead produces a document that fails
 * verification, so the distinction is not cosmetic.
 *
 * The signature is the raw output of that operation: PKCS#1 v1.5 bytes for
 * `rsa-pkcs1-sha256`, an ASN.1 DER sequence for `ecdsa-p256-sha256` — which is
 * what both major cloud key services return unchanged.
 */

import type { Engine } from './engine.js';
import { readMaterial, UsageError } from './errors.js';
import type { Snapshot } from './library.js';

/**
 * How a key signs, in the spelling the engine accepts.
 *
 * A union of the wire strings rather than an enum: a caller reading a name out
 * of configuration passes the string, a caller writing code gets the literal
 * completed and type-checked, and neither needs a translation table.
 */
export type Algorithm = 'rsa-pkcs1-sha256' | 'ecdsa-p256-sha256';

const ALGORITHMS: readonly Algorithm[] = ['rsa-pkcs1-sha256', 'ecdsa-p256-sha256'];

const NAMED = ALGORITHMS.map((name) => `\`${name}\``).join(' or ');

const FORMS = '`cert` (a path) or `certPem` (bytes)';

/** What one external provider is built from. */
export interface ExternalSignerInit {
  cert?: string;
  certPem?: Buffer;
  algorithm?: Algorithm;
  /** Receives the bytes to sign, returns the raw signature. */
  sign?: (toBeSigned: Buffer) => Buffer | Promise<Buffer>;
}

/** A certificate, an algorithm, and a callback that signs bytes. */
export class ExternalSigner {
  readonly algorithm: Algorithm;
  private readonly certPath: string | null;
  private certBytes: Buffer | null;
  private readonly signer: (toBeSigned: Buffer) => Buffer | Promise<Buffer>;

  constructor({ cert, certPem, algorithm, sign }: ExternalSignerInit = {}) {
    this.certPath = cert ?? null;
    this.certBytes = certPem ?? null;
    this.algorithm = wireAlgorithm(algorithm);
    oneSource(this.certPath, this.certBytes);
    if (typeof sign !== 'function') {
      throw new UsageError(
        'ExternalSigner needs a `sign` callback that signs the bytes it is given',
      );
    }
    this.signer = sign;
  }

  async certificate(): Promise<Buffer> {
    if (this.certBytes === null) {
      // A path is the only remaining form: the constructor refused neither.
      this.certBytes = await readMaterial(String(this.certPath), 'certificate_unreadable');
    }
    return this.certBytes;
  }

  /**
   * Redacted for the same reason `LocalPem`'s is. Nothing here is key material
   * — that is the point of this provider — but a callback closes over whatever
   * built it, which in practice is a client holding credentials.
   */
  toJSON(): Record<string, string> {
    return { cert: this.certPath ?? '[pem bytes]', algorithm: this.algorithm };
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    const shown = this.toJSON();
    return `ExternalSigner { cert: ${shown.cert}, algorithm: ${shown.algorithm} }`;
  }

  /**
   * Signs `pdf` in two engine calls, with the callback in between.
   *
   * Both calls take the same document, certificate and algorithm: the pair is
   * stateless, so the second re-derives what the first prepared. Keeping them
   * inside ONE method is what makes that impossible to get wrong from
   * JavaScript — there is no way to pair a prepare of one document with a
   * complete of another.
   *
   * A prepare that did not succeed is returned as it is: an unreadable
   * certificate or a document the engine refuses is a fact about the inputs,
   * and paying for a signature afterwards would tell the caller nothing new.
   */
  async signWith(engine: Engine, pdf: Buffer): Promise<Snapshot> {
    const certificate = await this.certificate();
    const algorithm = Buffer.from(this.algorithm, 'utf8');
    const prepared = await engine.signPrepare(pdf, certificate, algorithm);
    if (prepared.status !== 0 || !prepared.success) {
      return prepared;
    }

    return engine.signComplete(pdf, certificate, algorithm, await this.signatureFor(prepared));
  }

  /**
   * Runs the callback over the bytes the engine wants signed.
   *
   * The callback's own rejection is deliberately not caught: it is the
   * caller's code talking to the caller's key service, and turning its
   * failures into a failed result would file a caller's outage under
   * "something was wrong with this document".
   */
  private async signatureFor(prepared: Snapshot): Promise<Buffer> {
    const signature = await this.signer(bytesToSign(prepared.json));
    if (!Buffer.isBuffer(signature) || signature.length === 0) {
      throw new UsageError('the `sign` callback must return the signature as a non-empty Buffer');
    }
    return signature;
  }
}

/**
 * The bytes the engine wants signed, out of the prepare payload.
 *
 * A function of its own so the refusal is reachable from a test: the real
 * engine always reports `toBeSigned`, so a payload without one is a shape only
 * a different program on the other end could produce — and a guard nobody can
 * exercise is a guard nobody knows works.
 */
export function bytesToSign(json: string): Buffer {
  const payload = JSON.parse(json) as { toBeSigned?: string };
  if (typeof payload.toBeSigned !== 'string') {
    throw new UsageError('the engine reported no bytes to sign');
  }
  return Buffer.from(payload.toBeSigned, 'base64');
}

function wireAlgorithm(algorithm: Algorithm | undefined): Algorithm {
  if (algorithm === undefined) {
    throw new UsageError(`ExternalSigner needs \`algorithm\` (${NAMED})`);
  }
  if (!ALGORITHMS.includes(algorithm)) {
    // The caller's value is never echoed — it came from configuration this
    // package does not control, and the accepted names are the useful half.
    throw new UsageError(`\`algorithm\` must be one of ${NAMED}`);
  }
  return algorithm;
}

/**
 * Explicit, never sniffed — in BOTH directions, `LocalPem`'s rule and for the
 * same reason: guessing whether a string is a path or a PEM body is how the
 * wrong file gets read.
 */
function oneSource(path: string | null, pem: Buffer | null): void {
  if (path !== null && pem !== null) {
    throw new UsageError(`ExternalSigner takes either ${FORMS}, not both`);
  }
  if (path === null && pem === null) {
    throw new UsageError(`ExternalSigner needs either ${FORMS}`);
  }
}
