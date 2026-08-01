import { MAX_BATCH_OPS } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { StyleRef, StyleUsage } from '../styles/usage';
import { createStyleWithFieldsOps } from './styleFieldOps';
import { deleteStyleOps, renameStyleOps } from './styleRefOps';

/** Build a StyleUsage from a name → refs map (refs default to addressable). */
function usageOf(entries: Record<string, StyleRef[]> = {}, truncated = false): StyleUsage {
  return { refs: new Map(Object.entries(entries)), truncated };
}

function ref(
  path: string,
  names: string[],
  key: StyleRef['key'] = 'styleNames',
  addressable = true,
): StyleRef {
  return { path, key, names, addressable };
}

describe('renameStyleOps', () => {
  it('renames the registry key AND rewrites every reference in one batch', () => {
    const usage = usageOf({
      old: [
        ref('sections.body.items[0]', ['old']),
        ref('sections.body.items[1]', ['old', 'other']),
        ref('sections.body.items[2].row', ['old'], 'alternateStyleNames'),
      ],
    });
    const plan = renameStyleOps('old', 'fresh', ['old', 'other'], usage);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[0]).toEqual({ op: 'renameKey', keys: ['styles', 'old'], to: 'fresh' });
    expect(plan.ops[1]).toEqual({
      op: 'setStrings',
      path: 'sections.body.items[0]',
      keys: ['styleNames'],
      values: ['fresh'],
    });
    // Occurrence replacement preserves the sibling name and its order.
    expect(plan.ops[2]).toMatchObject({ values: ['fresh', 'other'] });
    // The row's alternate slot is targeted via its OWN wire key.
    expect(plan.ops[3]).toEqual({
      op: 'setStrings',
      path: 'sections.body.items[2].row',
      keys: ['alternateStyleNames'],
      values: ['fresh'],
    });
  });

  it('dedupes when the new name already sits in the same reference list', () => {
    const usage = usageOf({ old: [ref('sections.body.items[0]', ['old', 'fresh'])] });
    const plan = renameStyleOps('old', 'fresh', ['old', 'fresh'], usage);
    // 'fresh' collides in the registry → refused before any rewrite.
    expect(plan).toEqual({ ok: false, reason: 'duplicate_name' });
    // With a non-colliding target the dedupe applies to the reference list.
    const ok = renameStyleOps('old', 'merged', ['old', 'fresh'], usage);
    expect(ok.ok && ok.ops[1]).toMatchObject({ values: ['merged', 'fresh'] });
    const collide = usageOf({ old: [ref('sections.body.items[0]', ['old', 'keep'])] });
    const merged = renameStyleOps('old', 'keep', ['old'], collide);
    expect(merged.ok && merged.ops[1]).toMatchObject({ values: ['keep'] });
  });

  it('renames an unused style with no reference rewrites', () => {
    const plan = renameStyleOps('lonely', 'renamed', ['lonely'], usageOf());
    expect(plan).toEqual({
      ok: true,
      ops: [{ op: 'renameKey', keys: ['styles', 'lonely'], to: 'renamed' }],
    });
  });

  it('refuses an empty target and a duplicate (incl. renaming to itself)', () => {
    expect(renameStyleOps('a', '', ['a'], usageOf())).toEqual({ ok: false, reason: 'empty_name' });
    expect(renameStyleOps('a', 'b', ['a', 'b'], usageOf())).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    expect(renameStyleOps('a', 'a', ['a'], usageOf())).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
  });

  it('refuses a truncated usage walk (half-rename hazard)', () => {
    const usage = usageOf({ a: [ref('sections.body.items[0]', ['a'])] }, true);
    expect(renameStyleOps('a', 'b', ['a'], usage)).toEqual({
      ok: false,
      reason: 'truncated_usage',
    });
  });

  it('refuses a non-addressable reference path (whole operation, no partial)', () => {
    const usage = usageOf({
      a: [ref('sections.body.items[0].ev.il', ['a'], 'styleNames', false)],
    });
    expect(renameStyleOps('a', 'b', ['a'], usage)).toEqual({
      ok: false,
      reason: 'unaddressable_ref',
    });
  });
});

describe('deleteStyleOps', () => {
  it('removes the registry entry and strips the name from every reference', () => {
    const usage = usageOf({
      gone: [
        ref('sections.body.items[0]', ['gone']),
        ref('sections.body.items[1]', ['gone', 'keep']),
        ref('sections.body.items[2].row', ['gone'], 'alternateStyleNames'),
      ],
    });
    const plan = deleteStyleOps('gone', usage);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[0]).toEqual({ op: 'removeKey', keys: ['styles', 'gone'] });
    // A reference emptied of names removes the whole key.
    expect(plan.ops[1]).toEqual({
      op: 'removeKey',
      path: 'sections.body.items[0]',
      keys: ['styleNames'],
    });
    // A reference keeping other names is restated without the deleted one.
    expect(plan.ops[2]).toEqual({
      op: 'setStrings',
      path: 'sections.body.items[1]',
      keys: ['styleNames'],
      values: ['keep'],
    });
    expect(plan.ops[3]).toEqual({
      op: 'removeKey',
      path: 'sections.body.items[2].row',
      keys: ['alternateStyleNames'],
    });
  });

  it('deletes an unused style with just the registry removal', () => {
    expect(deleteStyleOps('lonely', usageOf())).toEqual({
      ok: true,
      ops: [{ op: 'removeKey', keys: ['styles', 'lonely'] }],
    });
  });

  it('refuses a truncated usage walk and a non-addressable reference', () => {
    expect(deleteStyleOps('a', usageOf({}, true))).toEqual({
      ok: false,
      reason: 'truncated_usage',
    });
    const usage = usageOf({ a: [ref('sections.body.x', ['a'], 'styleNames', false)] });
    expect(deleteStyleOps('a', usage)).toEqual({ ok: false, reason: 'unaddressable_ref' });
  });
});

describe('batch cap boundary (MAX_BATCH_OPS)', () => {
  const refsFor = (count: number) =>
    Array.from({ length: count }, (_, i) => ref(`sections.body.items[${i}]`, ['x']));

  it('renames at exactly the cap and refuses one past it', () => {
    // registry op + N refs = N+1 ops; cap-1 refs → exactly cap ops (ok).
    const atCap = usageOf({ x: refsFor(MAX_BATCH_OPS - 1) });
    expect(renameStyleOps('x', 'y', ['x'], atCap).ok).toBe(true);
    const overCap = usageOf({ x: refsFor(MAX_BATCH_OPS) });
    expect(renameStyleOps('x', 'y', ['x'], overCap)).toEqual({
      ok: false,
      reason: 'batch_too_large',
    });
  });

  it('deletes at exactly the cap and refuses one past it', () => {
    expect(deleteStyleOps('x', usageOf({ x: refsFor(MAX_BATCH_OPS - 1) })).ok).toBe(true);
    expect(deleteStyleOps('x', usageOf({ x: refsFor(MAX_BATCH_OPS) }))).toEqual({
      ok: false,
      reason: 'batch_too_large',
    });
  });
});

describe('hostile style names (prototype safety)', () => {
  it('creates / renames / deletes a __proto__ style without polluting prototypes', () => {
    const created = createStyleWithFieldsOps('__proto__', { fontSize: '12' }, []);
    expect(created).toEqual({
      ok: true,
      ops: [
        { op: 'putValue', keys: ['styles', '__proto__'], value: {} },
        { op: 'setScalar', keys: ['styles', '__proto__', 'fontSize'], value: 12 },
      ],
    });
    const usage = usageOf({ __proto__: [ref('sections.body.items[0]', ['__proto__'])] });
    expect(renameStyleOps('__proto__', 'safe', ['__proto__'], usage).ok).toBe(true);
    expect(deleteStyleOps('__proto__', usage).ok).toBe(true);
    // The registry name reached the ops as a literal keys segment, and no
    // Map/array operation touched the prototype chain.
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
