import { describe, expect, it } from 'vitest';
import { buildExport, buildPdfExport, type FileLike, MAX_OPEN_BYTES, openText } from './files';

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
