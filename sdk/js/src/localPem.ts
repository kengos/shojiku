/**
 * A signing provider backed by a PEM key and certificate.
 *
 * The only provider this release has. KMS and HSM providers are a recorded
 * deferral, which is why this is a named class rather than a pair of arguments
 * on `sign` — a second provider then adds a class, not a signature change in
 * seven languages.
 *
 * The material comes either from paths (`key` / `cert`) or from bytes already
 * in memory (`keyPem` / `certPem`), so a key fetched from a secret manager
 * never has to be written to disk first. Which one you passed is explicit
 * rather than sniffed: guessing whether a string is a path or a PEM body is
 * exactly the kind of cleverness that reads the wrong file.
 *
 * Nothing here logs key material, and the engine builds its refusals from fixed
 * strings, so a rejection cannot echo it back either.
 */

import { readMaterial, UsageError } from './errors.js';

/** What one provider is built from. */
export interface LocalPemInit {
  key?: string;
  cert?: string;
  keyPem?: Buffer;
  certPem?: Buffer;
  passphrase?: Buffer | string;
}

/** PEM key + certificate, from paths or from bytes, never sniffed. */
export class LocalPem {
  readonly passphrase: Buffer | string | null;
  private readonly keyPath: string | null;
  private readonly certPath: string | null;
  private keyBytes: Buffer | null;
  private certBytes: Buffer | null;

  constructor({ key, cert, keyPem, certPem, passphrase }: LocalPemInit = {}) {
    this.keyPath = key ?? null;
    this.certPath = cert ?? null;
    this.keyBytes = keyPem ?? null;
    this.certBytes = certPem ?? null;
    this.passphrase = passphrase ?? null;
    oneSource(this.keyPath, this.keyBytes, 'key');
    oneSource(this.certPath, this.certBytes, 'cert');
  }

  async key(): Promise<Buffer> {
    if (this.keyBytes === null) {
      // A path is the only remaining form: the constructor refused neither.
      this.keyBytes = await readMaterial(String(this.keyPath), 'key_unreadable');
    }
    return this.keyBytes;
  }

  async certificate(): Promise<Buffer> {
    if (this.certBytes === null) {
      this.certBytes = await readMaterial(String(this.certPath), 'certificate_unreadable');
    }
    return this.certBytes;
  }

  /**
   * Redacted, deliberately.
   *
   * The default rendering prints every field, which here is the private key and
   * the passphrase — into a console, a REPL, an exception reporter's local
   * variable dump, or any log line that interpolates the provider. None of that
   * is worth showing, so nothing is shown but the class and which FORM each
   * half came from.
   *
   * BOTH hooks, not one: `console.log` in node goes through
   * `util.inspect.custom` and never calls `toString`, so overriding only
   * `toString` leaves the console printing the key — which is the single most
   * likely place for it to be seen.
   */
  toString(): string {
    const passphrase = this.passphrase === null ? 'none' : '[redacted]';
    return `<LocalPem key=${form(this.keyPath)} cert=${form(this.certPath)} passphrase=${passphrase}>`;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString();
  }
}

/**
 * The path, or a note that the bytes came from memory.
 *
 * A configured file path is not secret and is the one thing worth seeing when a
 * provider loaded the wrong material; the bytes themselves are never printed.
 */
function form(path: string | null): string {
  return path ?? '[pem bytes]';
}

/**
 * Explicit, never sniffed — in BOTH directions.
 *
 * Guessing whether a string is a path or a PEM body is how the wrong file gets
 * read; accepting both forms and silently preferring one ignores the argument
 * the caller meant, which is the same mistake one layer quieter.
 */
function oneSource(path: string | null, pem: Buffer | null, what: string): void {
  const forms = `\`${what}\` (a path) or \`${what}Pem\` (bytes)`;
  if (path !== null && pem !== null) {
    throw new UsageError(`LocalPem takes either ${forms}, not both`);
  }
  if (path === null && pem === null) {
    throw new UsageError(`LocalPem needs either ${forms}`);
  }
}
