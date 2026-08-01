import { describe, expect, it, vi } from 'vitest';
import type { FontIndex } from '../assets/manifest';
import { fetchFace, MAX_FACE_BYTES, makeFontSource, packIdsByTier } from './fontSource';

const index: FontIndex = {
  packs: {
    'noto-sans': { tier: 'primary', files: { 'r.ttf': { name: 'r.ttf', size: 10 } } },
    'biz-ud': { tier: 'primary', files: { 'b.ttf': { name: 'b.ttf', size: 20 } } },
    'ipamj-mincho': {
      tier: 'lazy',
      files: {
        'big.ttf': { name: 'big.ttf', size: 30, parts: ['big.ttf.part00', 'big.ttf.part01'] },
      },
    },
  },
};

describe('packIdsByTier', () => {
  it('returns the tier members sorted', () => {
    expect(packIdsByTier(index, 'primary')).toEqual(['biz-ud', 'noto-sans']);
    expect(packIdsByTier(index, 'lazy')).toEqual(['ipamj-mincho']);
  });
});

describe('fetchFace', () => {
  it('fetches a whole (unchunked) face', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const bytes = await fetchFace(fetchBytes, 'https://x/', 'noto-sans', {
      name: 'r.ttf',
      size: 3,
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(fetchBytes).toHaveBeenCalledWith('https://x/fonts/noto-sans/r.ttf');
  });

  it('reassembles a chunked face byte-exactly, in order', async () => {
    const fetchBytes = vi.fn(async (url: string) =>
      url.endsWith('part00') ? new Uint8Array([1, 2]) : new Uint8Array([3, 4, 5]),
    );
    const bytes = await fetchFace(fetchBytes, 'https://x/', 'ipamj-mincho', {
      name: 'big.ttf',
      size: 5,
      parts: ['big.ttf.part00', 'big.ttf.part01'],
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects a declared size over the cap before fetching', async () => {
    const fetchBytes = vi.fn();
    await expect(
      fetchFace(fetchBytes, 'https://x/', 'p', { name: 'huge.ttf', size: MAX_FACE_BYTES + 1 }),
    ).rejects.toThrow(/size cap/);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('rejects when the fetched bytes exceed the cap mid-assembly', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array(MAX_FACE_BYTES));
    await expect(
      fetchFace(fetchBytes, 'https://x/', 'p', {
        name: 'big.ttf',
        size: MAX_FACE_BYTES,
        parts: ['big.ttf.part00', 'big.ttf.part01'],
      }),
    ).rejects.toThrow(/size cap/);
  });
});

describe('makeFontSource', () => {
  const fetchText = vi.fn(async () => 'manifest-yaml');
  const fetchBytes = vi.fn(async () => new Uint8Array([9]));
  const fonts = makeFontSource({ fetchText, fetchBytes, base: 'https://x/', index });

  it('fetches a pack manifest at the fixed path', async () => {
    expect(await fonts.manifest('biz-ud')).toBe('manifest-yaml');
    expect(fetchText).toHaveBeenCalledWith('https://x/fonts/biz-ud/manifest.yml');
  });

  it('fetches a face via the index entry', async () => {
    const bytes = await fonts.face('noto-sans', 'r.ttf');
    expect(Array.from(bytes)).toEqual([9]);
  });

  it('rejects a face missing from the index', async () => {
    await expect(fonts.face('noto-sans', 'nope.ttf')).rejects.toThrow(/not in the index/);
  });

  it('rejects a face in an unindexed pack', async () => {
    await expect(fonts.face('unknown', 'r.ttf')).rejects.toThrow(/not in the index/);
  });
});
