// Tests for edgeRules.ts — where a margin's `auto` does something, and which
// sides a table in the flow body honours.

import { describe, expect, it } from 'vitest';
import { autoSides, edgeRules, FRAME_PADDING_RULES, horizontalOnly } from './edgeRules';
import type { Placement } from './placementModel';

const at = (kind: Placement['kind'], pinned = false): Placement => ({
  kind,
  pinned,
  ignoredY: false,
});

describe('autoSides', () => {
  it('offers left/right in the flow body and every side to an auto container child', () => {
    expect([...autoSides(at('flow'))]).toEqual(['left', 'right']);
    expect([...autoSides(at('pinnable'))]).toEqual(['top', 'right', 'bottom', 'left']);
  });

  it('offers none where the owner does not distribute space', () => {
    for (const placement of [at('pinnable', true), at('coordinate'), at('plain')]) {
      expect(autoSides(placement).size).toBe(0);
    }
  });
});

describe('edgeRules', () => {
  it('never lets a padding go negative or take auto', () => {
    const rules = edgeRules('padding', 'text', at('flow'));
    expect(rules.negative).toBe(false);
    expect(rules.auto.size).toBe(0);
    expect(rules.sides).toEqual(['top', 'right', 'bottom', 'left']);
  });

  it('lets a margin go negative, with the placement deciding auto', () => {
    const rules = edgeRules('margin', 'text', at('pinnable'));
    expect(rules.negative).toBe(true);
    expect(rules.auto.size).toBe(4);
  });

  it('narrows a flow-body table to its left and right sides, for both keys', () => {
    expect(horizontalOnly('table', at('flow'))).toBe(true);
    expect(horizontalOnly('table', at('pinnable'))).toBe(false);
    expect(horizontalOnly('text', at('flow'))).toBe(false);
    expect(edgeRules('padding', 'table', at('flow')).sides).toEqual(['left', 'right']);
    expect(edgeRules('margin', 'table', at('flow')).sides).toEqual(['left', 'right']);
    expect(edgeRules('margin', 'table', at('coordinate')).sides).toHaveLength(4);
  });

  it('gives a sub-template frame an ordinary all-sides padding', () => {
    expect(FRAME_PADDING_RULES).toEqual({
      negative: false,
      auto: new Set(),
      sides: ['top', 'right', 'bottom', 'left'],
    });
  });
});
