// The generator's BOUNDS layer: reading a schema node's numeric/length
// constraints, clamping a produced leaf to them, and reconciling an `example`
// with the field's declared type.
//
// The clamp lives here rather than in the synth because the GENERATOR owns the
// bounds: an injected `ValueSynth` is host code and may be hostile or buggy, so
// whatever it returns is clamped before it reaches params. Contradictory bounds
// are hostile input too — they resolve to a value, never a throw or a loop.

import type { SynthConstraints } from './synth';

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The schema node's numeric/length bounds (absent keys stay `undefined`). */
export function constraintsOf(schema: Record<string, unknown>): SynthConstraints {
  return {
    minimum: num(schema.minimum),
    maximum: num(schema.maximum),
    minLength: num(schema.minLength),
    maxLength: num(schema.maxLength),
  };
}

function clampNumber(n: number, c: SynthConstraints): number {
  // Contradictory bounds (min > max) are hostile input — fall back to the
  // lower bound rather than throwing or looping.
  if (c.minimum !== undefined && c.maximum !== undefined && c.minimum > c.maximum) {
    return c.minimum;
  }
  if (c.minimum !== undefined && n < c.minimum) {
    return c.minimum;
  }
  if (c.maximum !== undefined && n > c.maximum) {
    return c.maximum;
  }
  return n;
}

function clampString(s: string, c: SynthConstraints): string {
  let out = s;
  if (c.maxLength !== undefined && out.length > c.maxLength) {
    out = out.slice(0, c.maxLength);
  }
  if (c.minLength !== undefined && out.length < c.minLength) {
    out = out.padEnd(c.minLength, 'x');
  }
  return out;
}

/** Clamp a synth-produced value to the schema's constraints (defense against a
 * hostile/buggy synth — the generator, not the synth, owns the bounds). */
export function clampLeaf(value: unknown, c: SynthConstraints): unknown {
  if (typeof value === 'number') {
    return clampNumber(value, c);
  }
  if (typeof value === 'string') {
    return clampString(value, c);
  }
  return value;
}

/** Reconcile an example value with the field's declared type, so a loosely
 * typed schema (a `type: string` field whose example parsed as a number — a
 * leading-zero account number, say) still generates type-valid params. Only
 * the safe, lossless-ish coercions apply; anything else is returned as-is. */
export function coerceToType(value: unknown, type: unknown): unknown {
  if (type === 'string' && (typeof value === 'number' || typeof value === 'boolean')) {
    return String(value);
  }
  if ((type === 'number' || type === 'integer') && typeof value === 'string') {
    const n = Number(value);
    return value.trim() !== '' && Number.isFinite(n) ? n : value;
  }
  return value;
}
