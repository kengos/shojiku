// Tests for flowPlacement.ts — which kinds lay out only in the body's flow, and
// whether a resolved insert target IS that flow. The predicate is positive, so
// every "cannot tell" answer must come back FALSE.
import { describe, expect, it } from 'vitest';
import { isFlowTarget, requiresFlow } from './flowPlacement';
import { type InsertArming, type InsertKind, insertMenuGroups } from './insertMenu';

/** Everything armed, so the sweep below sees every element row that exists. */
const ALL_ARMED: InsertArming = {
  iterable: true,
  image: true,
  field: true,
  cutLine: true,
  line: true,
  ellipse: true,
  checkbox: true,
  pageBreak: true,
  charGrid: true,
};

/** A `read` over a fixed path→value map; an absent path reads as `undefined`. */
function reader(values: Record<string, unknown>) {
  return (path: string) => values[path];
}

const FLOW = reader({ 'sections.body': { type: 'flow', items: [] } });

describe('requiresFlow', () => {
  it('holds for the page break and for nothing else the menu offers', () => {
    // The population is DERIVED from the menu with everything armed, not
    // hand-listed: a `readonly InsertKind[]` annotation accepts a SUBSET of the
    // union quite happily, so a hand-list neither fails to compile nor notices
    // a kind added later — it just stops being exhaustive, silently. Taking the
    // rows themselves means a new element row joins this sweep on its own.
    const kinds = insertMenuGroups(ALL_ARMED)[0]
      .entries.filter((entry) => entry.kind === 'element')
      .map((entry) => (entry as { insert: InsertKind }).insert);
    expect(kinds.length).toBe(10);
    expect(kinds.filter(requiresFlow)).toEqual(['pageBreak']);
  });

  it('does NOT hold for the character grid', () => {
    // Stated on its own because it is the decision, not a side effect: the
    // engine places a `char_grid` everywhere, drawing one sheet outside a flow
    // body instead of skipping the item, so gating that row would withhold a
    // legal insert.
    expect(requiresFlow('charGrid')).toBe(false);
  });
});

describe('isFlowTarget', () => {
  it('accepts the body item list of a flow body', () => {
    expect(isFlowTarget(FLOW, 'sections.body.items')).toBe(true);
  });

  it('refuses every other target path', () => {
    expect(isFlowTarget(FLOW, 'sections.header.items')).toBe(false);
    expect(isFlowTarget(FLOW, 'sections.body.items[0].items')).toBe(false);
  });

  it('refuses an absolute body', () => {
    const read = reader({ 'sections.body': { type: 'absolute', items: [] } });
    expect(isFlowTarget(read, 'sections.body.items')).toBe(false);
  });

  it('refuses a body whose type is missing or unrecognized', () => {
    expect(isFlowTarget(reader({ 'sections.body': { items: [] } }), 'sections.body.items')).toBe(
      false,
    );
    expect(isFlowTarget(reader({ 'sections.body': { type: 'grid' } }), 'sections.body.items')).toBe(
      false,
    );
  });

  it('refuses hostile body shapes without throwing', () => {
    // A scalar, an array and a missing node are all "cannot tell", and the
    // predicate fails closed on each. `__proto__` as the type is inert: the
    // comparison is against the OWN property, never a walked one.
    for (const body of [undefined, null, 'flow', 42, [], { type: '__proto__' }]) {
      expect(isFlowTarget(reader({ 'sections.body': body }), 'sections.body.items')).toBe(false);
    }
  });

  it('refuses when the read throws', () => {
    const read = () => {
      throw new Error('hostile subtree');
    };
    expect(isFlowTarget(read, 'sections.body.items')).toBe(false);
  });
});
