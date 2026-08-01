import { describe, expect, it } from 'vitest';
import type { RenderOutcome } from '../engine/transport';
import { INITIAL_PREVIEW, previewReducer } from './reducer';

const outcome = (): RenderOutcome => ({
  ok: true,
  pages: [],
  inspect: null,
  diagnostics: { items: [] },
});

describe('previewReducer', () => {
  it('edit moves to rendering and bumps the revision', () => {
    const state = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    expect(state.status).toBe('rendering');
    expect(state.revision).toBe(1);
  });

  it('applies a result whose revision matches the latest edit, recording its scale', () => {
    const edited = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    const result = outcome();
    const state = previewReducer(edited, {
      type: 'result',
      revision: 1,
      outcome: result,
      scale: 4,
    });
    expect(state.status).toBe('ready');
    expect(state.rendered).toBe(1);
    expect(state.outcome).toBe(result);
    expect(state.renderedScale).toBe(4);
    expect(state.error).toBeNull();
  });

  it('drops a stale result from a superseded edit', () => {
    let state = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    state = previewReducer(state, { type: 'edit', revision: 2 });
    const applied = previewReducer(state, {
      type: 'result',
      revision: 1,
      outcome: outcome(),
      scale: 2,
    });
    expect(applied).toBe(state);
  });

  it('sets an error when the failed revision matches', () => {
    const edited = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    const state = previewReducer(edited, { type: 'failed', revision: 1, message: 'boom' });
    expect(state.status).toBe('error');
    expect(state.error).toBe('boom');
  });

  it('drops a stale failure from a superseded edit', () => {
    let state = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    state = previewReducer(state, { type: 'edit', revision: 2 });
    const applied = previewReducer(state, { type: 'failed', revision: 1, message: 'old' });
    expect(applied).toBe(state);
  });

  it('an ok result becomes the new last-good preview', () => {
    const edited = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    const result = outcome();
    const state = previewReducer(edited, {
      type: 'result',
      revision: 1,
      outcome: result,
      scale: 3,
    });
    expect(state.lastGood).toEqual({ pages: result.pages, inspect: result.inspect, scale: 3 });
    expect(state.renderedScale).toBe(3);
  });

  it('a not-ok result keeps the previous last-good pages and scale, refreshing the outcome', () => {
    let state = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    const good = outcome();
    state = previewReducer(state, { type: 'result', revision: 1, outcome: good, scale: 2 });
    state = previewReducer(state, { type: 'edit', revision: 2 });
    const bad: RenderOutcome = {
      ok: false,
      pages: [],
      inspect: null,
      diagnostics: { items: [] },
    };
    state = previewReducer(state, { type: 'result', revision: 2, outcome: bad, scale: 5 });
    expect(state.status).toBe('ready');
    expect(state.outcome).toBe(bad);
    expect(state.lastGood).toEqual({ pages: good.pages, inspect: good.inspect, scale: 2 });
    expect(state.renderedScale).toBe(2);
  });

  it('a not-ok FIRST result leaves last-good empty (nothing to retain)', () => {
    const edited = previewReducer(INITIAL_PREVIEW, { type: 'edit', revision: 1 });
    const bad: RenderOutcome = { ok: false, pages: [], inspect: null, diagnostics: { items: [] } };
    const state = previewReducer(edited, { type: 'result', revision: 1, outcome: bad, scale: 2 });
    expect(state.lastGood).toBeNull();
    expect(state.renderedScale).toBeNull();
    expect(state.outcome).toBe(bad);
  });
});
