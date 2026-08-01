// Extraction of an engine throw's fields. The engine's wasm shim throws
// host-misuse errors as a JS `Error` carrying `message` plus a stable `code`
// string and a typed `args` object (mirroring the diagnostics discipline);
// an older engine, or a non-Error throw, has only the message. This module
// normalizes both — and any hostile/malformed shape — into plain fields the
// transport wraps in a `TransportError`, never trusting the thrown object's
// structure.

import type { ArgValue, WasmErrorCode } from './types';

/** The display text of a thrown value: an `Error`'s message, else `String(v)`. */
export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The fields pulled from an engine throw: always a message, plus the typed
 * `code`/`args` when the throw was a structured host-misuse error. Every field
 * is validated — a non-string `code`, a non-object `args`, or a non-scalar arg
 * value is dropped rather than trusted. */
export interface ThrowFields {
  readonly message: string;
  readonly code?: WasmErrorCode;
  readonly args?: Readonly<Record<string, ArgValue>>;
}

function readCode(cause: Record<string, unknown>): WasmErrorCode | undefined {
  // Typed as the known set for consumers; a newer engine's unrecognized code
  // still rides through as its string (append-only contract, forward-compatible).
  return typeof cause.code === 'string' ? (cause.code as WasmErrorCode) : undefined;
}

function readArgs(cause: Record<string, unknown>): Record<string, ArgValue> | undefined {
  const raw = cause.args;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  // Copy scalar entries into a FRESH plain object — never retain the foreign
  // object (no prototype/getters carried across the boundary), and drop any
  // non-scalar value (object/array/function/undefined) the engine never emits.
  const args: Record<string, ArgValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      args[key] = value;
    }
  }
  return args;
}

/** Normalizes any thrown value into validated {@link ThrowFields}. */
export function throwFields(cause: unknown): ThrowFields {
  const message = errorText(cause);
  if (typeof cause !== 'object' || cause === null) {
    return { message };
  }
  const record = cause as Record<string, unknown>;
  return { message, code: readCode(record), args: readArgs(record) };
}
