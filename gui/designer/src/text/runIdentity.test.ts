// @vitest-environment node
//
// The round-trip DECISION as a predicate: "rewrite only the touched range".
// Every case here answers one question — did this fragment go untouched? — and
// the answer is what decides whether the file's YAML node is rewritten at all.
//
// The classification is tested apart from its encoding on purpose: `spanOps`
// turns a plan into ops and can be wrong about ORDER while this is right about
// WHAT CHANGED, and a single test over both would not say which.

import { describe, expect, it } from 'vitest';
import { planRuns } from './runIdentity';
import type { SerializedRun } from './runSerialize';
import { NO_MARKS, narrowRuns, type RunMarks } from './spanRuns';

const SPANS = [{ text: 'a' }, { text: 'b', style: { fontWeight: 'bold' } }, { text: 'c' }];
const BEFORE = narrowRuns(SPANS);

function after(
  index: number | null,
  content: string,
  marks: RunMarks = NO_MARKS,
  kind: 'text' | 'bound' = 'text',
): SerializedRun {
  return { sourceIndex: index, kind, content, marks, linked: false };
}

const BOLD: RunMarks = { ...NO_MARKS, bold: true };

describe('planRuns', () => {
  it('keeps every fragment when nothing changed', () => {
    const plan = planRuns(BEFORE, [after(0, 'a'), after(1, 'b', BOLD), after(2, 'c')]);
    expect(plan.entries.map((entry) => entry.op)).toEqual(['keep', 'keep', 'keep']);
    expect(plan.removed).toEqual([]);
  });

  it('updates ONLY the fragment whose text changed', () => {
    // The proposition the user's decision rests on: editing one fragment must
    // leave its neighbours' nodes alone, and "alone" here means `keep`, which
    // authors no op at all.
    const plan = planRuns(BEFORE, [after(0, 'a'), after(1, 'CHANGED', BOLD), after(2, 'c')]);
    expect(plan.entries.map((entry) => entry.op)).toEqual(['keep', 'update', 'keep']);
  });

  it('updates a fragment whose MARKS changed but whose text did not', () => {
    const plan = planRuns(BEFORE, [after(0, 'a', BOLD), after(1, 'b', BOLD), after(2, 'c')]);
    expect(plan.entries[0]).toMatchObject({ op: 'update', sourceIndex: 0 });
  });

  it('updates a fragment whose LINK mark changed', () => {
    const plan = planRuns(BEFORE, [
      { ...after(0, 'a'), linked: true },
      after(1, 'b', BOLD),
      after(2, 'c'),
    ]);
    expect(plan.entries[0]?.op).toBe('update');
  });

  it('gives a SPLIT its original node for the first half and a new one for the rest', () => {
    // Both halves carry the same `data-sj-run`, measured. The leading half
    // stays on the node so the file's diff is the tail, not the whole fragment.
    const plan = planRuns(BEFORE, [
      after(0, 'a'),
      after(1, 'b1', BOLD),
      after(1, 'b2', BOLD),
      after(2, 'c'),
    ]);
    expect(plan.entries.map((entry) => entry.op)).toEqual(['keep', 'update', 'insert', 'keep']);
    expect(plan.entries[2]).toMatchObject({ op: 'insert', inheritFrom: 1 });
  });

  it('inherits from the fragment a new run was split out of', () => {
    // What makes splitting a LINKED fragment leave both halves linked — the
    // keys this surface does not edit are copied rather than dropped.
    const plan = planRuns(BEFORE, [
      after(0, 'a'),
      after(1, 'b', BOLD),
      after(1, 'extra', BOLD),
      after(2, 'c'),
    ]);
    expect(plan.entries[2]).toMatchObject({ inheritFrom: 1 });
  });

  it('treats a fragment with no provenance as brand new, inheriting nothing', () => {
    const plan = planRuns(BEFORE, [
      after(0, 'a'),
      after(null, 'typed'),
      after(1, 'b', BOLD),
      after(2, 'c'),
    ]);
    expect(plan.entries[1]).toMatchObject({ op: 'insert', inheritFrom: null });
  });

  it('removes a fragment no surviving run stands on', () => {
    const plan = planRuns(BEFORE, [after(0, 'a'), after(2, 'c')]);
    expect(plan.removed).toEqual([1]);
  });

  it('removes every fragment when the surface was emptied', () => {
    const plan = planRuns(BEFORE, []);
    expect(plan.removed).toEqual([0, 1, 2]);
    expect(plan.entries).toEqual([]);
  });

  it('refuses a BACKWARDS claim rather than mis-encoding a reorder', () => {
    // The ops address positions. A retained node appearing earlier than one
    // already placed is a reorder this surface cannot produce, and encoding it
    // as an in-place update would write the wrong fragment's text.
    const plan = planRuns(BEFORE, [after(2, 'c'), after(0, 'a'), after(1, 'b', BOLD)]);
    expect(plan.entries.map((entry) => entry.op)).toEqual(['keep', 'insert', 'insert']);
    expect(plan.removed).toEqual([0, 1]);
  });

  it('refuses a claim whose source is a DIFFERENT kind of fragment', () => {
    const plan = planRuns(BEFORE, [after(0, 'k', NO_MARKS, 'bound')]);
    expect(plan.entries[0]).toMatchObject({ op: 'insert' });
  });

  it('refuses a claim naming an index no fragment has', () => {
    const plan = planRuns(BEFORE, [after(99, 'x')]);
    expect(plan.entries[0]).toMatchObject({ op: 'insert', inheritFrom: 99 });
  });

  it('leaves a SKIPPED wire index out of the plan and out of the removals', () => {
    // `narrowRuns` skips a malformed entry while keeping its neighbours' wire
    // indices, so the plan has fewer entries than the sequence has elements.
    // Nothing here may propose removing the element it cannot see.
    const before = narrowRuns([{ text: 'a' }, 'malformed', { text: 'c' }]);
    const plan = planRuns(before, [after(0, 'a'), after(2, 'c')]);
    expect(plan.removed).toEqual([]);
    expect(plan.entries.map((entry) => entry.op)).toEqual(['keep', 'keep']);
  });
});
