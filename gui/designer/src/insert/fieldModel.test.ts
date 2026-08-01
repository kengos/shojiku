import { describe, expect, it } from 'vitest';
import {
  confirmField,
  fieldSchema,
  initialFieldSample,
  MAX_FIELD_NAME_CHARS,
  MAX_FIELD_SAMPLE_CHARS,
  validateFieldForm,
} from './fieldModel';

describe('initialFieldSample', () => {
  it('seeds a typed value per kind', () => {
    expect(initialFieldSample('text', '2026-07-20')).toBe('');
    expect(initialFieldSample('number', '2026-07-20')).toBe(0);
    expect(initialFieldSample('currency', '2026-07-20')).toBe(0);
    expect(initialFieldSample('boolean', '2026-07-20')).toBe(false);
    expect(initialFieldSample('date', '2026-07-20')).toBe('2026-07-20');
  });
});

describe('fieldSchema', () => {
  it('maps each kind to a scalar schema carrying the sample as example', () => {
    expect(fieldSchema('text', 'hi')).toEqual({ type: 'string', example: 'hi' });
    expect(fieldSchema('number', 42)).toEqual({ type: 'number', example: 42 });
    expect(fieldSchema('currency', 300000)).toEqual({
      type: 'number',
      format: 'currency',
      example: 300000,
    });
    expect(fieldSchema('date', '2026-07-20')).toEqual({
      type: 'string',
      format: 'date',
      example: '2026-07-20',
    });
    expect(fieldSchema('boolean', true)).toEqual({ type: 'boolean', example: true });
  });

  it('clips an over-cap string sample before it reaches the schema', () => {
    const long = 'x'.repeat(MAX_FIELD_SAMPLE_CHARS + 50);
    const schema = fieldSchema('text', long);
    expect(schema.example).toBe('x'.repeat(MAX_FIELD_SAMPLE_CHARS));
  });

  it('leaves a number sample untouched by the string clip', () => {
    expect(fieldSchema('number', 123456789).example).toBe(123456789);
  });
});

describe('validateFieldForm', () => {
  it('accepts a non-empty name', () => {
    expect(validateFieldForm('amount')).toBeNull();
  });

  it('refuses an empty or whitespace-only name', () => {
    expect(validateFieldForm('')).toBe('empty_name');
    expect(validateFieldForm('   ')).toBe('empty_name');
  });

  it('refuses a name over the cap (trimmed length)', () => {
    expect(validateFieldForm('a'.repeat(MAX_FIELD_NAME_CHARS))).toBeNull();
    expect(validateFieldForm('a'.repeat(MAX_FIELD_NAME_CHARS + 1))).toBe('name_too_long');
    // Surrounding whitespace does not count toward the cap.
    expect(validateFieldForm(`  ${'a'.repeat(MAX_FIELD_NAME_CHARS)}  `)).toBeNull();
  });
});

describe('confirmField', () => {
  it('returns a trimmed, clipped choice when valid', () => {
    const outcome = confirmField('  amount  ', 'number', 300);
    expect(outcome).toEqual({ ok: true, choice: { name: 'amount', kind: 'number', sample: 300 } });
  });

  it('carries the currency kind through to the choice unchanged', () => {
    const outcome = confirmField(' total ', 'currency', 300000);
    expect(outcome).toEqual({
      ok: true,
      choice: { name: 'total', kind: 'currency', sample: 300000 },
    });
  });

  it('clips an over-cap sample in the choice', () => {
    const outcome = confirmField('note', 'text', 'y'.repeat(MAX_FIELD_SAMPLE_CHARS + 10));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.choice.sample).toBe('y'.repeat(MAX_FIELD_SAMPLE_CHARS));
    }
  });

  it('propagates a name refusal', () => {
    expect(confirmField('', 'text', '')).toEqual({ ok: false, refusal: 'empty_name' });
    expect(confirmField('a'.repeat(MAX_FIELD_NAME_CHARS + 1), 'text', '')).toEqual({
      ok: false,
      refusal: 'name_too_long',
    });
  });

  it('keeps a hostile field name as an inert own string (no prototype walk)', () => {
    const outcome = confirmField('__proto__', 'text', 'x');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.choice.name).toBe('__proto__');
    }
  });
});
