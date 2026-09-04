// The op builders for `link: { url }`. Three rules carry the weight and none of
// them shows up in a "does it write the key" assertion: an unchanged blur must
// author NOTHING, a clear must not `removeKey` a key the document does not
// carry (that refuses the whole `applyAll` batch, silently — and the
// changed-guard is what stops it, see the module header), and the declaration
// half must be told the LINK surface's other-names set rather than the text
// surface's.

import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PendingDecl } from '../text/declModel';
import { linkCommitOps, linkWireOps } from './linkOps';

const P = 'sections.body.items[3]';
const readOf =
  (item: unknown): ReadFn =>
  () =>
    item;

describe('linkWireOps', () => {
  it('authors the url under `link.url`, creating the intermediate map', () => {
    expect(linkWireOps(P, 'https://x.test', '')).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test' },
    ]);
  });

  it('trims — the engine emits the trimmed form, so the file carries it too', () => {
    expect(linkWireOps(P, '  https://x.test  ', '')).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test' },
    ]);
  });

  it('removes the whole `link` key when the field is cleared and the key IS there', () => {
    expect(linkWireOps(P, '', 'https://x.test')).toEqual([
      { op: 'removeKey', path: P, keys: ['link'] },
    ]);
  });

  it('authors NOTHING when the field is cleared and there was no link', () => {
    // The other half of the same guard. `removeKeyPath` answers `key_not_found`
    // on an absent key and `applyAll` re-parses the pre-batch snapshot on the
    // first failing op, so an unguarded clear would turn every other op in the
    // batch into a no-op with nothing reporting it. The changed-check is what
    // stops it: no current url means nothing changed.
    expect(linkWireOps(P, '', '')).toEqual([]);
    expect(linkWireOps(P, '   ', '')).toEqual([]);
  });

  it('authors NOTHING for an unchanged value, so a tab-through mints no undo step', () => {
    expect(linkWireOps(P, 'https://x.test', 'https://x.test')).toEqual([]);
    expect(linkWireOps(P, ' https://x.test ', 'https://x.test')).toEqual([]);
    // The changed-guard runs FIRST, which is what stops a bare blur over a
    // hostile empty `link: {}` from deleting the key.
    expect(linkWireOps(P, '', '')).toEqual([]);
  });
});

describe('linkCommitOps', () => {
  const decl: PendingDecl = { name: 'f1', key: 'order.code', scope: null };

  it('carries a staged declaration the new url references, as ONE batch', () => {
    const ops = linkCommitOps({
      read: readOf({ type: 'text', text: 'hello' }),
      path: P,
      currentUrl: '',
      next: 'https://x.test/{f1}',
      pending: [decl],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/{f1}' },
      { op: 'putValue', path: P, keys: ['bindings', 'f1'], value: { key: 'order.code' } },
    ]);
  });

  it('drops a staged declaration the committed url does not reference', () => {
    const ops = linkCommitOps({
      read: readOf({ type: 'text' }),
      path: P,
      currentUrl: '',
      next: 'https://x.test/',
      pending: [decl],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/' },
    ]);
  });

  it('prunes a declaration THIS edit orphaned', () => {
    const ops = linkCommitOps({
      read: readOf({
        type: 'text',
        text: 'hello',
        bindings: { f1: { key: 'order.code' } },
        link: { url: 'https://x.test/{f1}' },
      }),
      path: P,
      currentUrl: 'https://x.test/{f1}',
      next: 'https://x.test/',
      pending: [],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/' },
      { op: 'removeKey', path: P, keys: ['bindings', 'f1'] },
    ]);
  });

  it('leaves a declaration the item TEXT still uses — the link surface set', () => {
    // The reason `linkSurfaceNames` exists. `otherSurfaceNames` would return
    // this item's own `link.url` and OMIT its `text:`, so a prune driven by it
    // would remove the declaration the static text is resolving through.
    const ops = linkCommitOps({
      read: readOf({
        type: 'text',
        text: 'order {f1}',
        bindings: { f1: { key: 'order.code' } },
        link: { url: 'https://x.test/{f1}' },
      }),
      path: P,
      currentUrl: 'https://x.test/{f1}',
      next: 'https://x.test/',
      pending: [],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/' },
    ]);
  });

  it('leaves a declaration a SPAN still uses', () => {
    const ops = linkCommitOps({
      read: readOf({
        type: 'text',
        bindings: { f1: { key: 'order.code' } },
        spans: [{ text: '{f1}' }],
        link: { url: 'https://x.test/{f1}' },
      }),
      path: P,
      currentUrl: 'https://x.test/{f1}',
      next: 'https://x.test/',
      pending: [],
    });
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['link', 'url'], value: 'https://x.test/' },
    ]);
  });

  it('returns an EMPTY batch when the url did not change', () => {
    expect(
      linkCommitOps({
        read: readOf({ type: 'text' }),
        path: P,
        currentUrl: 'https://x.test',
        next: 'https://x.test',
        pending: [decl],
      }),
    ).toEqual([]);
  });
});
