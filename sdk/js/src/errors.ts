/**
 * The base of everything this package throws, plus the two shared helpers.
 *
 * Throwing is deliberately rare here. A template that will not render, a key
 * that will not sign, a signature that does not verify are OUTCOMES — they come
 * back as `Result` objects you query, never as rejections you catch. What is
 * left for exceptions is what every JavaScript library reserves them for:
 * programmer misuse, and an environment that cannot host the engine at all.
 */

import { readFile } from 'node:fs/promises';
import type { Failure } from './failure.js';

/** The base of every error this package throws. */
export class ShojikuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The caller passed something this API cannot accept.
 *
 * A template name that is not a string, both forms of the same material at
 * once, or an entrance this client's lockdown disables. Programmer misuse, so
 * it throws.
 *
 * A BLANK template name is deliberately not in that list: an empty string can
 * arrive straight from a form field, so it comes back as a refused request like
 * every other bad name.
 */
export class UsageError extends ShojikuError {}

/**
 * Unwrapping a result that failed.
 *
 * `Result.unwrap()` is the opt-in bridge to exception-style control flow.
 * Calling it on a failed result is programmer misuse — the ruling is explicit
 * and frozen for every Shojiku SDK, because an accessor that throws is the one
 * place this API could drift back into exceptions by accident. The failure
 * travels on the error, so nothing is lost by taking the short road.
 */
export class UnwrapError extends ShojikuError {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(String(failure));
    this.failure = failure;
  }
}

/**
 * The engine addon could not be found or loaded.
 *
 * The message names the install channels, because the fix is always an
 * installation step and a bare `MODULE_NOT_FOUND` names none of them. Nothing
 * here downloads the addon: an SDK that fetches an executable is a
 * supply-chain surface this product does not take on.
 */
export class LibraryNotFoundError extends ShojikuError {}

/**
 * The addon implements a different ABI revision than this package.
 *
 * Loading anyway would mean calling symbols whose meaning has changed.
 */
export class AbiMismatchError extends ShojikuError {}

/**
 * Key, certificate or trust-anchor bytes that could not be read.
 *
 * Thrown internally and caught by the client, which turns it into a failed
 * result: unreadable material is an outcome of the operation, not a bug in the
 * calling program. It carries the machine-readable `kind` the failure trace
 * reports.
 */
export class MaterialUnreadableError extends ShojikuError {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

/** How much caller-supplied text may reach a message or a log line. */
export const ECHO_LIMIT = 80;

// Control characters, stripped before anything echoes caller text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point, so the class must contain them
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/g;

/**
 * Echo caller-supplied text back, stripped and capped.
 *
 * Template names and provider names reach exception reporters and log files, so
 * they are stripped of control characters and bounded before they are quoted —
 * the same discipline the engine applies to the values it echoes. One place for
 * it, because every path that echoes owes the same thing.
 */
export function bounded(text: unknown): string {
  return String(text).replace(CONTROL_CHARACTERS, '').slice(0, ECHO_LIMIT);
}

/**
 * Read the byte inputs signing and verification take.
 *
 * One place, because both paths owe the same thing: bytes rather than text (PEM
 * is bytes, and a transcode would corrupt a DER-bearing file), and an
 * unreadable file surfacing as `MaterialUnreadableError` rather than as a raw
 * filesystem error nobody upstream is catching.
 */
export async function readMaterial(path: string, kind: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new MaterialUnreadableError(kind, String(error));
  }
}
