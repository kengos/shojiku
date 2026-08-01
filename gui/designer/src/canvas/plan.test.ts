import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID_STEP, GRID_STEPS, normalizeGridStep } from './plan';

describe('normalizeGridStep', () => {
  it('passes the offered steps and off through', () => {
    expect(normalizeGridStep(0)).toBe(0);
    for (const step of GRID_STEPS) {
      expect(normalizeGridStep(step)).toBe(step);
    }
  });

  it('degrades anything else to the default', () => {
    expect(normalizeGridStep(3)).toBe(DEFAULT_GRID_STEP);
    expect(normalizeGridStep(-4)).toBe(DEFAULT_GRID_STEP);
    expect(normalizeGridStep(999)).toBe(DEFAULT_GRID_STEP);
    expect(normalizeGridStep(Number.NaN)).toBe(DEFAULT_GRID_STEP);
    expect(normalizeGridStep('4')).toBe(DEFAULT_GRID_STEP);
    expect(normalizeGridStep(undefined)).toBe(DEFAULT_GRID_STEP);
  });
});
