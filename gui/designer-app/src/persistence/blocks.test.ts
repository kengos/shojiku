import type { SavedBlock } from '@shojiku/designer';
import { describe, expect, it, vi } from 'vitest';
import { BlockStore } from './blocks';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const KEY = 'shojiku.blocks.v1';
const BLOCK: SavedBlock = { id: 'block-1', name: '社判＋住所', value: { type: 'container' } };

describe('BlockStore', () => {
  it('round-trips a saved library', () => {
    const store = new BlockStore(memoryStorage());
    expect(store.save([BLOCK]).ok).toBe(true);
    expect(store.load()).toEqual([BLOCK]);
  });

  it('reads an empty library when the key is absent', () => {
    expect(new BlockStore(memoryStorage()).load()).toEqual([]);
  });

  it('sanitizes hostile stored entries on load (salvaging the valid ones)', () => {
    const storage = memoryStorage();
    storage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        blocks: [BLOCK, { id: '__proto__', name: 'reserved', value: { type: 'text' } }],
      }),
    );
    expect(new BlockStore(storage).load()).toEqual([BLOCK]);
  });

  it('degrades to an empty library on unparseable JSON', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{not json');
    expect(new BlockStore(storage).load()).toEqual([]);
  });

  it('degrades to an empty library on a non-object envelope', () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '"a string"');
    expect(new BlockStore(storage).load()).toEqual([]);
  });

  it('returns a typed error outcome when the storage write throws (quota)', () => {
    const storage = memoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(new BlockStore(storage).save([BLOCK])).toEqual({ ok: false, kind: 'error' });
  });
});
