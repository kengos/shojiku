// @vitest-environment node
//
// The fragment-link write side as OPS. What these cannot see is whether the
// document would ACCEPT the batch — a `removeKey` for an absent key fails and
// `applyAll` then discards the whole batch silently — so `SpansSection.test.tsx`
// drives the same builders over a real `Editor` and asserts the produced TEXT.

import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { clearIgnoredContentOps, spanLinkCommitOps, spanPath } from './spanLinkOps';

const PATH = 'sections.body.items[0]';

const ITEM = {
  type: 'text',
  bindings: { f1: { key: 'order.url' } },
  spans: [{ text: 'a', link: { url: 'https://x/{f1}' } }, { text: 'b' }],
};
const read: ReadFn = (path) => (path === PATH ? ITEM : undefined);

describe('spanPath', () => {
  it('addresses one fragment in the grammar designer-core parses', () => {
    expect(spanPath(PATH, 3)).toBe('sections.body.items[0].spans[3]');
  });
});

describe('spanLinkCommitOps', () => {
  const base = { read, itemPath: PATH, pending: [] };

  it('writes link.url on the FRAGMENT, not on the item', () => {
    expect(
      spanLinkCommitOps({ ...base, index: 1, currentUrl: '', next: 'https://example.com' }),
    ).toEqual([
      {
        op: 'setScalar',
        path: 'sections.body.items[0].spans[1]',
        keys: ['link', 'url'],
        value: 'https://example.com',
      },
    ]);
  });

  it('authors nothing for an unchanged URL', () => {
    // A bare tab-through must mint no undo step: `applyAll([])` reports ok AND
    // bumps the revision, so an empty batch is never dispatched.
    expect(
      spanLinkCommitOps({
        ...base,
        index: 0,
        currentUrl: 'https://x/{f1}',
        next: ' https://x/{f1} ',
      }),
    ).toEqual([]);
  });

  it('clears the fragment’s link key when the URL is emptied', () => {
    expect(
      spanLinkCommitOps({ ...base, index: 0, currentUrl: 'https://x/{f1}', next: '' }),
    ).toEqual([
      { op: 'removeKey', path: 'sections.body.items[0].spans[0]', keys: ['link'] },
      // The declaration the cleared URL orphaned goes with it — same prune rule
      // as every other surface, and it addresses the ITEM, where bindings live.
      { op: 'removeKey', path: PATH, keys: ['bindings', 'f1'] },
    ]);
  });

  it('does NOT prune a declaration another fragment’s text still uses', () => {
    const item = {
      type: 'text',
      bindings: { f1: { key: 'order.url' } },
      spans: [{ link: { url: 'https://x/{f1}' } }, { text: 'see {f1}' }],
    };
    const ops = spanLinkCommitOps({
      read: (path) => (path === PATH ? item : undefined),
      itemPath: PATH,
      index: 0,
      currentUrl: 'https://x/{f1}',
      next: '',
      pending: [],
    });
    expect(ops).toEqual([
      { op: 'removeKey', path: 'sections.body.items[0].spans[0]', keys: ['link'] },
    ]);
  });

  it('stages a declaration the new URL references, on the ITEM', () => {
    const ops = spanLinkCommitOps({
      ...base,
      index: 1,
      currentUrl: '',
      next: 'https://x/{f2}',
      pending: [{ name: 'f2', key: '注文.url', scope: null }],
    });
    expect(ops).toEqual([
      {
        op: 'setScalar',
        path: 'sections.body.items[0].spans[1]',
        keys: ['link', 'url'],
        value: 'https://x/{f2}',
      },
      { op: 'putValue', path: PATH, keys: ['bindings', 'f2'], value: { key: '注文.url' } },
    ]);
  });
});

describe('clearIgnoredContentOps', () => {
  it('removes only the keys the item actually carries', () => {
    // Both removals are presence-guarded: an unguarded `removeKey` on an absent
    // key returns `key_not_found`, and `applyAll` then discards the batch.
    expect(clearIgnoredContentOps(PATH, true, false)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['text'] },
    ]);
    expect(clearIgnoredContentOps(PATH, false, true)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['data'] },
    ]);
    expect(clearIgnoredContentOps(PATH, true, true)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['text'] },
      { op: 'removeKey', path: PATH, keys: ['data'] },
    ]);
  });

  it('authors nothing when neither key is there', () => {
    expect(clearIgnoredContentOps(PATH, false, false)).toEqual([]);
  });
});
