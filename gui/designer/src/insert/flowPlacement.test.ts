// Tests for flowPlacement.ts — which kinds lay out only in the body's flow,
// which owner a resolved insert target is, whether it IS that flow, and which
// band it is directly. Every answer fails closed: a "cannot tell" is a
// container, never the flow and never a band.
import { describe, expect, it } from 'vitest';
import { insertTargetBand, insertTargetOwner, isFlowTarget, requiresFlow } from './flowPlacement';
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

describe('insertTargetOwner', () => {
  it('names the four owners receiverFor classifies', () => {
    const read = reader({
      'sections.body': { type: 'flow', items: [] },
      'sections.header': { items: [] },
      'sections.footer': { items: [] },
      'sections.body.items[0]': { type: 'container', items: [] },
      'sections.footer.items[0]': { type: 'container', box: { direction: 'row' }, items: [] },
    });
    expect(insertTargetOwner(read, 'sections.body.items')).toBe('flow');
    expect(insertTargetOwner(read, 'sections.header.items')).toBe('band');
    expect(insertTargetOwner(read, 'sections.footer.items')).toBe('band');
    expect(insertTargetOwner(read, 'sections.body.items[0].items')).toBe('container');
    // A row-direction container: the slot axis never leaks into the owner answer.
    expect(insertTargetOwner(read, 'sections.footer.items[0].items')).toBe('container');
    const absolute = reader({ 'sections.body': { type: 'absolute', items: [] } });
    expect(insertTargetOwner(absolute, 'sections.body.items')).toBe('absoluteBody');
  });

  it('reads a container INSIDE a band as a container, not as the band', () => {
    // The band-only kind must be DIRECTLY in the band: the engine skips a
    // page_number one level down (`page_number_in_container`).
    const read = reader({ 'sections.footer.items[0]': { type: 'container', items: [] } });
    expect(insertTargetOwner(read, 'sections.footer.items[0].items')).toBe('container');
  });

  it('names every repeating sub-template a cell, at any depth', () => {
    // The engine scopes a repeat cell, a repeat_flow card and a table column's
    // `cell:` to their bound element and never clears that scope on the way
    // into a nested container, so the list one container down is as much a
    // cell as the cell's own `items` — which is why this is decided from the
    // PATH and not from what the document says the direct owner is.
    const read = reader({
      'sections.body.items[0].cell': { items: [] },
      'sections.body.items[1].item': { items: [] },
      'sections.body.items[2].columns[0].cell': { items: [] },
      'sections.body.items[0].cell.items[0]': { type: 'container', items: [] },
    });
    expect(insertTargetOwner(read, 'sections.body.items[0].cell.items')).toBe('cell');
    expect(insertTargetOwner(read, 'sections.body.items[1].item.items')).toBe('cell');
    expect(insertTargetOwner(read, 'sections.body.items[2].columns[0].cell.items')).toBe('cell');
    expect(insertTargetOwner(read, 'sections.body.items[0].cell.items[0].items')).toBe('cell');
    // The sub-template MAP itself, which has no trailing `.items` for the
    // pattern's own separator to land on.
    expect(insertTargetOwner(read, 'sections.body.items[0].cell')).toBe('cell');
  });

  it('answers container for every target receiverFor cannot classify (fails closed)', () => {
    const read = reader({
      'sections.body.items[0]': { type: 'container', box: { type: 'grid' }, items: [] },
      'sections.body': { items: [] },
    });
    // A grid container and a typeless body. (A repeat cell and a repeat_flow
    // card used to land here too; they are their own answer now.)
    expect(insertTargetOwner(read, 'sections.body.items[0].items')).toBe('container');
    expect(insertTargetOwner(read, 'sections.body.items')).toBe('container');
    // A missing owner, and a path that is not an item list at all.
    expect(insertTargetOwner(reader({}), 'sections.header.items')).toBe('container');
    expect(insertTargetOwner(FLOW, 'sections.body')).toBe('container');
    // A plain `items` index is NOT a cell: `.items[` must not read as `.item.`.
    expect(insertTargetOwner(read, 'sections.body.items[0].items')).not.toBe('cell');
  });

  it('answers container when the read throws', () => {
    const read = () => {
      throw new Error('hostile subtree');
    };
    expect(insertTargetOwner(read, 'sections.body.items')).toBe('container');
  });
});

describe('insertTargetBand', () => {
  it('names the band a target is directly, and nothing for a container inside one', () => {
    const read = reader({
      'sections.body': { type: 'flow', items: [] },
      'sections.header': { items: [] },
      'sections.footer': { items: [] },
      'sections.footer.items[0]': { type: 'container', items: [] },
    });
    expect(insertTargetBand(read, 'sections.header.items')).toBe('header');
    expect(insertTargetBand(read, 'sections.footer.items')).toBe('footer');
    expect(insertTargetBand(read, 'sections.footer.items[0].items')).toBeNull();
    expect(insertTargetBand(read, 'sections.body.items')).toBeNull();
    // A cell target is not a band either — the new owner must not reach band
    // placement, which would write page-margin-box coordinates into a cell.
    expect(insertTargetBand(read, 'sections.body.items[0].cell.items')).toBeNull();
    const absolute = reader({ 'sections.body': { type: 'absolute', items: [] } });
    expect(insertTargetBand(absolute, 'sections.body.items')).toBeNull();
  });

  it('answers null when the read throws', () => {
    const read = () => {
      throw new Error('hostile subtree');
    };
    expect(insertTargetBand(read, 'sections.footer.items')).toBeNull();
  });
});

describe('isFlowTarget', () => {
  it('accepts the body item list of a flow body', () => {
    expect(isFlowTarget(FLOW, 'sections.body.items')).toBe(true);
  });

  it('refuses every other target path', () => {
    expect(isFlowTarget(FLOW, 'sections.header.items')).toBe(false);
    expect(isFlowTarget(FLOW, 'sections.body.items[0].items')).toBe(false);
    expect(isFlowTarget(FLOW, 'sections.body.items[0].cell.items')).toBe(false);
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
