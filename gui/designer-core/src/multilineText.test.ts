// What a GUI-written line break becomes on disk. The Designer authors a break
// as a real `\n` inside the scalar, so the shape `yaml` gives those strings IS
// the wire — and, more to the point, is what the next person to hand-edit the
// file has to read. `setLeaf` asks for a block literal so that shape is always
// the one whose breaks are visible AS breaks; the forms below were read out of
// the serializer, not predicted, and every one of them must round-trip.

import { describe, expect, it } from 'vitest';
import { parseTemplate, readTemplate, serializeTemplate } from './document';
import { applyOp } from './ops';

const HEAD = 'version: 0.1.0\nname: receipt\n';
/** A document that already HOLDS `text:` — the in-place branch, where `map.set`
 * mutates the existing scalar node. */
const EXISTING = `${HEAD}text: one\n`;

/** Write `value` at `text:` and hand back the serialized file, minus the
 * unchanging header. */
function write(value: string, source = EXISTING): string {
  const doc = parseTemplate(source);
  expect(applyOp(doc, { op: 'setScalar', keys: ['text'], value })).toEqual({ ok: true });
  return serializeTemplate(doc).slice(HEAD.length);
}

/** The value `text:` reads back as, once the written file is re-parsed. */
function readBack(body: string): unknown {
  const source = HEAD + body;
  expect(serializeTemplate(parseTemplate(source))).toBe(source);
  return (readTemplate(parseTemplate(source)) as Record<string, unknown>).text;
}

/** Assert both halves at once: the exact bytes written, and that re-opening the
 * file gives the authored string back. A form nobody can read is as bad as one
 * that loses data, so neither assertion stands alone. */
function expectWritten(value: string, body: string, source = EXISTING): void {
  expect(write(value, source)).toBe(body);
  expect(readBack(body)).toBe(value);
}

describe('a multi-line value is authored as a block literal', () => {
  it('writes one over an existing key', () => {
    expectWritten('one\ntwo\nthree', 'text: |-\n  one\n  two\n  three\n');
  });

  it('writes one for a key the document did not have', () => {
    // The other branch: a newly-added key is stored as a RAW STRING on the
    // pair, not a scalar node, so the type cannot simply be set on it.
    expectWritten('one\ntwo\nthree', 'text: |-\n  one\n  two\n  three\n', HEAD);
  });

  it('leaves a single-line value alone', () => {
    // The control. Were the rule unconditional, every short label in every
    // bundled example would be rewritten as a block on its first edit.
    expectWritten('just one', 'text: just one\n');
  });

  it('keeps an ANCHOR on the value it overwrites, so an alias still resolves', () => {
    // Asking for a block literal means replacing the value NODE. An anchor
    // dropped in that swap does not fail here — it makes the next `toString()`
    // throw "Unresolved alias" on a document this op reported writing.
    const source = `${HEAD}text: &t one\nother: *t\n`;
    const doc = parseTemplate(source);
    expect(applyOp(doc, { op: 'setScalar', keys: ['text'], value: 'a\nb' })).toEqual({ ok: true });
    expect(() => serializeTemplate(doc)).not.toThrow();
    expect(serializeTemplate(doc).slice(HEAD.length)).toBe('text: &t |-\n  a\n  b\nother: *t\n');
  });

  it('keeps a comment sitting on the value it overwrites', () => {
    expect(write('a\nb', `${HEAD}text: one # keep me\n`)).toBe('text: |- # keep me\n  a\n  b\n');
  });
});

describe('the shapes a block literal has to bend for', () => {
  it('keeps the final break with the clip indicator', () => {
    // `|-` would strip it; `yaml` picks `|` on its own so the value survives.
    expectWritten('one\ntwo\n', 'text: |\n  one\n  two\n');
  });

  it('carries a trailing space inside the value', () => {
    expectWritten('one \ntwo', 'text: |-\n  one \n  two\n');
  });

  it('carries a trailing space at the very end', () => {
    expectWritten('one\ntwo ', 'text: |-\n  one\n  two \n');
  });

  it('carries a whitespace-only line', () => {
    expectWritten('one\n   \ntwo', 'text: |-\n  one\n     \n  two\n');
  });

  it('carries a tab', () => {
    expectWritten('one\n\ttwo', 'text: |-\n  one\n  \ttwo\n');
  });

  it('falls back to a quoted form for a value no block literal can spell', () => {
    // A carriage return is the one this reaches in practice — a paste out of a
    // Windows-authored document. The request is a PREFERENCE, so `yaml` answers
    // it with a form that round-trips rather than an unreadable block; the fix
    // can therefore never author a file that fails to reopen.
    expectWritten('one\r\ntwo', 'text: "one\\r\\ntwo"\n');
  });
});

describe('the wire the engine then reads', () => {
  it('is the authored string, break for break', () => {
    // The engine takes `\n` as a hard paragraph break, so the count is the
    // contract: three authored lines must reach it as three.
    const value = '東京都渋谷区1-2-3\nシブヤビル 5F\n〒150-0001';
    const back = readBack(write(value));
    expect(back).toBe(value);
    expect(String(back).split('\n')).toHaveLength(3);
  });

  it('survives a value holding an interpolation and a colon', () => {
    // Both used to flip the serializer to a different shape than a plain
    // address got; now they do not.
    expectWritten(
      '{customer.name} 様\n住所: 東京',
      'text: |-\n  {customer.name} 様\n  住所: 東京\n',
    );
  });
});
