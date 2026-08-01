// Tests for sniff.ts — what an image IS, decided by its BYTES: the v1 kind
// set, magic-byte / root-element sniffing, and the mislabelled-payload
// refusals. (`sniffImage` is re-exported through model.ts; this pins the
// sniffer itself.)
import { describe, expect, it } from 'vitest';
import { sniffImage } from './sniff';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('sniffImage', () => {
  it('recognizes PNG and JPEG by magic bytes', () => {
    expect(sniffImage(PNG)).toBe('png');
    expect(sniffImage(JPEG)).toBe('jpeg');
  });

  it('recognizes SVG text, including BOM / XML-declaration / comment / doctype prefixes', () => {
    expect(sniffImage(utf8('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
    expect(sniffImage(utf8('﻿  <svg></svg>'))).toBe('svg');
    expect(sniffImage(utf8('<?xml version="1.0"?>\n<svg/>'))).toBe('svg');
    expect(sniffImage(utf8('<!-- a comment --> <svg></svg>'))).toBe('svg');
    expect(sniffImage(utf8('<!DOCTYPE svg><svg></svg>'))).toBe('svg');
    expect(sniffImage(utf8('<svg:svg></svg:svg>'))).toBe('svg');
  });

  it('rejects a non-SVG XML / HTML document even with an image file name', () => {
    expect(sniffImage(utf8('<html><body>hi</body></html>'))).toBeNull();
    expect(sniffImage(utf8('<?xml version="1.0"?><rss></rss>'))).toBeNull();
    expect(sniffImage(utf8('<svgfoo></svgfoo>'))).toBeNull();
  });

  it('rejects an unterminated prologue that never reaches an <svg> element', () => {
    expect(sniffImage(utf8('<?xml version="1.0"'))).toBeNull();
    expect(sniffImage(utf8('<!-- unterminated comment'))).toBeNull();
    expect(sniffImage(utf8('<!DOCTYPE svg PUBLIC'))).toBeNull();
  });

  it('rejects GIF and WebP (outside the v1 set)', () => {
    expect(sniffImage(utf8('GIF89a...'))).toBeNull();
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImage(webp)).toBeNull();
  });

  it('rejects truncated magic and empty input', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});
