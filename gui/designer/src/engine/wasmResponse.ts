// What a wasm engine RESPONSE means: every field guard the transport runs over
// the engine's JSON / raw result, and the three readers built from them
// (diagnostics, a raw-page render outcome, a PDF outcome). A malformed shape —
// wrong type, a fractional page dimension, an RGBA buffer that does not match
// its declared area — becomes a `TransportError` here rather than blowing up
// later inside `new ImageData` mid-commit.

import { type PdfOutcome, type RenderOutcome, TransportError } from './transport';
import type { Diagnostic, Diagnostics, InspectEnvelope, RawPage } from './types';

function fail(what: string): never {
  throw new TransportError(what);
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    fail(`${what}: expected an object`);
  }
  return v as Record<string, unknown>;
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number') {
    fail(`${what}: expected a number`);
  }
  return v;
}

function asBoolean(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') {
    fail(`${what}: expected a boolean`);
  }
  return v;
}

function asString(v: unknown, what: string): string {
  if (typeof v !== 'string') {
    fail(`${what}: expected a string`);
  }
  return v;
}

function asArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) {
    fail(`${what}: expected an array`);
  }
  return v;
}

function parseJson(source: string, what: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    fail(`${what}: malformed JSON`);
  }
}

function asPageDim(v: unknown, what: string): number {
  const n = asNumber(v, what);
  // A fractional/non-positive dimension can pass the area check below on
  // crafted values and then blow up later inside `new ImageData` mid-commit —
  // reject it here where it degrades to a TransportError instead.
  if (!Number.isInteger(n) || n <= 0) {
    fail(`${what}: expected a positive integer`);
  }
  return n;
}

function toPage(v: unknown, index: number): RawPage {
  const o = asRecord(v, `pages[${index}]`);
  const width = asPageDim(o.width, `pages[${index}].width`);
  const height = asPageDim(o.height, `pages[${index}].height`);
  const rgba = o.rgba;
  if (!(rgba instanceof Uint8Array)) {
    fail(`pages[${index}].rgba: expected a Uint8Array`);
  }
  // Hostile/mismatched buffer guard: a page's byte count MUST equal its pixel
  // area — never trust a declared dimension against the actual buffer.
  if (rgba.length !== width * height * 4) {
    fail(`pages[${index}].rgba: length ${rgba.length} != ${width * height * 4}`);
  }
  return { width, height, rgba };
}

export function toDiagnostics(source: string): Diagnostics {
  const parsed = asRecord(parseJson(source, 'diagnostics'), 'diagnostics');
  const items = asArray(parsed.items, 'diagnostics.items');
  // Item shapes are trusted post-parse (the engine owns them); the canvas reads
  // them read-only and React escapes every string it renders.
  return { items: items as Diagnostic[] };
}

export function toOutcome(raw: unknown): RenderOutcome {
  const o = asRecord(raw, 'render result');
  const ok = asBoolean(o.ok, 'ok');
  const pages = asArray(o.pages, 'pages').map(toPage);
  const inspect =
    o.inspect === null
      ? null
      : (parseJson(asString(o.inspect, 'inspect'), 'inspect') as InspectEnvelope);
  const diagnostics = toDiagnostics(asString(o.diagnostics, 'diagnostics'));
  return { ok, pages, inspect, diagnostics };
}

export function toPdfOutcome(raw: unknown): PdfOutcome {
  const o = asRecord(raw, 'pdf result');
  const ok = asBoolean(o.ok, 'ok');
  const pdf = o.pdf;
  if (!(pdf instanceof Uint8Array)) {
    fail('pdf: expected a Uint8Array');
  }
  // An `ok` render with no bytes would mean the engine claimed a deliverable
  // it did not produce — refuse it rather than hand the host an empty file.
  if (ok && pdf.length === 0) {
    fail('pdf: an ok render produced no bytes');
  }
  return { ok, pdf, diagnostics: toDiagnostics(asString(o.diagnostics, 'diagnostics')) };
}
