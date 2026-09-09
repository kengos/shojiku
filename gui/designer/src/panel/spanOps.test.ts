// @vitest-environment node
//
// The ENCODING half: a run plan → one batch. `runIdentity` decides WHAT
// changed; this decides in what order the file may be told, and the order is
// the whole subtlety — an update addresses an original index, a removal shifts
// every index above it, and an insert shifts every position after it.
//
// These cases pin the op LIST. What they cannot see is whether the document
// would ACCEPT the batch, so `spansFlow.test.ts` drives the same builder over a
// real `Editor` and asserts the produced TEXT.

import { MAX_BATCH_OPS, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { planRuns } from '../text/runIdentity';
import type { SerializedRun } from '../text/runSerialize';
import { NO_MARKS, narrowRuns, type RunMarks } from '../text/spanRuns';
import { spanCommitOps } from './spanOps';

const PATH = 'sections.body.items[0]';
const SEQ = `${PATH}.spans`;

const BOLD: RunMarks = { ...NO_MARKS, bold: true };

function readerFor(spans: readonly unknown[]): ReadFn {
  return (path) => (path === PATH ? { type: 'text', spans } : undefined);
}

function after(index: number | null, content: string, marks: RunMarks = NO_MARKS): SerializedRun {
  return { sourceIndex: index, kind: 'text', content, marks, linked: false };
}

function opsFor(spans: readonly unknown[], runs: readonly SerializedRun[]) {
  return spanCommitOps(readerFor(spans), PATH, planRuns(narrowRuns(spans), runs));
}

describe('spanCommitOps', () => {
  it('authors NOTHING when every fragment went untouched', () => {
    // `applyAll([])` reports ok and bumps the revision, so an empty batch would
    // still put a step on the undo stack for an edit that changed nothing.
    expect(opsFor([{ text: 'a' }, { text: 'b' }], [after(0, 'a'), after(1, 'b')])).toEqual([]);
  });

  it('writes the changed fragment on its ORIGINAL index, and nothing for its neighbours', () => {
    expect(
      opsFor(
        [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
        [after(0, 'a'), after(1, 'B!'), after(2, 'c')],
      ),
    ).toEqual([{ op: 'setScalar', path: `${SEQ}[1]`, keys: ['text'], value: 'B!' }]);
  });

  it('writes ONLY the mark when the words did not move', () => {
    // "Rewrite only the touched range" has to hold key by key, not just
    // fragment by fragment: bolding a word must not also rewrite its `text:`.
    expect(opsFor([{ text: 'a' }], [after(0, 'a', BOLD)])).toEqual([
      { op: 'setScalar', path: `${SEQ}[0]`, keys: ['style', 'fontWeight'], value: 'bold' },
    ]);
  });

  it('writes the text AND the mark when both moved', () => {
    expect(opsFor([{ text: 'a' }], [after(0, 'A!', BOLD)])).toEqual([
      { op: 'setScalar', path: `${SEQ}[0]`, keys: ['text'], value: 'A!' },
      { op: 'setScalar', path: `${SEQ}[0]`, keys: ['style', 'fontWeight'], value: 'bold' },
    ]);
  });

  it('removes DESCENDING, so each removal leaves the lower indices meaning what they meant', () => {
    const ops = opsFor([{ text: 'a' }, { text: 'b' }, { text: 'c' }], [after(1, 'b')]);
    expect(ops).toEqual([
      { op: 'removeItem', path: SEQ, index: 2 },
      { op: 'removeItem', path: SEQ, index: 0 },
    ]);
  });

  it('orders updates BEFORE removals — an update addresses the pre-removal shape', () => {
    const ops = opsFor([{ text: 'a' }, { text: 'b' }], [after(1, 'B!')]);
    expect(ops.map((op) => op.op)).toEqual(['setScalar', 'removeItem']);
    expect(ops[0]).toMatchObject({ path: `${SEQ}[1]` });
  });

  it('inserts a split fragment right after the half that kept the node', () => {
    const ops = opsFor(
      [{ text: 'ab' }, { text: 'c' }],
      [after(0, 'a'), after(0, 'b'), after(1, 'c')],
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: `${SEQ}[0]`, keys: ['text'], value: 'a' },
      { op: 'insertItem', path: SEQ, index: 1, value: { text: 'b' } },
    ]);
  });

  it('carries the keys this surface does not edit onto the new half of a split', () => {
    const ops = opsFor(
      [{ text: 'ab', link: { url: 'https://x' }, styleNames: ['strong'] }],
      [after(0, 'a'), after(0, 'b')],
    );
    expect(ops[1]).toMatchObject({
      op: 'insertItem',
      value: { text: 'b', link: { url: 'https://x' }, styleNames: ['strong'] },
    });
  });

  it('gives a brand-new fragment no inherited keys', () => {
    // The source fragment is LINKED, and `linked` takes part in the identity —
    // so the kept run has to say so, or it reads as an edit and the case would
    // be asserting about the wrong op.
    const ops = opsFor(
      [{ text: 'a', link: { url: 'https://x' } }],
      [{ ...after(0, 'a'), linked: true }, after(null, 'new')],
    );
    expect(ops).toEqual([{ op: 'insertItem', path: SEQ, index: 1, value: { text: 'new' } }]);
  });

  it('places several inserts so each lands where the plan puts it', () => {
    const ops = opsFor([{ text: 'a' }], [after(null, 'x'), after(0, 'a'), after(null, 'z')]);
    expect(ops).toEqual([
      { op: 'insertItem', path: SEQ, index: 0, value: { text: 'x' } },
      { op: 'insertItem', path: SEQ, index: 2, value: { text: 'z' } },
    ]);
  });

  it('counts positions in WIRE slots, not plan entries, when a malformed entry is present', () => {
    // `narrowRuns` skips the malformed element while keeping its neighbours'
    // wire indices, so the sequence has MORE elements than the plan has
    // entries. Counting entries would put the new fragment one slot early —
    // before an element the reader cannot even see.
    const ops = opsFor(['malformed', { text: 'a' }], [after(1, 'a'), after(null, 'new')]);
    expect(ops).toEqual([{ op: 'insertItem', path: SEQ, index: 2, value: { text: 'new' } }]);
  });

  it('writes a new fragment its marks as a style map', () => {
    const ops = opsFor([{ text: 'a' }], [after(0, 'a'), after(null, 'b', BOLD)]);
    expect(ops[0]).toMatchObject({ value: { text: 'b', style: { fontWeight: 'bold' } } });
  });

  it('writes a bound fragment as data, never as text', () => {
    const ops = spanCommitOps(
      readerFor([{ text: 'a' }]),
      PATH,
      planRuns(narrowRuns([{ text: 'a' }]), [
        after(0, 'a'),
        {
          sourceIndex: null,
          kind: 'bound',
          content: 'order.total',
          marks: NO_MARKS,
          linked: false,
        },
      ]),
    );
    expect(ops[0]).toMatchObject({ value: { data: { key: 'order.total' } } });
  });

  it('changes only a bound fragment MARKS — its key is the panel inspector to edit', () => {
    const spans = [{ data: { key: 'k' } }];
    const ops = spanCommitOps(
      readerFor(spans),
      PATH,
      planRuns(narrowRuns(spans), [
        { sourceIndex: 0, kind: 'bound', content: 'k', marks: BOLD, linked: false },
      ]),
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: `${SEQ}[0]`, keys: ['style', 'fontWeight'], value: 'bold' },
    ]);
  });

  it('can exceed the batch cap on a large document — which is why the caller checks', () => {
    // `MAX_BATCH_OPS` and `MAX_SPANS` are both 256, and a changed fragment can
    // carry five writes. So a reformat of a large document really does produce
    // a batch the editor will refuse, and a caller that ignored the result
    // would swallow the whole edit. `useInlineEdit` keeps the surface open
    // instead; this case is what says the situation is reachable at all.
    const spans = Array.from({ length: 200 }, (_, index) => ({ text: `w${index}` }));
    const runs = spans.map((_, index) => after(index, `W${index}`, BOLD));
    expect(opsFor(spans, runs).length).toBeGreaterThan(MAX_BATCH_OPS);
  });

  it('authors nothing over an item with no spans at all', () => {
    const read: ReadFn = () => ({ type: 'text' });
    expect(spanCommitOps(read, PATH, planRuns([], []))).toEqual([]);
  });

  it('reads a hostile spans as empty rather than throwing', () => {
    for (const hostile of [undefined, null, 'spans', 42]) {
      const read: ReadFn = () => ({ type: 'text', spans: hostile });
      expect(spanCommitOps(read, PATH, planRuns([], [after(null, 'x')]))).toEqual([
        { op: 'insertItem', path: SEQ, index: 0, value: { text: 'x' } },
      ]);
    }
  });
});
