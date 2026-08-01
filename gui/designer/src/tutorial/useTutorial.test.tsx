import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TutorialCourse, TutorialEvent, TutorialStore } from './types';
import { type TutorialController, type TutorialHost, useTutorial } from './useTutorial';

const COURSE: TutorialCourse = {
  id: 'test',
  chapters: [
    {
      id: 'ch0',
      seed: 'seed-0',
      steps: [
        {
          id: 'ch0.a',
          anchor: { kind: 'panel', selector: 'panel' },
          done: { ops: [{ op: 'setScalar', keys: ['text'] }] },
        },
        {
          id: 'ch0.b',
          anchor: { kind: 'canvas', selector: 'sections.body' },
          done: { auto: true },
        },
      ],
    },
    {
      id: 'ch1',
      seed: 'seed-1',
      steps: [{ id: 'ch1.a', anchor: { kind: 'panel', selector: 'panel' }, done: { auto: true } }],
    },
  ],
};

// A topic short: a single-chapter unit with its OWN practice document and its
// own sample data, and one step that reuses a course sentence via copyId.
const TOPIC: TutorialCourse = {
  id: 'topic-x',
  params: '{"topic":true}',
  chapters: [
    {
      id: 'topic-x',
      seed: 'topic-seed',
      steps: [
        {
          id: 'topic-x.a',
          copyId: 'ch0.a',
          anchor: { kind: 'panel', selector: 'panel' },
          done: { ops: [{ op: 'setScalar', keys: ['text'] }] },
        },
        {
          id: 'topic-x.b',
          anchor: { kind: 'canvas', selector: 'sections.body' },
          done: { auto: true },
        },
      ],
    },
  ],
};

const TOPICS = [TOPIC];

function makeHost(text = 'user-doc', params = '{"a":1}') {
  const state = { text, params };
  const host: TutorialHost = {
    currentText: () => state.text,
    currentParams: () => state.params,
    setText: (next) => {
      state.text = next;
    },
    setParams: (next) => {
      state.params = next;
    },
  };
  return { host, state };
}

/** Mount the hook and expose its latest value. */
function mount(host: TutorialHost, store?: TutorialStore) {
  const ref: { current: TutorialController | null } = { current: null };
  function Probe() {
    ref.current = useTutorial(COURSE, TOPICS, host, store);
    return null;
  }
  render(<Probe />);
  const get = () => {
    const value = ref.current;
    if (value === null) {
      throw new Error('controller not mounted');
    }
    return value;
  };
  return { get, run: (fn: (c: TutorialController) => void) => act(() => fn(get())) };
}

describe('starting and leaving', () => {
  it('swaps in the practice document and puts the reader’s own back on exit', () => {
    const { host, state } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    expect(state.text).toBe('seed-0');
    expect(state.params).toContain('customer');
    expect(get().session).toEqual({ unit: COURSE, chapter: 0, step: 0 });

    run((c) => c.stop());
    expect(state.text).toBe('user-doc');
    expect(state.params).toBe('{"a":1}');
    expect(get().session).toBeNull();
  });

  it('restores the document the reader had, not the one a later chapter seeded', () => {
    const { host, state } = makeHost();
    const { run } = mount(host);
    run((c) => c.start(COURSE, 0));
    run((c) => c.start(COURSE, 1));
    expect(state.text).toBe('seed-1');
    run((c) => c.stop());
    expect(state.text).toBe('user-doc');
  });

  it('gives the document back even when a step throws mid-session', () => {
    const { host, state } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    expect(state.text).toBe('seed-0');
    // The reader's document is the asset being protected: leaving restores it
    // from a ref, so it does not depend on a render (or a handler) having
    // completed. Simulate a failure by throwing out of a step's own work and
    // then leaving, as the Designer's error path would.
    expect(() => {
      run(() => {
        throw new Error('a step blew up');
      });
    }).toThrow('a step blew up');
    run((c) => c.stop());
    expect(state.text).toBe('user-doc');
    expect(state.params).toBe('{"a":1}');
    expect(get().session).toBeNull();
  });

  it('is safe to stop when nothing is running', () => {
    const { host, state } = makeHost();
    const { run } = mount(host);
    run((c) => c.stop());
    expect(state.text).toBe('user-doc');
  });

  it('seeds a chapter entered directly, and resumes mid-chapter where progress says', () => {
    const store: TutorialStore = {
      load: () => JSON.stringify({ completed: ['ch0.a'], dismissed: false }),
      save: vi.fn(),
    };
    const { host } = makeHost();
    const { get, run } = mount(host, store);
    run((c) => c.start(COURSE, 0));
    expect(get().session).toEqual({ unit: COURSE, chapter: 0, step: 1 });
  });

  it('starts a chapter at its first step when progress points elsewhere', () => {
    const store: TutorialStore = { load: () => null, save: vi.fn() };
    const { host } = makeHost();
    const { get, run } = mount(host, store);
    run((c) => c.start(COURSE, 1));
    expect(get().session).toEqual({ unit: COURSE, chapter: 1, step: 0 });
  });
});

describe('advancing', () => {
  it('advances on a matching op and ignores one that does not match', () => {
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    const wrong: TutorialEvent = {
      kind: 'ops',
      ops: [{ op: 'setScalar', path: 'p', keys: ['style', 'fontSize'], value: 10 }],
    };
    run((c) => c.observe(wrong));
    expect(get().session).toEqual({ unit: COURSE, chapter: 0, step: 0 });

    const right: TutorialEvent = {
      kind: 'ops',
      ops: [{ op: 'setScalar', path: 'p', keys: ['text'], value: 'hi' }],
    };
    run((c) => c.observe(right));
    expect(get().session).toEqual({ unit: COURSE, chapter: 0, step: 1 });
    expect(get().progress.completed).toEqual(['ch0.a']);
  });

  it('ignores events while no session runs', () => {
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.observe({ kind: 'ui', id: 'export:done' }));
    expect(get().progress.completed).toEqual([]);
  });

  it('runs on into the next chapter, keeping the reader’s work', () => {
    const { host, state } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    run((c) =>
      c.observe({ kind: 'ops', ops: [{ op: 'setScalar', path: 'p', keys: ['text'], value: 'x' }] }),
    );
    run((c) => c.next());
    expect(get().session).toEqual({ unit: COURSE, chapter: 1, step: 0 });
    // Crossing a chapter boundary must NOT re-seed over what the reader built.
    expect(state.text).toBe('seed-0');
  });

  it('finishes the course by restoring the reader’s document', () => {
    const { host, state } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 1));
    run((c) => c.next());
    expect(get().session).toBeNull();
    expect(state.text).toBe('user-doc');
    expect(get().progress.completed).toEqual(['ch1.a']);
  });

  it('does nothing when Next is pressed outside a session', () => {
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.next());
    expect(get().progress.completed).toEqual([]);
  });
});

describe('progress persistence', () => {
  it('writes each completion through the store', () => {
    const save = vi.fn();
    const { host } = makeHost();
    const { run } = mount(host, { load: () => null, save });
    run((c) => c.start(COURSE, 1));
    run((c) => c.next());
    expect(save).toHaveBeenCalledWith({ completed: ['ch1.a'], dismissed: false });
  });

  it('re-reads the store on reload, so another tab’s progress is seen', () => {
    let stored = '{"completed":[],"dismissed":false}';
    const { host } = makeHost();
    const { get, run } = mount(host, { load: () => stored, save: vi.fn() });
    expect(get().progress.completed).toEqual([]);
    stored = '{"completed":["ch0.a"],"dismissed":true}';
    run((c) => c.reload());
    expect(get().progress).toEqual({ completed: ['ch0.a'], dismissed: true });
  });

  it('keeps progress in memory when no store is wired', () => {
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 1));
    run((c) => c.next());
    expect(get().progress.completed).toEqual(['ch1.a']);
    run((c) => c.reload());
    expect(get().progress.completed).toEqual(['ch1.a']);
  });

  it('clears progress on restart, and records a dismissed suggestion', () => {
    const save = vi.fn();
    const { host } = makeHost();
    const { get, run } = mount(host, { load: () => null, save });
    run((c) => c.start(COURSE, 1));
    run((c) => c.next());
    run((c) => c.restart());
    expect(get().progress.completed).toEqual([]);
    run((c) => c.dismissHint());
    expect(get().progress.dismissed).toBe(true);
    expect(save).toHaveBeenLastCalledWith({ completed: [], dismissed: true });
  });
});

describe('the anchor rect', () => {
  it('resolves a chrome anchor that is on screen', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'panel');
    el.getBoundingClientRect = () => ({ left: 5, top: 6, width: 7, height: 8 }) as DOMRect;
    document.body.append(el);
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    expect(get().rect).toEqual({ left: 5, top: 6, width: 7, height: 8 });
    el.remove();
  });

  it('carries no rect for a canvas step (the page is not chrome)', () => {
    const { host } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(COURSE, 0));
    run((c) =>
      c.observe({ kind: 'ops', ops: [{ op: 'setScalar', path: 'p', keys: ['text'], value: 'x' }] }),
    );
    expect(get().session).toEqual({ unit: COURSE, chapter: 0, step: 1 });
    expect(get().rect).toBeNull();
  });
});

describe('topic shorts', () => {
  it('seeds a topic’s OWN document and sample data, and restores on finish', () => {
    const { host, state } = makeHost();
    const { get, run } = mount(host);
    run((c) => c.start(TOPIC, 0));
    expect(state.text).toBe('topic-seed');
    // The topic carries its own params, not the course PRACTICE_PARAMS.
    expect(state.params).toBe('{"topic":true}');
    expect(get().session).toEqual({ unit: TOPIC, chapter: 0, step: 0 });

    run((c) =>
      c.observe({ kind: 'ops', ops: [{ op: 'setScalar', path: 'p', keys: ['text'], value: 'x' }] }),
    );
    expect(get().session).toEqual({ unit: TOPIC, chapter: 0, step: 1 });
    run((c) => c.next()); // the trailing auto step → finish
    expect(get().session).toBeNull();
    expect(state.text).toBe('user-doc');
    expect(get().progress.completed).toEqual(['topic-x.a', 'topic-x.b']);
  });

  it('resumes a topic at its own first gap, independent of the course', () => {
    const store: TutorialStore = {
      load: () => JSON.stringify({ completed: ['topic-x.a'], dismissed: false }),
      save: vi.fn(),
    };
    const { host } = makeHost();
    const { get, run } = mount(host, store);
    run((c) => c.start(TOPIC, 0));
    expect(get().session).toEqual({ unit: TOPIC, chapter: 0, step: 1 });
  });
});
