import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  allStepIds,
  chapterProgress,
  courseSteps,
  EMPTY_PROGRESS,
  isUiEvent,
  MAX_PROGRESS_BYTES,
  markComplete,
  readProgress,
  resumeAt,
  stepDone,
} from './model';
import type { TutorialCourse, TutorialStep } from './types';

function step(id: string, done: TutorialStep['done']): TutorialStep {
  return { id, anchor: { kind: 'menu', selector: 'menu-insert' }, done };
}

const COURSE: TutorialCourse = {
  id: 'test',
  chapters: [
    { id: 'a', seed: 'seed-a', steps: [step('a.1', { auto: true }), step('a.2', { auto: true })] },
    { id: 'b', seed: 'seed-b', steps: [step('b.1', { auto: true })] },
  ],
};

const setText: Op = { op: 'setScalar', path: 'sections.body.items[0]', keys: ['text'], value: 'x' };

describe('stepDone — op predicates', () => {
  const target = step('s', { ops: [{ op: 'setScalar', keys: ['style', 'fontWeight'] }] });

  it('completes on an op whose kind and key path match', () => {
    const bold: Op = {
      op: 'setScalar',
      path: 'sections.body.items[0]',
      keys: ['style', 'fontWeight'],
      value: 'bold',
    };
    expect(stepDone(target, { kind: 'ops', ops: [bold] })).toBe(true);
  });

  it('does NOT complete on a different key path', () => {
    expect(stepDone(target, { kind: 'ops', ops: [setText] })).toBe(false);
  });

  it('does not complete on the right keys under the wrong op kind', () => {
    const removed: Op = {
      op: 'removeKey',
      path: 'sections.body.items[0]',
      keys: ['style', 'fontWeight'],
    };
    expect(stepDone(target, { kind: 'ops', ops: [removed] })).toBe(false);
  });

  it('matches a key PREFIX, so box.x and box.y both satisfy a box predicate', () => {
    const boxStep = step('s', { ops: [{ op: 'setScalar', keys: ['box'] }] });
    const setY: Op = {
      op: 'setScalar',
      path: 'sections.footer.items[0]',
      keys: ['box', 'y'],
      value: 8,
    };
    expect(stepDone(boxStep, { kind: 'ops', ops: [setY] })).toBe(true);
  });

  it('rejects an op whose key path is SHORTER than the predicate', () => {
    const shorter: Op = {
      op: 'setScalar',
      path: 'sections.body.items[0]',
      keys: ['style'],
      value: 'x',
    };
    expect(stepDone(target, { kind: 'ops', ops: [shorter] })).toBe(false);
  });

  it('treats an index continuation as inside the prefix, but not a longer name', () => {
    const inItems = step('s', { ops: [{ op: 'insertItem', pathPrefix: 'sections.body.items' }] });
    const indexed: Op = {
      op: 'insertItem',
      path: 'sections.body.items[1].items',
      index: 0,
      value: { type: 'text' },
    };
    expect(stepDone(inItems, { kind: 'ops', ops: [indexed] })).toBe(true);
    const otherKey: Op = {
      op: 'insertItem',
      path: 'sections.body.itemsExtra',
      index: 0,
      value: { type: 'text' },
    };
    expect(stepDone(inItems, { kind: 'ops', ops: [otherKey] })).toBe(false);
  });

  it('honors a path prefix, at segment boundaries only', () => {
    const inFooter = step('s', { ops: [{ op: 'insertItem', pathPrefix: 'sections.footer' }] });
    const footerInsert: Op = {
      op: 'insertItem',
      path: 'sections.footer.items',
      index: 0,
      value: { type: 'text' },
    };
    const bodyInsert: Op = {
      op: 'insertItem',
      path: 'sections.body.items',
      index: 0,
      value: { type: 'text' },
    };
    expect(stepDone(inFooter, { kind: 'ops', ops: [footerInsert] })).toBe(true);
    expect(stepDone(inFooter, { kind: 'ops', ops: [bodyInsert] })).toBe(false);
  });

  it('does not match a ROOT-addressed op against a path-prefixed predicate', () => {
    const prefixed = step('s', {
      ops: [{ op: 'setScalar', keys: ['page'], pathPrefix: 'sections' }],
    });
    const rootOp: Op = { op: 'setScalar', keys: ['page', 'margin'], value: 24 };
    expect(stepDone(prefixed, { kind: 'ops', ops: [rootOp] })).toBe(false);
  });

  it('matches a root-addressed op when the predicate names no path', () => {
    const margin = step('s', { ops: [{ op: 'setScalar', keys: ['page', 'margin'] }] });
    const rootOp: Op = { op: 'setScalar', keys: ['page', 'margin'], value: 24 };
    expect(stepDone(margin, { kind: 'ops', ops: [rootOp] })).toBe(true);
  });

  it('rejects a keyed predicate against a sequence op, which carries no keys', () => {
    const keyed = step('s', { ops: [{ op: 'moveItem', keys: ['box'] }] });
    const move: Op = { op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 };
    expect(stepDone(keyed, { kind: 'ops', ops: [move] })).toBe(false);
  });

  it('accepts ANY of several predicates (the drag-to-bind pair)', () => {
    const either = step('s', {
      ops: [
        { op: 'insertItem', pathPrefix: 'sections.body.items' },
        { op: 'setScalar', keys: ['data', 'key'] },
      ],
    });
    const bind: Op = {
      op: 'setScalar',
      path: 'sections.body.items[0]',
      keys: ['data', 'key'],
      value: 'customer',
    };
    expect(stepDone(either, { kind: 'ops', ops: [bind] })).toBe(true);
  });

  it('ignores a non-op event', () => {
    expect(stepDone(target, { kind: 'selection', path: 'sections.body.items[0]' })).toBe(false);
  });
});

describe('stepDone — the other kinds', () => {
  it('completes a selection step on a matching path, not a sibling', () => {
    const target = step('s', { selection: { pathPrefix: 'sections.footer' } });
    expect(stepDone(target, { kind: 'selection', path: 'sections.footer' })).toBe(true);
    expect(stepDone(target, { kind: 'selection', path: 'sections.footer.items[0]' })).toBe(true);
    expect(stepDone(target, { kind: 'selection', path: 'sections.body' })).toBe(false);
  });

  it('does not complete a selection step on a cleared selection', () => {
    const target = step('s', { selection: { pathPrefix: 'sections.footer' } });
    expect(stepDone(target, { kind: 'selection', path: null })).toBe(false);
  });

  it('completes a ui step on its own event only', () => {
    const target = step('s', { ui: 'dialog:container' });
    expect(stepDone(target, { kind: 'ui', id: 'dialog:container' })).toBe(true);
    expect(stepDone(target, { kind: 'ui', id: 'dialog:field' })).toBe(false);
  });

  it('completes a page-count step once the minimum is reached', () => {
    const target = step('s', { pageCount: { min: 2 } });
    expect(stepDone(target, { kind: 'pageCount', count: 2 })).toBe(true);
    expect(stepDone(target, { kind: 'pageCount', count: 3 })).toBe(true);
    expect(stepDone(target, { kind: 'pageCount', count: 1 })).toBe(false);
  });

  it('never completes an auto step from an event — only the Next button does', () => {
    const target = step('s', { auto: true });
    expect(stepDone(target, { kind: 'ops', ops: [setText] })).toBe(false);
    expect(stepDone(target, { kind: 'ui', id: 'export:done' })).toBe(false);
  });
});

describe('progress', () => {
  it('lists every step of the course in order', () => {
    expect(courseSteps(COURSE).map((s) => s.id)).toEqual(['a.1', 'a.2', 'b.1']);
  });

  it('resumes at the first incomplete step', () => {
    expect(resumeAt(COURSE, EMPTY_PROGRESS)).toEqual({ chapter: 0, step: 0 });
    expect(resumeAt(COURSE, { completed: ['a.1'], dismissed: false })).toEqual({
      chapter: 0,
      step: 1,
    });
    expect(resumeAt(COURSE, { completed: ['a.1', 'a.2'], dismissed: false })).toEqual({
      chapter: 1,
      step: 0,
    });
  });

  it('resumes at the first GAP, not after the newest completion', () => {
    // A reader who jumped ahead still gets sent back to what they skipped.
    expect(resumeAt(COURSE, { completed: ['b.1'], dismissed: false })).toEqual({
      chapter: 0,
      step: 0,
    });
  });

  it('has no resume target once the course is finished', () => {
    expect(resumeAt(COURSE, { completed: ['a.1', 'a.2', 'b.1'], dismissed: false })).toBeNull();
  });

  it('counts a chapter’s finished steps', () => {
    const progress = { completed: ['a.1'], dismissed: false };
    expect(chapterProgress(COURSE, progress, 0)).toEqual({ done: 1, total: 2 });
    expect(chapterProgress(COURSE, progress, 1)).toEqual({ done: 0, total: 1 });
  });

  it('records a completion once', () => {
    const once = markComplete(EMPTY_PROGRESS, 'a.1');
    expect(once.completed).toEqual(['a.1']);
    expect(markComplete(once, 'a.1')).toBe(once);
    expect(markComplete(once, 'a.2').completed).toEqual(['a.1', 'a.2']);
  });
});

describe('readProgress — persisted state is user-writable', () => {
  it('round-trips what it wrote', () => {
    const written = JSON.stringify({ completed: ['a.1'], dismissed: true });
    expect(readProgress(written, [COURSE])).toEqual({ completed: ['a.1'], dismissed: true });
  });

  it('accepts an already-parsed object', () => {
    expect(readProgress({ completed: ['b.1'], dismissed: false }, [COURSE])).toEqual({
      completed: ['b.1'],
      dismissed: false,
    });
  });

  it('starts fresh on absent, malformed, or non-object stored values', () => {
    expect(readProgress(null, [COURSE])).toEqual(EMPTY_PROGRESS);
    expect(readProgress('not json', [COURSE])).toEqual(EMPTY_PROGRESS);
    expect(readProgress('42', [COURSE])).toEqual(EMPTY_PROGRESS);
    expect(readProgress(undefined, [COURSE])).toEqual(EMPTY_PROGRESS);
  });

  it('refuses an oversized payload without parsing it', () => {
    const huge = `{"completed":["${'a'.repeat(MAX_PROGRESS_BYTES)}"]}`;
    expect(readProgress(huge, [COURSE])).toEqual(EMPTY_PROGRESS);
  });

  it('drops step ids the course does not define, including prototype names', () => {
    // A LITERAL JSON string: an object literal with `__proto__` would set the
    // prototype instead of carrying the key.
    const hostile =
      '{"completed":["__proto__","constructor","toString","a.1","nope"],"dismissed":1}';
    const progress = readProgress(hostile, [COURSE]);
    expect(progress.completed).toEqual(['a.1']);
    // A truthy non-`true` dismissed value is not a dismissal.
    expect(progress.dismissed).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops non-string entries and a non-array completed list', () => {
    expect(readProgress('{"completed":[1,null,"a.1"]}', [COURSE]).completed).toEqual(['a.1']);
    expect(readProgress('{"completed":"a.1"}', [COURSE]).completed).toEqual([]);
  });

  it('keeps ids from ANY unit in the set, so a topic id survives a course reload', () => {
    const topic: TutorialCourse = {
      id: 'topic',
      chapters: [{ id: 'topic', seed: 's', steps: [step('topic.1', { auto: true })] }],
    };
    const stored = '{"completed":["a.1","topic.1","stranger.1"]}';
    // Both units present → both ids kept, the stranger dropped.
    expect(readProgress(stored, [COURSE, topic]).completed).toEqual(['a.1', 'topic.1']);
    // The course alone does not know the topic id, so it is filtered out.
    expect(readProgress(stored, [COURSE]).completed).toEqual(['a.1']);
  });
});

describe('allStepIds', () => {
  it('is the flat union of every unit’s step ids', () => {
    const topic: TutorialCourse = {
      id: 'topic',
      chapters: [{ id: 'topic', seed: 's', steps: [step('topic.1', { auto: true })] }],
    };
    expect(allStepIds([COURSE, topic])).toEqual(['a.1', 'a.2', 'b.1', 'topic.1']);
  });
});

describe('isUiEvent', () => {
  it('admits the closed set and nothing else', () => {
    expect(isUiEvent('dialog:container')).toBe(true);
    expect(isUiEvent('export:done')).toBe(true);
    expect(isUiEvent('dialog:whatever')).toBe(false);
    expect(isUiEvent('constructor')).toBe(false);
  });
});
