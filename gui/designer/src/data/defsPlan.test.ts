import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { applyDefinitionOps, readDefinitionField } from './definitionsEdit';
import { addFieldPlan, MAX_DEFS_EDITS, sanitizeDefsEdits } from './defsPlan';

// A schema exercising every field shape: a top-level scalar (ungrouped), a
// nested object leaf, and an array-group row field.
const DEFS = `type: object
properties:
  total:
    type: number
    format: currency
    title: 合計
    description: 税込の総額
  customer:
    type: object
    properties:
      name:
        type: string
        title: 宛名
  items:
    type: array
    title: 明細
    items:
      type: object
      properties:
        qty:
          type: number
`;

describe('addFieldPlan', () => {
  it('plans a fresh top-level field as a putValue op', () => {
    const plan = addFieldPlan(DEFS, 'memo', 'string');
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    expect(plan.op).toEqual({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string' },
    });
    // Applying it authors a real field.
    expect(
      readDefinitionField(applyDefinitionOps(DEFS, [plan.op]), ['properties', 'memo']).type,
    ).toBe('string');
  });

  it('refuses an empty name', () => {
    expect(addFieldPlan(DEFS, '   ', 'string')).toEqual({ ok: false, reason: 'empty_name' });
  });

  it('refuses an over-long name', () => {
    expect(addFieldPlan(DEFS, 'x'.repeat(200), 'string')).toEqual({
      ok: false,
      reason: 'name_too_long',
    });
  });

  it('refuses an existing key (own-property guard)', () => {
    expect(addFieldPlan(DEFS, 'total', 'string')).toEqual({ ok: false, reason: 'key_exists' });
  });

  it('treats a hostile prototype name as a fresh key, quoted inertly', () => {
    const plan = addFieldPlan(DEFS, '__proto__', 'number');
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    const text = applyDefinitionOps(DEFS, [plan.op]);
    expect(text).toContain('__proto__');
    expect(readDefinitionField(text, ['properties', '__proto__']).type).toBe('number');
  });

  it('allows the key on malformed definitions (the base guards on apply)', () => {
    const plan = addFieldPlan(': : bad', 'memo', 'string');
    expect(plan.ok).toBe(true);
  });
});

describe('sanitizeDefsEdits', () => {
  const op: Op = { op: 'setScalar', keys: ['properties', 'total', 'title'], value: 'x' };

  it('keeps op-shaped records', () => {
    expect(sanitizeDefsEdits([op])).toEqual([op]);
  });

  it('degrades every non-array shape to no edits', () => {
    expect(sanitizeDefsEdits(null)).toEqual([]);
    expect(sanitizeDefsEdits(undefined)).toEqual([]);
    expect(sanitizeDefsEdits('[]')).toEqual([]);
    expect(sanitizeDefsEdits({ 0: op, length: 1 })).toEqual([]);
  });

  it('drops entries that are not records carrying a string op', () => {
    expect(sanitizeDefsEdits([op, 'setScalar', null, 42, [op], { keys: [] }, { op: 7 }])).toEqual([
      op,
    ]);
  });

  it('caps the restored list, dropping the tail', () => {
    const many = Array.from({ length: MAX_DEFS_EDITS + 10 }, () => op);
    expect(sanitizeDefsEdits(many)).toHaveLength(MAX_DEFS_EDITS);
  });

  it('leaves a hostile prototype key inert own data on the parsed value', () => {
    const raw: unknown = JSON.parse('[{"op":"setScalar","__proto__":{"polluted":1}}]');
    expect(sanitizeDefsEdits(raw)).toHaveLength(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
