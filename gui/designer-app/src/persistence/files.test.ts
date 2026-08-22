import { describe, expect, it } from 'vitest';
import {
  buildExport,
  buildPdfExport,
  type FileLike,
  MAX_OPEN_BYTES,
  openText,
  safeDocumentStem,
} from './files';

function file(name: string, size: number, text: string): FileLike {
  return { name, size, text: async () => text };
}

describe('openText', () => {
  it('reads a file under the size cap', async () => {
    expect(await openText(file('t.yml', 100, 'version: 0.1.0'))).toBe('version: 0.1.0');
  });

  it('rejects a file over the size cap before reading', async () => {
    await expect(openText(file('huge.yml', MAX_OPEN_BYTES + 1, 'x'))).rejects.toThrow(/too large/);
  });
});

describe('buildExport', () => {
  it('composes a safe filename from a clean id', () => {
    expect(buildExport('genkoyoshi-ja', 'body')).toEqual({
      filename: 'genkoyoshi-ja-templates.yml',
      text: 'body',
    });
  });

  it('sanitizes unsafe characters in the id', () => {
    expect(buildExport('My Preset!', 'x').filename).toBe('my-preset-templates.yml');
  });

  it('falls back to a default stem when nothing safe remains', () => {
    expect(buildExport('///', 'x').filename).toBe('template-templates.yml');
  });
});

describe('buildPdfExport', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('names the file after the document', () => {
    expect(buildPdfExport('Receipt 2026', bytes)).toEqual({
      filename: 'receipt-2026.pdf',
      bytes,
    });
  });

  it.each([
    ['a traversal attempt', '../../evil', 'evil.pdf'],
    ['separators', 'a/b\\c', 'a-b-c.pdf'],
    ['control characters', 'in\u0001voice', 'in-voice.pdf'],
    ['a leading dot', '.hidden', 'hidden.pdf'],
    ['a dot run', 'a..b', 'a.b.pdf'],
    ['an all-punctuation name', '///', 'template.pdf'],
    ['an empty name', '', 'template.pdf'],
    ['a prototype-ish name (a file name is not an object key)', '__proto__', '__proto__.pdf'],
  ])('reduces %s to a safe file name', (_case, name, expected) => {
    expect(buildPdfExport(name, bytes).filename).toBe(expected);
  });

  it('keeps the bytes untouched', () => {
    expect(buildPdfExport('x', bytes).bytes).toBe(bytes);
  });
});

describe('safeDocumentStem', () => {
  // The defect this exists for: the old ASCII-only charset deleted the whole
  // name and fell back to `template`, on a product shipping ja / zh / hi.
  it.each([
    ['a Japanese name', '領収書', '領収書'],
    ['a Japanese name with a parenthetical', '白紙 (A4)', '白紙-(a4)'],
    ['a mixed name', '請求書 2026', '請求書-2026'],
    ['a Chinese name', '收據', '收據'],
    ['a Hindi name', 'रसीद', 'रसीद'],
  ])('keeps %s', (_case, name, expected) => {
    expect(safeDocumentStem(name)).toBe(expected);
  });

  // Admitting non-ASCII is what makes this reachable: U+202E reverses how the
  // REST of the name displays, so a crafted name can show an extension the
  // file does not have. It must never survive into a download name.
  it('strips a right-to-left override rather than letting it reverse the extension', () => {
    const spoofed = `invoice\u202Efdp.exe`;
    expect(safeDocumentStem(spoofed)).toBe('invoice-fdp.exe');
    expect(safeDocumentStem(spoofed)).not.toContain('\u202E');
  });

  // ZWNJ and ZWJ are zero-width too and are deliberately NOT stripped: they
  // carry meaning in Devanagari and in emoji sequences, which is exactly the
  // kind of name this function now exists to keep.
  it.each([
    ['a zero-width non-joiner', 'a\u200Cb', 'a\u200Cb'],
    ['a zero-width joiner', 'a\u200Db', 'a\u200Db'],
  ])('keeps %s, which can be part of the writing system', (_case, name, expected) => {
    expect(safeDocumentStem(name)).toBe(expected);
  });

  it.each([
    ['a bidi isolate', 'a\u2066b', 'a-b'],
    ['a left-to-right mark', 'a\u200Eb', 'a-b'],
    ['a right-to-left mark', 'a\u200Fb', 'a-b'],
    ['a zero-width space', 'a\u200Bb', 'a-b'],
    ['a word joiner', 'a\u2060b', 'a-b'],
    ['a byte-order mark', 'a\uFEFFb', 'a-b'],
    // The Arabic sibling of U+200F, and the one a hand-listed set missed —
    // reachable precisely BECAUSE this change admits Arabic names.
    ['an Arabic letter mark', 'a\u061Cb', 'a-b'],
    ['a soft hyphen', 'a\u00ADb', 'a-b'],
    ['an invisible separator', 'a\u2063b', 'a-b'],
    ['a C1 control', 'a\u0085b', 'a-b'],
    ['a NUL', 'a\u0000b', 'a-b'],
    ['a newline', 'a\nb', 'a-b'],
    ['Windows-forbidden punctuation', 'a<b>c:d"e|f?g*h', 'a-b-c-d-e-f-g-h'],
  ])('strips %s', (_case, name, expected) => {
    expect(safeDocumentStem(name)).toBe(expected);
  });

  // A rename is clipped at 120 CHARACTERS; one CJK character is three UTF-8
  // bytes, so a legal rename can still be ~360 bytes — past what a filesystem
  // takes for a single name.
  // A NAME a filesystem cannot write is the only reason the cap exists, so it
  // is 255 minus `.pdf` — not a smaller number, which would truncate names
  // that are perfectly writable and that the rule this replaces never touched.
  it('leaves a long ASCII name alone, since it is a name a filesystem takes', () => {
    const long = 'a'.repeat(200);
    expect(safeDocumentStem(long)).toBe(long);
  });

  it('caps the stem by BYTES, not characters, and cuts on a code-point boundary', () => {
    // 120 CJK characters is the rename cap and ~360 bytes — over the bound.
    const long = '領'.repeat(120);
    const stem = safeDocumentStem(long);
    const bytes = new TextEncoder().encode(stem);
    expect(bytes.length).toBeLessThanOrEqual(251);
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(251);
    expect(bytes.length).toBeGreaterThan(0);
    // Re-decoding is what proves no character was cut in half: a split
    // sequence would come back as U+FFFD.
    expect(new TextDecoder().decode(bytes)).toBe(stem);
    expect(stem).not.toContain('\uFFFD');
  });

  it('cuts an astral character whole rather than leaving half a surrogate pair', () => {
    // 𠮷 is 4 UTF-8 bytes, so 63 of them (252) straddle the 251-byte budget.
    const stem = safeDocumentStem('𠮷'.repeat(63));
    expect(new TextEncoder().encode(stem).length).toBe(248);
    expect([...stem]).toHaveLength(62);
  });

  it('leaves a short name untouched rather than walking it character by character', () => {
    expect(safeDocumentStem('invoice')).toBe('invoice');
  });

  it('tidies a separator the byte cut exposes', () => {
    // The cut lands mid-name and the character before it is a dash, which
    // would otherwise be left ending the file name.
    const stem = safeDocumentStem(`${'a'.repeat(250)} tail`);
    expect(stem).toBe('a'.repeat(250));
  });

  it('falls back to a stem that is not empty', () => {
    expect(safeDocumentStem('\u0000\u202E')).toBe('template');
  });
});

describe('the two stems are separate rules', () => {
  // `safeStem` serves build-validated preset IDS and may narrow to ASCII;
  // `safeDocumentStem` serves the user's own document name and may not. One
  // input that both accept but stem DIFFERENTLY is what proves the split is
  // real rather than one function called from two places.
  it('reduces the same name differently for a preset id and a document name', () => {
    expect(buildExport('請求書', 'x').filename).toBe('template-templates.yml');
    expect(buildPdfExport('請求書', new Uint8Array()).filename).toBe('請求書.pdf');
  });
});
