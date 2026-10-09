import { describe, expect, it } from 'vitest';
import {
  identityOp,
  MAX_META_ENTRIES,
  metaListOp,
  metaTextOp,
  readDocumentMetaView,
  readTemplateIdentity,
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
    expect(metaTextOp('title', '', 'Invoice')).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['document', 'title'],
      value: 'Invoice',
    });
    expect(metaTextOp('language', 'ja-JP', '')).toEqual({
      op: 'removeKey',
      path: undefined,
      keys: ['document', 'language'],
    });
  });

  it('authors nothing when the commit does not change the value', () => {
    expect(metaTextOp('title', 'Invoice', 'Invoice')).toBeNull();
    expect(metaTextOp('description', '', '')).toBeNull();
  });
});

describe('readTemplateIdentity', () => {
  const reader =
    (doc: Record<string, unknown>) =>
    (path: string): unknown =>
      doc[path];

  it('reads the root name and version verbatim, a number as its decimal string', () => {
    expect(readTemplateIdentity(reader({ name: 'invoice_ja', version: '0.1.0' }))).toEqual({
      name: 'invoice_ja',
      version: '0.1.0',
      unreadable: { name: false, version: false },
    });
    expect(readTemplateIdentity(reader({ version: 1.5 })).version).toBe('1.5');
    // The document model has already parsed the number: an authored `1.0`
    // arrives as 1 and shows as "1".
    expect(readTemplateIdentity(reader({ version: 1 })).version).toBe('1');
  });

  it('reads an absent value as unset, and a hostile one as unset AND unreadable', () => {
    for (const raw of [undefined, null]) {
      expect(readTemplateIdentity(reader({ name: raw, version: raw }))).toEqual({
        name: '',
        version: '',
        unreadable: { name: false, version: false },
      });
    }
    for (const raw of [true, { a: 1 }, ['x']]) {
      expect(readTemplateIdentity(reader({ name: raw, version: raw }))).toEqual({
        name: '',
        version: '',
        unreadable: { name: true, version: true },
      });
    }
  });
});

describe('identityOp', () => {
  it('writes the key at the ROOT, always as a string', () => {
    expect(identityOp('name', '', 'invoice_ja')).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['name'],
      value: 'invoice_ja',
    });
    // "2" stays text, which keeps exactly what was typed.
    expect(identityOp('version', '1.5', '2')).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['version'],
      value: '2',
    });
  });

  it('clears on empty and authors nothing for an unchanged commit', () => {
    expect(identityOp('version', '1.5', '')).toEqual({
      op: 'removeKey',
      path: undefined,
      keys: ['version'],
    });
    expect(identityOp('name', 'r', 'r')).toBeNull();
    expect(identityOp('name', '', '')).toBeNull();
  });

  it('removes an UNREADABLE value on an empty commit', () => {
    expect(identityOp('name', '', '', true)).toEqual({
      op: 'removeKey',
      path: undefined,
      keys: ['name'],
    });
    expect(identityOp('version', '', '3', true)).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['version'],
      value: '3',
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
