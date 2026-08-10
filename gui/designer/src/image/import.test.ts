import { describe, expect, it, vi } from 'vitest';
import { composeDataUri } from './dataUri';
import { type ImageCodec, importImageFile } from './import';
import { DEFAULT_IMAGE_BUDGETS, type ImageBudgets } from './model';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function pngOf(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength).fill(0x00);
  bytes.set(PNG_HEADER, 0);
  return bytes;
}

function gifOf(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength).fill(0x00);
  bytes.set(GIF_HEADER, 0);
  return bytes;
}

function svgOf(byteLength: number): Uint8Array {
  const head = '<svg xmlns="http://www.w3.org/2000/svg">';
  const bytes = new Uint8Array(byteLength).fill(0x20);
  bytes.set(new TextEncoder().encode(head), 0);
  return bytes;
}

/** A codec whose behavior each test tailors; unused hooks reject loudly so a
 * miswired path fails rather than silently passing. */
function fakeCodec(over: Partial<ImageCodec>): ImageCodec {
  return {
    read: over.read ?? (async () => new Uint8Array()),
    probe: over.probe ?? (async () => ({ w: 10, h: 10 })),
    reencode: over.reencode ?? (async () => new Uint8Array([0x89])),
    ...over,
  };
}

const budgets: ImageBudgets = {
  ...DEFAULT_IMAGE_BUDGETS,
  maxImageBytes: 1000,
  maxPixels: 100_000_000,
};
const blob = new Blob([]);

describe('importImageFile', () => {
  it('refuses when reading the file rejects', async () => {
    const codec = fakeCodec({
      read: async () => {
        throw new Error('read failed');
      },
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'decode_failed',
    });
  });

  it('refuses an unsupported format (bytes decide, not the file name)', async () => {
    const codec = fakeCodec({ read: async () => new TextEncoder().encode('<html></html>') });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
  });

  it('accepts an SVG within budget as an inert data URI', async () => {
    const codec = fakeCodec({ read: async () => svgOf(500) });
    const out = await importImageFile(blob, codec, budgets);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.kind).toBe('svg');
      expect(out.intrinsic).toBeNull();
      expect(out.downscaled).toBe(false);
      expect(out.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    }
  });

  it('refuses an over-budget SVG without rasterizing', async () => {
    const codec = fakeCodec({ read: async () => svgOf(2000) });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'svg_too_large',
    });
  });

  it('refuses a raster whose dimensions cannot be probed', async () => {
    const codec = fakeCodec({ read: async () => pngOf(500), probe: async () => null });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'decode_failed',
    });
  });

  it('refuses when probing rejects', async () => {
    const codec = fakeCodec({
      read: async () => pngOf(500),
      probe: async () => {
        throw new Error('probe failed');
      },
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'decode_failed',
    });
  });

  it('refuses an over-pixel-area raster', async () => {
    const codec = fakeCodec({
      read: async () => pngOf(500),
      probe: async () => ({ w: 20000, h: 20000 }),
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'dimensions',
    });
  });

  it('accepts a within-budget raster unchanged', async () => {
    const reencode = vi.fn();
    const codec = fakeCodec({
      read: async () => pngOf(500),
      probe: async () => ({ w: 100, h: 80 }),
      reencode,
    });
    const out = await importImageFile(blob, codec, budgets);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.downscaled).toBe(false);
      expect(out.intrinsic).toEqual({ w: 100, h: 80 });
    }
    expect(reencode).not.toHaveBeenCalled();
  });

  it('downscales an over-byte-budget raster and reports the new dimensions', async () => {
    const codec = fakeCodec({
      read: async () => pngOf(5000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode: async (_b, _k, target) => {
        expect(target).toEqual({ w: 2048, h: 1024 });
        return pngOf(800);
      },
    });
    const out = await importImageFile(blob, codec, budgets);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.downscaled).toBe(true);
      expect(out.intrinsic).toEqual({ w: 2048, h: 1024 });
    }
  });

  it('refuses when re-encoding rejects or returns null', async () => {
    const rejecting = fakeCodec({
      read: async () => pngOf(5000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode: async () => {
        throw new Error('canvas failed');
      },
    });
    expect(await importImageFile(blob, rejecting, budgets)).toEqual({
      ok: false,
      reason: 'decode_failed',
    });

    const nulling = fakeCodec({
      read: async () => pngOf(5000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode: async () => null,
    });
    expect(await importImageFile(blob, nulling, budgets)).toEqual({
      ok: false,
      reason: 'decode_failed',
    });
  });

  it('refuses when the re-encode still exceeds the byte budget', async () => {
    const codec = fakeCodec({
      read: async () => pngOf(5000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode: async () => pngOf(2000),
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it('carries a GIF through VERBATIM, never through the re-encoder', async () => {
    const bytes = gifOf(500);
    const reencode = vi.fn(async () => new Uint8Array([0x89]));
    const codec = fakeCodec({
      read: async () => bytes,
      probe: async () => ({ w: 120, h: 80 }),
      reencode,
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: true,
      kind: 'gif',
      src: composeDataUri('gif', bytes),
      intrinsic: { w: 120, h: 80 },
      downscaled: false,
    });
    // The whole point of the verbatim path: the animation survives because
    // nothing re-encoded it.
    expect(reencode).not.toHaveBeenCalled();
  });

  it('refuses an over-budget GIF instead of quietly converting it', async () => {
    const reencode = vi.fn(async () => pngOf(100));
    const codec = fakeCodec({
      read: async () => gifOf(5000),
      probe: async () => ({ w: 4000, h: 2000 }),
      reencode,
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(reencode).not.toHaveBeenCalled();
  });

  it('refuses a file whose DECLARED type is an image but whose bytes are not', async () => {
    // The clipboard and the file picker both hand over a declared MIME; only
    // the bytes decide, so an HTML payload named `.png` never reaches a canvas.
    const codec = fakeCodec({
      read: async () => new TextEncoder().encode('<html><body>not an image</body></html>'),
    });
    expect(await importImageFile(blob, codec, budgets)).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
  });
});
