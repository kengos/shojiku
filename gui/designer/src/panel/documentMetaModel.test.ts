import { describe, expect, it } from 'vitest';
import {
  MAX_META_ENTRIES,
  metaListOp,
  metaTextOp,
  readDocumentMetaView,
  removeEntry,
  replaceEntry,
} from './documentMetaModel';

describe('readDocumentMetaView', () => {
  it('reads every field out of a full document node', () => {
    const view = readDocumentMetaView({
      title: 'Monthly invoice',
      description: 'January',
      language: 'ja-JP',
      keywords: ['invoice', 'billing'],
      authors: ['Accounting'],
    });
    expect(view).toEqual({
      title: 'Monthly invoice',
      description: 'January',
      language: 'ja-JP',
      keywords: ['invoice', 'billing'],
      authors: ['Accounting'],
    });
  });

  it('reads an absent or hostile node as all-empty', () => {
    for (const raw of [undefined, null, 'a string', 42, ['a', 'list']]) {
      expect(readDocumentMetaView(raw)).toEqual({
        title: '',
        description: '',
        language: '',
        keywords: [],
        authors: [],
      });
    }
  });

  it('stringifies a numeric scalar and drops an unaddressable list entry', () => {
    // A document is untrusted: a mapping inside `keywords` has no text form
    // the surface could edit, so it must not appear as an editable row.
    const view = readDocumentMetaView({
      title: 2026,
      description: { not: 'a scalar' },
      keywords: ['ok', { nested: true }, 7, null],
    });
    expect(view.title).toBe('2026');
    expect(view.description).toBe('');
    expect(view.keywords).toEqual(['ok', '7']);
  });
});

describe('metaTextOp', () => {
  it('writes a root-addressed scalar and clears on empty', () => {
    expect(metaTextOp('title', 'Invoice')).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['document', 'title'],
      value: 'Invoice',
    });
    expect(metaTextOp('language', '')).toEqual({
      op: 'removeKey',
      path: undefined,
      keys: ['document', 'language'],
    });
  });
});

describe('metaListOp', () => {
  it('writes the list as a flow sequence', () => {
    expect(metaListOp('keywords', ['a', 'b'])).toEqual({
      op: 'setStrings',
      path: undefined,
      keys: ['document', 'keywords'],
      values: ['a', 'b'],
    });
  });

  it('trims entries and drops the blank ones', () => {
    expect(metaListOp('authors', ['  A  ', '', '   ', 'B'])).toEqual({
      op: 'setStrings',
      path: undefined,
      keys: ['document', 'authors'],
      values: ['A', 'B'],
    });
  });

  it('removes the key when nothing survives', () => {
    for (const entries of [[], [''], ['  ']]) {
      expect(metaListOp('keywords', entries)).toEqual({
        op: 'removeKey',
        path: undefined,
        keys: ['document', 'keywords'],
      });
    }
  });
});

describe('replaceEntry / removeEntry', () => {
  it('replaces in place', () => {
    expect(replaceEntry(['a', 'b', 'c'], 1, 'B')).toEqual(['a', 'B', 'c']);
  });

  it('appends when the index is the trailing blank row', () => {
    expect(replaceEntry(['a'], 1, 'b')).toEqual(['a', 'b']);
    expect(replaceEntry([], 0, 'first')).toEqual(['first']);
  });

  it('refuses an index outside the list rather than authoring a hole', () => {
    expect(replaceEntry(['a'], 5, 'x')).toEqual(['a']);
    expect(replaceEntry(['a'], -1, 'x')).toEqual(['a']);
  });

  it('removes by index and leaves an out-of-range index alone', () => {
    expect(removeEntry(['a', 'b', 'c'], 0)).toEqual(['b', 'c']);
    expect(removeEntry(['a'], 3)).toEqual(['a']);
  });
});

describe('MAX_META_ENTRIES', () => {
  it('matches the engine cap it stands in for', () => {
    // `MAX_DOCUMENT_ENTRIES` in engine/core/src/template/document.rs — the
    // surface stops offering "add" where the engine stops accepting.
    expect(MAX_META_ENTRIES).toBe(64);
  });
});
