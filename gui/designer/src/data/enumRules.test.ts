// The engine mirrors behind the choices notices: the `(type, format)` field-type
// table, the labels-ignored predicate (unknown formats keep labels; the labeled
// FORM counts even with an empty label) and the type-mismatch flag — each
// pinned to the engine source it stands in for.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EnumRow } from './enumModel';
import { engineFieldType, labelsIgnored, memberMismatch } from './enumRules';

const LABELED: EnumRow[] = [{ value: 'a', label: 'A', labeled: true }];
const EMPTY_LABEL: EnumRow[] = [{ value: 'a', label: '', labeled: true }];
const BARE: EnumRow[] = [{ value: 'a', label: '', labeled: false }];

describe('engineFieldType', () => {
  it.each([
    ['string', '', 'string'],
    ['string', 'person-name', 'string'],
    ['string', 'date', 'date'],
    ['string', 'date-time', 'date-time'],
    ['string', 'image', 'image'],
    ['string', 'currency', 'string'],
    ['number', '', 'number'],
    ['number', 'currency', 'currency'],
    ['integer', 'percentage', 'percentage'],
    ['integer', 'quantity', 'quantity'],
    ['number', 'date', 'number'],
    ['boolean', '', 'boolean'],
    ['array', 'date', 'string'],
    ['object', '', 'string'],
  ])('(%s, %s) maps to %s', (type, format, mapped) => {
    expect(engineFieldType(type, format)).toBe(mapped);
  });
});

describe('labelsIgnored', () => {
  it('is false for plain text, including a string with an unknown format', () => {
    expect(labelsIgnored('string', '', LABELED)).toBe(false);
    expect(labelsIgnored('string', 'person-name', LABELED)).toBe(false);
  });

  it('is true for every field that does not print as plain text', () => {
    for (const [type, format] of [
      ['string', 'date'],
      ['string', 'date-time'],
      ['string', 'image'],
      ['number', ''],
      ['integer', 'currency'],
      ['boolean', ''],
    ]) {
      expect(labelsIgnored(type, format, LABELED)).toBe(true);
    }
  });

  it('counts the labeled form with an empty label, and never a bare-only list', () => {
    expect(labelsIgnored('number', '', EMPTY_LABEL)).toBe(true);
    expect(labelsIgnored('number', '', BARE)).toBe(false);
  });
});

describe('memberMismatch', () => {
  it('flags a member whose value is not of the field type', () => {
    expect(memberMismatch('string', 1)).toBe(true);
    expect(memberMismatch('string', '1')).toBe(false);
    expect(memberMismatch('number', '1')).toBe(true);
    expect(memberMismatch('number', 1.5)).toBe(false);
    expect(memberMismatch('integer', 1.5)).toBe(true);
    expect(memberMismatch('integer', 2)).toBe(false);
    expect(memberMismatch('integer', 'x')).toBe(true);
    expect(memberMismatch('boolean', 'true')).toBe(true);
    expect(memberMismatch('boolean', false)).toBe(false);
  });
});

describe('the engine sources these mirror', () => {
  const read = (file: string) =>
    readFileSync(resolve(process.cwd(), `../../engine/core/src/${file}`), 'utf8');

  it('still warns on labels exactly when the mapped type is not text', () => {
    const source = read('validate/schema.rs');
    expect(source).toContain('.any(|entry| entry.label().is_some());');
    expect(source).toContain('if labeled && field_type != FieldType::String {');
  });

  it('still maps (type, format) the way engineFieldType does', () => {
    const source = read('definitions/schema.rs');
    for (const arm of [
      'SchemaType::Number | SchemaType::Integer => FieldType::Number,',
      'SchemaType::Boolean => FieldType::Boolean,',
      '_ => FieldType::String,',
      '(SchemaType::String, "date-time") => Some(FieldType::Datetime),',
      '(SchemaType::String, "date") => Some(FieldType::Date),',
      '(SchemaType::String, "image") => Some(FieldType::Image),',
      '(SchemaType::Number | SchemaType::Integer, "currency") => Some(FieldType::Currency),',
      '(SchemaType::Number | SchemaType::Integer, "percentage") => Some(FieldType::Percentage),',
      '(SchemaType::Number | SchemaType::Integer, "quantity") => Some(FieldType::Quantity),',
    ]) {
      expect(source).toContain(arm);
    }
    // The population too: a NEW refining arm (or known format) must fail here,
    // or the notice would silently miss it.
    expect(source.split('=> Some(FieldType::').length - 1).toBe(6);
    expect(source).toContain(
      '"date-time" | "date" | "image" | "currency" | "percentage" | "quantity"',
    );
  });
});
