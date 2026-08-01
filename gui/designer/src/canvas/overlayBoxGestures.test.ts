import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import {
  applyBoxKeyPlan,
  type BoxKeyDocumentPlan,
  boxDragTask,
  boxKeyPlan,
} from './overlayBoxGestures';
import type { CanvasManipulate } from './overlayDragModel';

const docRead =
  (entries: Record<string, unknown>): ReadFn =>
  (path) =>
    entries[path];

// A flow body — its children reorder rather than move.
const FLOW_DOC: Record<string, unknown> = {
  'sections.body': { type: 'flow', items: [{}, {}, {}] },
  'sections.body.items[0]': { type: 'text', text: 'a' },
  'sections.body.items[1]': { type: 'text', text: 'b' },
  'sections.body.items[2]': { type: 'text', text: 'c' },
};

// An absolute body — its children move (and nudge) freely.
const ABS_DOC: Record<string, unknown> = {
  'sections.body': { type: 'absolute' },
  'sections.body.items[0]': { type: 'rect', box: { x: 0, y: 0, w: 100, h: 30 } },
};

function wiring(doc: Record<string, unknown>, grid = 0): CanvasManipulate {
  return {
    read: docRead(doc),
    onReorder: vi.fn(),
    onApply: vi.fn(),
    onRefused: vi.fn(),
    grid,
  };
}

describe('boxKeyPlan', () => {
  it('does not claim a key it has no vocabulary for', () => {
    const ctx = { path: 'sections.body.items[0]', selected: true, manipulate: wiring(ABS_DOC) };
    expect(boxKeyPlan('a', false, ctx)).toBeNull();
    expect(boxKeyPlan('Tab', false, ctx)).toBeNull();
  });

  it('does not claim arrow keys when direct manipulation is off', () => {
    const ctx = { path: 'sections.body.items[0]', selected: false, manipulate: undefined };
    expect(boxKeyPlan('ArrowDown', false, ctx)).toBeNull();
    expect(boxKeyPlan('ArrowDown', true, ctx)).toBeNull();
  });

  it('selects on Space, and on Enter when the box is not the selection', () => {
    const ctx = { path: 'sections.body.items[0]', selected: false, manipulate: undefined };
    expect(boxKeyPlan(' ', false, ctx)).toEqual({ kind: 'select' });
    expect(boxKeyPlan('Enter', false, ctx)).toEqual({ kind: 'select' });
    expect(boxKeyPlan(' ', false, { ...ctx, selected: true })).toEqual({ kind: 'select' });
  });

  it('requests editing on Enter over the already-selected box', () => {
    expect(
      boxKeyPlan('Enter', false, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: undefined,
      }),
    ).toEqual({ kind: 'edit' });
  });

  it('reorders a flow child with Alt+arrows, in both directions', () => {
    const ctx = { path: 'sections.body.items[1]', selected: true, manipulate: wiring(FLOW_DOC) };
    expect(boxKeyPlan('ArrowDown', true, ctx)).toEqual({
      kind: 'reorder',
      op: { op: 'moveItem', path: 'sections.body.items', from: 1, to: 2 },
    });
    expect(boxKeyPlan('ArrowRight', true, ctx)).toEqual({
      kind: 'reorder',
      op: { op: 'moveItem', path: 'sections.body.items', from: 1, to: 2 },
    });
    expect(boxKeyPlan('ArrowUp', true, ctx)).toEqual({
      kind: 'reorder',
      op: { op: 'moveItem', path: 'sections.body.items', from: 1, to: 0 },
    });
    expect(boxKeyPlan('ArrowLeft', true, ctx)).toEqual({
      kind: 'reorder',
      op: { op: 'moveItem', path: 'sections.body.items', from: 1, to: 0 },
    });
  });

  it('consumes Alt+Up on the FIRST child instead of emitting a negative move', () => {
    expect(
      boxKeyPlan('ArrowUp', true, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: wiring(FLOW_DOC),
      }),
    ).toEqual({ kind: 'consume' });
  });

  it('nudges a movable box by the grid step, 1pt when the grid is off', () => {
    const ctx = { path: 'sections.body.items[0]', selected: true, manipulate: wiring(ABS_DOC, 4) };
    expect(boxKeyPlan('ArrowRight', false, ctx)).toEqual({
      kind: 'apply',
      ops: [{ op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 4 }],
    });
    expect(boxKeyPlan('ArrowDown', false, { ...ctx, manipulate: wiring(ABS_DOC, 0) })).toEqual({
      kind: 'apply',
      ops: [{ op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'y'], value: 1 }],
    });
  });

  it('consumes a nudge that rounds back to the authored spelling', () => {
    // 0.01pt on a mm-authored axis rounds back to the same authored value (mm
    // keeps one decimal) and the cross axis moves by zero — every axis op
    // degenerates, so the batch is empty and nothing may dispatch.
    const mmDoc: Record<string, unknown> = {
      'sections.body': { type: 'absolute' },
      'sections.body.items[0]': { type: 'rect', box: { x: '10mm', y: 0, w: 100, h: 30 } },
    };
    expect(
      boxKeyPlan('ArrowRight', false, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: wiring(mmDoc, 0.01),
      }),
    ).toEqual({ kind: 'consume' });
  });

  it('consumes a nudge whose step is not finite instead of dispatching garbage', () => {
    // `grid` is a plain number on the wiring contract, so a host that never
    // ran it through `normalizeGridStep` can hand the overlay a non-finite
    // step; the whole delta is then unusable and no op may reach the document.
    expect(
      boxKeyPlan('ArrowRight', false, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: wiring(ABS_DOC, Number.POSITIVE_INFINITY),
      }),
    ).toEqual({ kind: 'consume' });
  });

  it('claims neither modifier on the ability that does not match it', () => {
    // Alt on a movable box, and a plain arrow on a reorderable one, are both
    // "not ours" — the event must reach the browser untouched.
    expect(
      boxKeyPlan('ArrowDown', true, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: wiring(ABS_DOC),
      }),
    ).toBeNull();
    expect(
      boxKeyPlan('ArrowDown', false, {
        path: 'sections.body.items[0]',
        selected: true,
        manipulate: wiring(FLOW_DOC),
      }),
    ).toBeNull();
  });

  it('classifies a hostile document as fixed rather than throwing', () => {
    const throwing: CanvasManipulate = {
      ...wiring(ABS_DOC),
      read: () => {
        throw new Error('hostile');
      },
    };
    const ctx = { path: 'sections.body.items[0]', selected: true, manipulate: throwing };
    expect(boxKeyPlan('ArrowDown', false, ctx)).toBeNull();
    expect(boxKeyPlan('ArrowDown', true, ctx)).toBeNull();
    // A garbage node (a non-record) is the same story.
    const garbage = wiring({ 'sections.body': 7, 'sections.body.items[0]': 'nope' });
    expect(boxKeyPlan('ArrowUp', false, { ...ctx, manipulate: garbage })).toBeNull();
  });
});

describe('applyBoxKeyPlan', () => {
  it('dispatches a reorder plan and an apply plan to their own handlers', () => {
    const manipulate = wiring(FLOW_DOC);
    const op = { op: 'moveItem', path: 'sections.body.items', from: 1, to: 2 } as const;
    applyBoxKeyPlan({ kind: 'reorder', op }, 'sections.body.items[1]', manipulate);
    expect(manipulate.onReorder).toHaveBeenCalledWith(op);
    expect(manipulate.onApply).not.toHaveBeenCalled();

    const ops = [
      { op: 'setScalar', path: 'sections.body.items[0]', keys: ['box', 'x'], value: 4 },
    ] as const;
    applyBoxKeyPlan({ kind: 'apply', ops }, 'sections.body.items[0]', manipulate);
    expect(manipulate.onApply).toHaveBeenCalledWith('sections.body.items[0]', ops);
  });

  it('does nothing without wiring — the guard the rect cannot reach', () => {
    const plan: BoxKeyDocumentPlan = {
      kind: 'reorder',
      op: { op: 'moveItem', path: 'sections.body.items', from: 0, to: 1 },
    };
    expect(() => applyBoxKeyPlan(plan, 'sections.body.items[0]', undefined)).not.toThrow();
  });
});

describe('boxDragTask', () => {
  it('arms a move drag on a movable box, carrying the press point', () => {
    expect(boxDragTask(docRead(ABS_DOC), 'sections.body.items[0]', 12, 34)).toEqual({
      mode: 'move',
      path: 'sections.body.items[0]',
      startX: 12,
      startY: 34,
    });
  });

  it('arms a reorder drag on a flow child', () => {
    expect(boxDragTask(docRead(FLOW_DOC), 'sections.body.items[1]', 12, 34)).toEqual({
      mode: 'reorder',
      path: 'sections.body.items[1]',
    });
  });

  it('arms a TYPED refusal on anything else, so the release can say why', () => {
    expect(boxDragTask(docRead(FLOW_DOC), 'sections.body', 12, 34)).toEqual({
      mode: 'refused',
      reason: 'section',
    });
  });
});
