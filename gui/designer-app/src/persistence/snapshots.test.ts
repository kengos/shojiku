// Tests for snapshots.ts — the named-restore-point RING (refuse-at-cap,
// separate key from the draft). snapshotEntry.ts (the untrusted per-entry
// guard `parseSnapshot`) has no separate public surface and is pinned HERE
// through capture/list (invalid entries dropped, corrupted envelopes pruned).
import type { StoredSampleSet } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import type { SnapshotDraft } from './snapshotEntry';
import { MAX_SNAPSHOTS, SnapshotStore } from './snapshots';

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

/** A storage whose writes throw (quota) but reads/removes work, over a backing map. */
function readableButUnwritable(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: () => {
      throw new Error('quota');
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

const KEY = 'shojiku.snapshot.v1.p';

const lato: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

const sample: StoredSampleSet = {
  active: 'default',
  variants: [{ id: 'default', text: '{"a":1}' }],
};

function draft(over: Partial<SnapshotDraft> = {}): SnapshotDraft {
  return { name: 'point', createdAt: 1000, text: 'version: 0.1.0', fonts: [], ...over };
}

function seed(storage: Storage, snapshots: unknown[]): void {
  storage.setItem(KEY, JSON.stringify({ v: 1, snapshots }));
}

describe('SnapshotStore.capture', () => {
  it('captures a named point with its fonts and sample, prepended newest-first', async () => {
    const store = new SnapshotStore(memoryStorage());
    const first = await store.capture(
      'p',
      draft({ name: 'a', createdAt: 1000, fonts: [lato], sample }),
    );
    const second = await store.capture('p', draft({ name: 'b', createdAt: 2000 }));
    expect(first.ok && second.ok).toBe(true);
    const list = await store.list('p');
    expect(list.map((s) => s.name)).toEqual(['b', 'a']);
    expect(list[1]).toEqual({
      id: '1000',
      name: 'a',
      createdAt: 1000,
      text: 'version: 0.1.0',
      fonts: [lato],
      sample,
    });
  });

  it('disambiguates ids for captures in the same millisecond', async () => {
    const store = new SnapshotStore(memoryStorage());
    await store.capture('p', draft({ createdAt: 5 }));
    await store.capture('p', draft({ createdAt: 5 }));
    await store.capture('p', draft({ createdAt: 5 }));
    const ids = (await store.list('p')).map((s) => s.id).sort();
    expect(ids).toEqual(['5', '5-1', '5-2']);
  });

  it('refuses a capture when the ring is full', async () => {
    const store = new SnapshotStore(memoryStorage());
    for (let i = 0; i < MAX_SNAPSHOTS; i += 1) {
      expect((await store.capture('p', draft({ createdAt: i }))).ok).toBe(true);
    }
    const outcome = await store.capture('p', draft({ createdAt: 999 }));
    expect(outcome).toEqual({ ok: false, kind: 'full' });
    expect((await store.list('p')).length).toBe(MAX_SNAPSHOTS);
  });

  it('returns a typed error when the storage write fails (quota)', async () => {
    const store = new SnapshotStore(readableButUnwritable());
    expect(await store.capture('p', draft())).toEqual({ ok: false, kind: 'error' });
  });
});

describe('SnapshotStore.list', () => {
  it('is empty when nothing is stored', async () => {
    expect(await new SnapshotStore(memoryStorage()).list('p')).toEqual([]);
  });

  it('sorts stored points newest-first regardless of stored order', async () => {
    const storage = memoryStorage();
    seed(storage, [
      { id: 'a', name: 'a', createdAt: 100, text: 't', fonts: [] },
      { id: 'b', name: 'b', createdAt: 300, text: 't', fonts: [] },
    ]);
    expect((await new SnapshotStore(storage).list('p')).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('prunes a non-JSON entry to empty', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{not json');
    expect(await new SnapshotStore(storage).list('p')).toEqual([]);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('prunes a non-object envelope', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, 'null');
    expect(await new SnapshotStore(storage).list('p')).toEqual([]);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('prunes a wrong-version or non-array envelope', async () => {
    const bad = memoryStorage();
    bad.setItem(KEY, JSON.stringify({ v: 2, snapshots: [] }));
    expect(await new SnapshotStore(bad).list('p')).toEqual([]);
    const notArr = memoryStorage();
    notArr.setItem(KEY, JSON.stringify({ v: 1, snapshots: 'x' }));
    expect(await new SnapshotStore(notArr).list('p')).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', async () => {
    const storage = memoryStorage();
    const ok = { id: 'ok', name: 'ok', createdAt: 10, text: 't', fonts: [] };
    seed(storage, [
      ok,
      42,
      { id: '', name: 'n', createdAt: 1, text: 't', fonts: [] },
      { id: 'x'.repeat(65), name: 'n', createdAt: 1, text: 't', fonts: [] },
      { id: 'i', name: 5, createdAt: 1, text: 't', fonts: [] },
      { id: 'i', name: 'n', createdAt: Number.POSITIVE_INFINITY, text: 't', fonts: [] },
      { id: 'i', name: 'n', createdAt: 1, text: 5, fonts: [] },
      { id: 'i', name: 'n', createdAt: 1, text: 't', fonts: [{ packId: 'x' }] },
      {
        id: 'i',
        name: 'n',
        createdAt: 1,
        text: 't',
        fonts: [],
        sample: { active: 'z', variants: [] },
      },
    ]);
    expect((await new SnapshotStore(storage).list('p')).map((s) => s.id)).toEqual(['ok']);
  });

  it('rejects a text over the char cap', async () => {
    const storage = memoryStorage();
    seed(storage, [
      { id: 'a', name: 'a', createdAt: 1, text: 'x'.repeat(8 * 1024 * 1024 + 1), fonts: [] },
    ]);
    expect(await new SnapshotStore(storage).list('p')).toEqual([]);
  });

  it('clips an over-long name', async () => {
    const storage = memoryStorage();
    seed(storage, [{ id: 'a', name: 'z'.repeat(200), createdAt: 1, text: 't', fonts: [] }]);
    expect((await new SnapshotStore(storage).list('p'))[0].name.length).toBe(120);
  });

  it('caps a hostile over-long list at the ring size', async () => {
    const storage = memoryStorage();
    const many = Array.from({ length: MAX_SNAPSHOTS + 5 }, (_, i) => ({
      id: `s${i}`,
      name: `s${i}`,
      createdAt: i,
      text: 't',
      fonts: [],
    }));
    seed(storage, many);
    expect((await new SnapshotStore(storage).list('p')).length).toBe(MAX_SNAPSHOTS);
  });

  it('treats a __proto__ entry as inert data and never pollutes', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{"v":1,"snapshots":[{"__proto__":{"polluted":true}}]}');
    expect(await new SnapshotStore(storage).list('p')).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('SnapshotStore.remove', () => {
  it('deletes one point by id, keeping the rest', async () => {
    const store = new SnapshotStore(memoryStorage());
    await store.capture('p', draft({ createdAt: 1 }));
    await store.capture('p', draft({ createdAt: 2 }));
    await store.remove('p', '1');
    expect((await store.list('p')).map((s) => s.id)).toEqual(['2']);
  });

  it('is a no-op for an unknown id (no write)', async () => {
    const storage = memoryStorage();
    const store = new SnapshotStore(storage);
    await store.capture('p', draft({ createdAt: 1 }));
    const before = storage.getItem(KEY);
    await store.remove('p', 'ghost');
    expect(storage.getItem(KEY)).toBe(before);
  });

  it('drops the storage key when the last point is removed', async () => {
    const storage = memoryStorage();
    const store = new SnapshotStore(storage);
    await store.capture('p', draft({ createdAt: 1 }));
    await store.remove('p', '1');
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('swallows a shrink write failure (the point simply reappears)', async () => {
    const storage = readableButUnwritable({
      [KEY]: JSON.stringify({
        v: 1,
        snapshots: [
          { id: '1', name: 'a', createdAt: 1, text: 't', fonts: [] },
          { id: '2', name: 'b', createdAt: 2, text: 't', fonts: [] },
        ],
      }),
    });
    await expect(new SnapshotStore(storage).remove('p', '1')).resolves.toBeUndefined();
  });
});
