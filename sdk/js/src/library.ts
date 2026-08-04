/**
 * Finding and loading the engine's native addon.
 *
 * Resolution order, and the deliberate asymmetry with the template root:
 * `SHOJIKU_LIBRARY` beats explicit configuration, which beats the copy shipped
 * inside the platform package. That is the reverse of how the template root
 * resolves, and on purpose — WHERE THE ENGINE LIVES is an operator/deployment
 * decision that has to be able to win over application code, exactly as
 * `SHOJIKU_BIN` does for the subprocess SDKs. WHICH TEMPLATES an application
 * renders is the application's own decision, so there the explicit value wins.
 *
 * Nothing here downloads anything. An addon that is not present is a named
 * error listing the install channels — never a bare `MODULE_NOT_FOUND`, which
 * names none of them.
 */

import { createRequire } from 'node:module';
import type { Env } from './env.js';
import { AbiMismatchError, LibraryNotFoundError } from './errors.js';
import type { Log } from './log.js';

/**
 * The ABI revision this package is written against. It moves only when a
 * symbol's meaning changes; new operations are appended without it, so a newer
 * engine keeps working with this package.
 */
export const ABI_VERSION = 1;

/**
 * The platform packages, one per target in the engine's build matrix. The
 * entry package depends on all of them optionally, so npm installs exactly the
 * one this machine can load and skips the rest.
 *
 * The suffixes name the TOOLCHAIN where it matters: the linux addons are
 * glibc builds (`-gnu`, not musl), and the Windows addon is MSVC — unlike
 * the engine cdylib and CLI, which are mingw there, a node addon has real
 * toolchain affinity (napi-rs does not support the `-gnu` target).
 */
export const PLATFORM_PACKAGES: ReadonlyMap<string, string> = new Map([
  ['linux-x64', '@shojiku/linux-x64-gnu'],
  ['linux-arm64', '@shojiku/linux-arm64-gnu'],
  ['darwin-x64', '@shojiku/darwin-x64'],
  ['darwin-arm64', '@shojiku/darwin-arm64'],
  ['win32-x64', '@shojiku/win32-x64-msvc'],
]);

/** The addon's exported surface, as this package calls it. */
export interface Addon {
  abiVersion(): number;
  engineInfo(): Promise<Snapshot>;
  render(request: Buffer): Promise<Snapshot>;
  sign(
    pdf: Buffer,
    key: Buffer,
    certificate: Buffer,
    passphrase?: Buffer | null,
  ): Promise<Snapshot>;
  signPrepare(pdf: Buffer, certificate: Buffer, algorithm: Buffer): Promise<Snapshot>;
  signComplete(
    pdf: Buffer,
    certificate: Buffer,
    algorithm: Buffer,
    signature: Buffer,
  ): Promise<Snapshot>;
  verify(pdf: Buffer, anchors: Buffer): Promise<Snapshot>;
}

/**
 * One operation's outcome, exactly as the addon returns it.
 *
 * `status` and `success` are the two levels the whole contract rests on: a
 * non-zero `status` is the caller's mistake and becomes an exception, while
 * `status` zero with `success` false is an ordinary fact about a document and
 * becomes a failed result.
 */
export interface Snapshot {
  status: number;
  success: boolean;
  pdf: Buffer;
  json: string;
  diagnostics: string;
  error: string;
}

/** Which position in the resolution order a loaded addon came from. */
export type Source = 'environment' | 'configuration' | 'packaged';

/** One loaded engine addon, and the ABI check that admitted it. */
export class Library {
  readonly path: string;
  readonly source: Source;
  readonly addon: Addon;

  constructor(path: string | null, env: Env, log: Log) {
    const [found, source] = discover(path, env);
    if (found === null) {
      throw new LibraryNotFoundError(installHint('no engine addon was found'));
    }

    this.path = found;
    this.source = source;
    this.addon = load(found);
    log.event('library_loaded', { path: this.path, source: this.source });
    requireAbi(this.addon.abiVersion(), this.path, log);
  }
}

/**
 * The resolution order, and which position won.
 *
 * The second half is worth reporting, because "which engine did this process
 * actually load, and why that one" is the question a deployment asks at 3am.
 */
export function discover(path: string | null, env: Env): [string | null, Source] {
  const fromEnv = env.get('SHOJIKU_LIBRARY');
  if (fromEnv !== null) {
    return [fromEnv, 'environment'];
  }
  if (path) {
    return [path, 'configuration'];
  }

  return [packaged(), 'packaged'];
}

/** The addon inside this machine's platform package, if one is installed. */
export function packaged(
  platform: string = process.platform,
  arch: string = process.arch,
): string | null {
  const name = PLATFORM_PACKAGES.get(`${platform}-${arch}`);
  if (name === undefined) {
    return null;
  }

  try {
    return createRequire(import.meta.url).resolve(`${name}/shojiku.node`);
  } catch {
    return null;
  }
}

/**
 * The ABI check, split out from the constructor that feeds it so the REFUSAL
 * is testable — an addon linked against this engine can only ever report the
 * revision it was built with.
 */
export function requireAbi(found: number, path: string, log: Log): void {
  log.event('abi_checked', { found, expected: ABI_VERSION });
  if (found === ABI_VERSION) {
    return;
  }

  throw new AbiMismatchError(
    `${path} implements ABI revision ${found}; this package speaks ${ABI_VERSION}`,
  );
}

function load(path: string): Addon {
  try {
    return createRequire(import.meta.url)(path) as Addon;
  } catch (error) {
    throw new LibraryNotFoundError(installHint(`${path} could not be loaded (${error})`));
  }
}

function installHint(reason: string): string {
  return (
    `${reason}.\n\n` +
    'This package never downloads the engine. Install it one of these ways:\n' +
    '  * install `shojiku` on a supported platform, which pulls in the addon\n' +
    '  * point SHOJIKU_LIBRARY at a shojiku.node addon you built\n' +
    '  * pass new Client({ library: "/path/to/shojiku.node" })'
  );
}
