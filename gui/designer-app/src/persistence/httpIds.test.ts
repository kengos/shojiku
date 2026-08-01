// Tests for httpIds.ts — the seam's id vocabulary: the charset/length guard
// checked BEFORE any URL composition, and the `<projectId>/<templateId>`
// doc key.
import { describe, expect, it } from 'vitest';
import { docKey, isSafeId, splitKey } from './httpIds';

describe('isSafeId', () => {
  it('accepts single safe path segments and rejects everything else', () => {
    expect(isSafeId('invoices')).toBe(true);
    expect(isSafeId('ja-JP')).toBe(true);
    expect(isSafeId('a/b')).toBe(false);
    expect(isSafeId('..')).toBe(false);
    expect(isSafeId('%2e%2e')).toBe(false);
    expect(isSafeId('')).toBe(false);
    expect(isSafeId(7)).toBe(false);
    expect(isSafeId('x'.repeat(65))).toBe(false);
  });
});

describe('docKey / splitKey', () => {
  it('round-trips a project/template pair', () => {
    expect(splitKey(docKey('invoices', 'receipt'))).toEqual({
      projectId: 'invoices',
      templateId: 'receipt',
    });
  });
});
