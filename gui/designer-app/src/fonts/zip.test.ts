import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip';

/** Read the entry names + bodies back out of a store-only ZIP by walking the
 * local headers — a real reader's view, so the test proves the container is
 * well-formed rather than re-asserting the writer's own arithmetic. */
function readZip(bytes: Uint8Array): { path: string; text: string }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out: { path: string; text: string }[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const bodyStart = nameStart + nameLen + extraLen;
    out.push({
      path: decoder.decode(bytes.subarray(nameStart, nameStart + nameLen)),
      text: decoder.decode(bytes.subarray(bodyStart, bodyStart + size)),
    });
    offset = bodyStart + size;
  }
  return out;
}

describe('crc32', () => {
  it('matches the known vector for "123456789"', () => {
    // The standard CRC-32/IEEE check value.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('buildZip', () => {
  it('round-trips entries a reader can walk', () => {
    const entries = [
      { path: 'templates.yml', text: 'version: 1\n' },
      { path: 'packs/fonts/gf-lato/manifest.yml', text: 'faces: []\n' },
    ];
    expect(readZip(buildZip(entries))).toEqual(entries);
  });

  it('records each entry CRC in its local header', () => {
    const text = 'hello';
    const bytes = buildZip([{ path: 'a.txt', text }]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(14, true)).toBe(crc32(new TextEncoder().encode(text)));
  });

  it('writes one central-directory record per entry', () => {
    const bytes = buildZip([
      { path: 'a.txt', text: 'a' },
      { path: 'b.txt', text: 'b' },
    ]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // End-of-central-directory: the entry count fields.
    const eocd = bytes.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 8, true)).toBe(2);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
  });

  it('is deterministic: the same kit twice is the same bytes', () => {
    const entries = [{ path: 'a.txt', text: 'a' }];
    expect(buildZip(entries)).toEqual(buildZip(entries));
  });

  it('handles an empty entry list', () => {
    const bytes = buildZip([]);
    expect(bytes.length).toBe(22);
    expect(readZip(bytes)).toEqual([]);
  });

  it('encodes multi-byte text by its UTF-8 length, not its character count', () => {
    const entries = [{ path: 'readme.md', text: '日本語' }];
    expect(readZip(buildZip(entries))).toEqual(entries);
  });
});
