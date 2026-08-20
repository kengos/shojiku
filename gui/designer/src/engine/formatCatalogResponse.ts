// The format catalog's response guard: what the engine's `formatCatalog` JSON
// has to look like before the panel reads it.
//
// A TS type is compile-time only, and this response is not merely engine
// output — the SPELLINGS inside it are derived from the author's own
// `formats:` registry, and picking one AUTHORS it into the document. So every
// field is checked at runtime, and a malformed shape becomes a
// `TransportError` here rather than a wrong value written to the file.

import type {
  FormatCatalog,
  FormatOrigin,
  FormatTypeEntry,
  FormatVariant,
  ProbeRefusal,
  ProbeResult,
} from './types';
import { asArray, asBoolean, asRecord, asString, fail, parseJson } from './wasmResponse';

const ORIGINS: readonly FormatOrigin[] = ['builtin', 'pack', 'registry'];
const REFUSALS: readonly ProbeRefusal[] = ['patternTooLong', 'tooManyProbes'];

/** A closed-set member, matched against a real array rather than indexed out
 * of an object table — the spelling is document-derived, so a prototype name
 * (`constructor`, `__proto__`) must never resolve to an inherited value. */
function asMember<T extends string>(v: unknown, allowed: readonly T[], what: string): T {
  const s = asString(v, what);
  const found = allowed.find((a) => a === s);
  if (found === undefined) {
    fail(`${what}: expected one of ${allowed.join(', ')}`);
  }
  return found;
}

/** `null` or a string — the shape serde gives an `Option<String>` with no
 * skip. `undefined` is refused too: a missing key means a response shape the
 * panel does not understand, not an absent value. */
function asNullableString(v: unknown, what: string): string | null {
  return v === null ? null : asString(v, what);
}

function toVariant(raw: unknown, what: string): FormatVariant {
  const v = asRecord(raw, what);
  return {
    spelling: asString(v.spelling, `${what}.spelling`),
    origin: asMember(v.origin, ORIGINS, `${what}.origin`),
    samples: asArray(v.samples, `${what}.samples`).map((s, n) =>
      asString(s, `${what}.samples[${n}]`),
    ),
  };
}

function toTypeEntry(raw: unknown, what: string): FormatTypeEntry {
  const t = asRecord(raw, what);
  return {
    fieldType: asString(t.fieldType, `${what}.fieldType`),
    fixed: asBoolean(t.fixed, `${what}.fixed`),
    variants: asArray(t.variants, `${what}.variants`).map((v, n) =>
      toVariant(v, `${what}.variants[${n}]`),
    ),
  };
}

function toProbeResult(raw: unknown, what: string): ProbeResult {
  const p = asRecord(raw, what);
  return {
    sample: asString(p.sample, `${what}.sample`),
    warning: asNullableString(p.warning, `${what}.warning`),
    refused: p.refused === null ? null : asMember(p.refused, REFUSALS, `${what}.refused`),
  };
}

/** Reads the engine's format-catalog JSON. */
export function toFormatCatalog(source: string): FormatCatalog {
  const root = asRecord(parseJson(source, 'format catalog'), 'format catalog');
  return {
    types: asArray(root.types, 'format catalog.types').map((t, n) =>
      toTypeEntry(t, `format catalog.types[${n}]`),
    ),
    probes: asArray(root.probes, 'format catalog.probes').map((p, n) =>
      toProbeResult(p, `format catalog.probes[${n}]`),
    ),
  };
}
