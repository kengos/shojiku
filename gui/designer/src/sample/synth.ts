// The sample-data value-synthesis seam. Generation (`generate.ts`) walks the
// definitions schema and delegates the actual "make up a value" step to a
// `ValueSynth` — the host-injection point. The component ships only
// `baselineSynth` (deterministic, zero-dependency: type defaults that respect
// the schema constraints); a richer synth (the app wires a faker-backed one) is
// injected through the Designer, exactly like `fontFamilies` or the engine
// transport. A synth is called ONLY when the schema carries neither an
// `example` nor an `enum` — those win first — and its output is still clamped
// to the constraints by the generator, so a hostile or buggy synth can never
// produce an out-of-range value.

/** The constraint subset a synth may honor (the generator clamps regardless). */
export interface SynthConstraints {
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
}

/** What the generator asks a synth to produce: the JSON-schema `type`, the
 * open-vocabulary semantic `format` hint (`person-name`, `email`, `date`, …),
 * the dotted key path (a stable seed for deterministic output), the engine
 * locale (for locale-aware values), and the numeric/length constraints. */
export interface SynthSpec {
  readonly type: string;
  readonly format?: string;
  readonly keyPath: string;
  readonly locale: string;
  readonly constraints: SynthConstraints;
}

/** Produce a sample value for one leaf field. May throw — the generator
 * catches and falls back to `baselineSynth` for that field only. */
export type ValueSynth = (spec: SynthSpec) => unknown;

/** A stable non-cryptographic hash of a string (FNV-1a), used to seed
 * deterministic picks/values from a field's key path. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const DATE_FORMATS = new Set(['date', 'date-time']);

/** The built-in deterministic synth: a constant, constraint-shaped placeholder
 * per type. No randomness (the key-path seed only nudges the string suffix so
 * distinct fields differ), no dependency — the floor every host builds on. */
export const baselineSynth: ValueSynth = (spec) => {
  const { type, format, keyPath, constraints } = spec;
  if (type === 'boolean') {
    return false;
  }
  if (type === 'number' || type === 'integer') {
    if (constraints.minimum !== undefined) {
      return constraints.minimum;
    }
    if (constraints.maximum !== undefined && constraints.maximum < 0) {
      return constraints.maximum;
    }
    return 1;
  }
  // string (and any unknown type falls back to a string sample)
  if (format !== undefined && DATE_FORMATS.has(format)) {
    return '2026-01-01';
  }
  const suffix = String(hashKey(keyPath) % 100);
  const base = `Sample ${suffix}`;
  const min = constraints.minLength ?? 0;
  return base.length < min ? base.padEnd(min, 'x') : base;
};
