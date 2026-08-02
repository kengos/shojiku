import { describe, expect, it } from 'vitest';
import { chainFontSources, collectFontSources, type FontSource } from './fonts';

function source(tag: string, packs: readonly string[]): FontSource {
  return {
    manifest: async (packId) => {
      if (!packs.includes(packId)) {
        throw new Error(`${tag}: no manifest ${packId}`);
      }
      return `${tag}:${packId}`;
    },
    face: async (packId, file) => {
      if (!packs.includes(packId)) {
        throw new Error(`${tag}: no face ${packId}`);
      }
      return new TextEncoder().encode(`${tag}:${packId}/${file}`);
    },
  };
}

describe('collectFontSources', () => {
  it('collects sources in call order and returns copies', () => {
    const collector = collectFontSources();
    const a = source('a', []);
    const b = source('b', []);
    collector.ctx.addSource(a);
    collector.ctx.addSource(b);
    collector.close();
    const sources = collector.sources();
    expect(sources).toEqual([a, b]);
    expect(collector.sources()).not.toBe(sources);
  });

  it('throws on a contribution after the event fired', () => {
    const collector = collectFontSources();
    collector.close();
    expect(() => collector.ctx.addSource(source('late', []))).toThrowError(/already fired/);
  });
});

describe('chainFontSources', () => {
  it('answers from the FIRST source that resolves (registration order wins)', async () => {
    const chained = chainFontSources([source('app', ['noto']), source('pkg', ['noto', 'extra'])]);
    await expect(chained.manifest('noto')).resolves.toBe('app:noto');
  });

  it('falls through a rejecting source to the next', async () => {
    const chained = chainFontSources([source('app', ['noto']), source('pkg', ['extra'])]);
    await expect(chained.manifest('extra')).resolves.toBe('pkg:extra');
    await expect(chained.face('extra', 'r.ttf')).resolves.toEqual(
      new TextEncoder().encode('pkg:extra/r.ttf'),
    );
  });

  it('propagates the LAST rejection when every source misses', async () => {
    const chained = chainFontSources([source('app', []), source('pkg', [])]);
    await expect(chained.manifest('ghost')).rejects.toThrowError('pkg: no manifest ghost');
  });

  it('throws a no-source error on an empty chain, naming the request', async () => {
    const chained = chainFontSources([]);
    await expect(chained.manifest('ghost')).rejects.toThrowError(
      'no font source resolved manifest ghost',
    );
    await expect(chained.face('ghost', 'r.ttf')).rejects.toThrowError(
      'no font source resolved face ghost/r.ttf',
    );
  });
});
