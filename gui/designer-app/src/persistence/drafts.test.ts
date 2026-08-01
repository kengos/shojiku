// Tests for drafts.ts — the LOCAL working-copy store around the envelope.
// draftEnvelope.ts (build/parse of the versioned envelope, the v1…v6 read
// ladder) has no separate public surface and is pinned HERE through
// save/load round-trips and the malformed-payload misses.
import { describe, expect, it, vi } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import { DraftStore } from './drafts';

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

const KEY = 'shojiku.draft.v1.p';

const lato: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

describe('DraftStore', () => {
  it('round-trips a saved draft with its fonts', async () => {
    const store = new DraftStore(memoryStorage());
    expect((await store.save('p', { text: 'version: 0.1.0', fonts: [lato] })).ok).toBe(true);
    expect(await store.load('p')).toEqual({ text: 'version: 0.1.0', fonts: [lato] });
  });

  it('round-trips an empty font list', async () => {
    const store = new DraftStore(memoryStorage());
    await store.save('p', { text: 'x', fonts: [] });
    expect(await store.load('p')).toEqual({ text: 'x', fonts: [] });
  });

  it('round-trips a revision token when the draft carries one', async () => {
    // A working copy of a mounted host's document remembers the revision it
    // was based on, so a crash-restored draft still saves with concurrency
    // intact; a rev-less draft stays rev-less.
    const store = new DraftStore(memoryStorage());
    await store.save('p', { text: 'x', fonts: [], rev: 'r7' });
    expect(await store.load('p')).toEqual({ text: 'x', fonts: [], rev: 'r7' });
  });

  it('drops a non-string rev from a tampered envelope', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 2, text: 'x', fonts: [], rev: 42 }));
    expect(await new DraftStore(storage).load('p')).toEqual({ text: 'x', fonts: [] });
  });

  it('reports no draft for an unsaved document', async () => {
    const store = new DraftStore(memoryStorage());
    expect(await store.load('p')).toBeNull();
  });

  it('clears a draft', async () => {
    const store = new DraftStore(memoryStorage());
    await store.save('p', { text: 'x', fonts: [] });
    store.clear('p');
    expect(await store.load('p')).toBeNull();
  });

  it('returns a typed failure when the write throws (quota)', async () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error('quota exceeded');
    };
    const result = await new DraftStore(storage).save('p', { text: 'x', fonts: [] });
    expect(result).toEqual({ ok: false, kind: 'error' });
  });

  it('upgrades a previous text-only draft to an empty font list', async () => {
    // A schema bump must not eat a user's draft: the old envelope carried only
    // the text, so that is what comes back.
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 1, text: 'old draft' }));
    expect(await new DraftStore(storage).load('p')).toEqual({ text: 'old draft', fonts: [] });
  });

  it('treats malformed JSON as a clean miss and prunes it', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, 'not json');
    const remove = vi.spyOn(storage, 'removeItem');
    expect(await new DraftStore(storage).load('p')).toBeNull();
    expect(remove).toHaveBeenCalledWith(KEY);
  });

  it('rejects a wrong-version or wrong-typed envelope as a miss', async () => {
    const storage = memoryStorage();
    const store = new DraftStore(storage);
    storage.setItem(KEY, JSON.stringify({ v: 99, text: 'x', fonts: [] }));
    expect(await store.load('p')).toBeNull();
    storage.setItem(KEY, JSON.stringify({ v: 1, text: 123 }));
    expect(await store.load('p')).toBeNull();
    storage.setItem(KEY, JSON.stringify(null));
    expect(await store.load('p')).toBeNull();
  });

  it('round-trips the sample-variant set and inferred definitions stub (v5)', async () => {
    const store = new DraftStore(memoryStorage());
    const sample = {
      active: 'user-1',
      variants: [
        { id: 'default', text: '{"a":1}' },
        { id: 'blank', text: '{}' },
        { id: 'user-1', text: '{"a":2}', name: 'My copy' },
      ],
    };
    await store.save('p', { text: 'x', fonts: [], sample, definitions: 'type: object\n' });
    expect(await store.load('p')).toEqual({
      text: 'x',
      fonts: [],
      sample,
      definitions: 'type: object\n',
    });
  });

  it('upgrades a v3 draft (single params string) to a one-variant default set', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 3, text: 'x', fonts: [], params: '{"a":1}' }));
    expect(await new DraftStore(storage).load('p')).toEqual({
      text: 'x',
      fonts: [],
      sample: { active: 'default', variants: [{ id: 'default', text: '{"a":1}' }] },
    });
  });

  it('upgrades a v3 draft with no params to one without sample data', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 3, text: 'x', fonts: [lato] }));
    expect(await new DraftStore(storage).load('p')).toEqual({ text: 'x', fonts: [lato] });
  });

  it('upgrades a v2 draft (fonts, no sample) to one without sample data', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 2, text: 'x', fonts: [lato] }));
    expect(await new DraftStore(storage).load('p')).toEqual({ text: 'x', fonts: [lato] });
  });

  it('rejects a v3 envelope with a non-string params or definitions', async () => {
    const storage = memoryStorage();
    const store = new DraftStore(storage);
    storage.setItem(KEY, JSON.stringify({ v: 3, text: 'x', fonts: [], params: 42 }));
    expect(await store.load('p')).toBeNull();
    storage.setItem(KEY, JSON.stringify({ v: 3, text: 'x', fonts: [], definitions: {} }));
    expect(await store.load('p')).toBeNull();
  });

  it('accepts a v4 envelope with no sample (fonts-only working copy)', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 4, text: 'x', fonts: [lato], rev: 'r1' }));
    expect(await new DraftStore(storage).load('p')).toEqual({
      text: 'x',
      fonts: [lato],
      rev: 'r1',
    });
  });

  it('rejects a v4 envelope whose sample is malformed (each corruption → miss)', async () => {
    const storage = memoryStorage();
    const store = new DraftStore(storage);
    const bad = (sample: unknown) => {
      storage.setItem(KEY, JSON.stringify({ v: 4, text: 'x', fonts: [], sample }));
    };
    const one = (id: string, text: string) => ({ id, text });
    // non-object sample
    bad('nope');
    expect(await store.load('p')).toBeNull();
    // non-string active
    bad({ active: 5, variants: [one('default', '{}')] });
    expect(await store.load('p')).toBeNull();
    // non-array variants
    bad({ active: 'default', variants: 'x' });
    expect(await store.load('p')).toBeNull();
    // empty variants
    bad({ active: 'default', variants: [] });
    expect(await store.load('p')).toBeNull();
    // a non-object variant entry (string/null)
    bad({ active: 'default', variants: ['nope'] });
    expect(await store.load('p')).toBeNull();
    // entry missing a string text
    bad({ active: 'default', variants: [{ id: 'default' }] });
    expect(await store.load('p')).toBeNull();
    // entry with a non-string name
    bad({ active: 'default', variants: [{ id: 'default', text: '{}', name: 7 }] });
    expect(await store.load('p')).toBeNull();
    // duplicate ids (two entries would both answer to one switch/edit)
    bad({ active: 'default', variants: [one('default', '{}'), one('default', '{"a":1}')] });
    expect(await store.load('p')).toBeNull();
    // over-cap count
    bad({
      active: 'default',
      variants: Array.from({ length: 13 }, (_, i) => one(`v${i}`, '{}')),
    });
    expect(await store.load('p')).toBeNull();
    // over-byte text
    bad({ active: 'default', variants: [one('default', 'x'.repeat(1_048_577))] });
    expect(await store.load('p')).toBeNull();
    // active names no variant
    bad({ active: 'ghost', variants: [one('default', '{}')] });
    expect(await store.load('p')).toBeNull();
  });

  it('keeps a hostile variant id and name as inert own-data through the round-trip', async () => {
    const store = new DraftStore(memoryStorage());
    const sample = {
      active: '__proto__',
      variants: [
        { id: '__proto__', text: '{}' },
        { id: 'toString', text: '{}' },
        { id: 'user-1', text: '{}', name: 'constructor' },
      ],
    };
    await store.save('p', { text: 'x', fonts: [], sample });
    const loaded = await store.load('p');
    expect(loaded?.sample).toEqual(sample);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects a v2 envelope whose fonts are malformed (hostile storage)', async () => {
    const storage = memoryStorage();
    const store = new DraftStore(storage);
    storage.setItem(KEY, JSON.stringify({ v: 2, text: 'x' }));
    expect(await store.load('p')).toBeNull();
    storage.setItem(KEY, JSON.stringify({ v: 2, text: 'x', fonts: [{ packId: 1 }] }));
    expect(await store.load('p')).toBeNull();
    storage.setItem(KEY, JSON.stringify({ v: 2, text: 'x', fonts: ['gf-lato'] }));
    expect(await store.load('p')).toBeNull();
  });

  it('round-trips the header rename (v5) and omits it when absent', async () => {
    const store = new DraftStore(memoryStorage());
    await store.save('p', { text: 'x', fonts: [], name: 'My invoice' });
    expect(await store.load('p')).toEqual({ text: 'x', fonts: [], name: 'My invoice' });
    // A draft with no rename carries none (not an empty string).
    await store.save('p', { text: 'x', fonts: [] });
    expect((await store.load('p'))?.name).toBeUndefined();
  });

  it('loads a v4 envelope with no rename (name undefined on upgrade)', async () => {
    const storage = memoryStorage();
    const sample = { active: 'default', variants: [{ id: 'default', text: '{}' }] };
    storage.setItem(KEY, JSON.stringify({ v: 4, text: 'x', fonts: [], sample }));
    const loaded = await new DraftStore(storage).load('p');
    expect(loaded).toEqual({ text: 'x', fonts: [], sample });
    expect(loaded?.name).toBeUndefined();
  });

  it('rejects a v5 envelope whose name is a non-string (corruption → miss)', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 5, text: 'x', fonts: [], name: 42 }));
    expect(await new DraftStore(storage).load('p')).toBeNull();
  });

  it('clips an over-long v5 name on read (a nuisance, not a reject)', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 5, text: 'x', fonts: [], name: 'z'.repeat(300) }));
    const loaded = await new DraftStore(storage).load('p');
    expect(loaded?.name).toHaveLength(120);
  });

  it('round-trips the definition-edit ops (v6)', async () => {
    const store = new DraftStore(memoryStorage());
    const edits = [
      { op: 'setScalar' as const, keys: ['properties', 'title', 'title'], value: 'Heading' },
    ];
    await store.save('p', {
      text: 'x',
      fonts: [],
      definitions: 'type: object\n',
      definitionsEdits: edits,
    });
    expect((await store.load('p'))?.definitionsEdits).toEqual(edits);
  });

  it('loads a v5 envelope with no definition edits (undefined on upgrade)', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 5, text: 'x', fonts: [] }));
    const loaded = await new DraftStore(storage).load('p');
    expect(loaded?.definitionsEdits).toBeUndefined();
  });

  it('rejects a v6 envelope whose definitionsEdits is a non-array (corruption → miss)', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ v: 6, text: 'x', fonts: [], definitionsEdits: 'ops' }));
    expect(await new DraftStore(storage).load('p')).toBeNull();
  });

  it('sanitizes hostile entries inside a stored edit list (garbage dropped, ops kept)', async () => {
    const storage = memoryStorage();
    const real = { op: 'removeKey', keys: ['properties', 'x', 'title'] };
    storage.setItem(
      KEY,
      JSON.stringify({
        v: 6,
        text: 'x',
        fonts: [],
        definitionsEdits: [7, null, { keys: [] }, real],
      }),
    );
    expect((await new DraftStore(storage).load('p'))?.definitionsEdits).toEqual([real]);
  });
});
