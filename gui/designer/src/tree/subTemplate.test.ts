import { describe, expect, it } from 'vitest';
import { insideSubTemplate, isOrInsideSubTemplate } from './subTemplate';

// Every shape the wire can produce around the three `ContainerItem` slots,
// plus the near-misses that must NOT match. `inside` / `atOrInside` are what
// the two predicates are asserted to answer for each.
const paths: readonly { path: string; inside: boolean; atOrInside: boolean }[] = [
  { path: 'sections.body.items[0]', inside: false, atOrInside: false },
  { path: 'sections.body.items[0].items[1]', inside: false, atOrInside: false },
  { path: 'sections.footer.items[0]', inside: false, atOrInside: false },
  { path: 'sections.body.items', inside: false, atOrInside: false },
  { path: 'sections.body.items[0].items', inside: false, atOrInside: false },
  // The slot itself: the frame, not a node inside it.
  { path: 'sections.body.items[0].cell', inside: false, atOrInside: true },
  { path: 'sections.body.items[3].item', inside: false, atOrInside: true },
  // Inside one.
  { path: 'sections.body.items[0].cell.items[0]', inside: true, atOrInside: true },
  { path: 'sections.body.items[3].item.items[2]', inside: true, atOrInside: true },
  // A table column's own node repeats too. `columns[` matches a PREFIX, so it
  // needs no trailing separator — which is why this slot's FRAME
  // (`…columns[1].cell`) answers yes to BOTH questions where the other two
  // slots' frames answer only the widened one.
  { path: 'sections.body.items[0].columns[1]', inside: true, atOrInside: true },
  { path: 'sections.body.items[0].columns[1].cell', inside: true, atOrInside: true },
  { path: 'sections.body.items[0].columns[1].cell.items[0]', inside: true, atOrInside: true },
  // Nesting: a cell inside a cell is still inside one.
  { path: 'sections.body.items[0].cell.items[0].cell', inside: true, atOrInside: true },
  // Near-misses: the segment has to BE `cell`/`item`, not start with it, and
  // `.items` is an ordinary sequence key.
  { path: 'sections.body.items[0].celled.x', inside: false, atOrInside: false },
  { path: 'sections.body.items[0].itemX.y', inside: false, atOrInside: false },
  { path: 'sections.body.items[0].cellar', inside: false, atOrInside: false },
  { path: '', inside: false, atOrInside: false },
];

describe('subTemplate', () => {
  it('answers the child question over every path shape', () => {
    for (const { path, inside } of paths) {
      expect(insideSubTemplate(path), path || '(empty)').toBe(inside);
    }
  });

  it('answers the owner question, which adds the slot itself', () => {
    for (const { path, atOrInside } of paths) {
      expect(isOrInsideSubTemplate(path), path || '(empty)').toBe(atOrInside);
    }
  });

  it('is the pair `manipulate` used to carry, which is why that pair is gone', () => {
    // `canvas/manipulate` asked the child question and then a second one of its
    // own, `/\.(?:cell|item)$/`, returning the same answer for both. This pins
    // the equivalence that let the second one be deleted: the widened question
    // IS the union, so nothing classifies differently than it did.
    const frameEnd = /\.(?:cell|item)$/;
    for (const { path } of paths) {
      expect(isOrInsideSubTemplate(path), path || '(empty)').toBe(
        insideSubTemplate(path) || frameEnd.test(path),
      );
    }
  });

  it('answers a long adversarial path without matching any of it', () => {
    // Linearity is STRUCTURAL — three literal alternatives, no quantifiers, no
    // groups — so there is no wall-clock claim to make here and none is made.
    // What this pins is the answer: the repeated unit contains no `cell`,
    // `item` or `columns[`, so the scan runs the whole string, and the suffix
    // is a near-miss that must not match at the end either. The length is well
    // past anything a document can reach (the engine caps container nesting at
    // 32 and the tree walk is budgeted) — that is the point of the case.
    const hostile = `${'sections.body.items[0].'.repeat(2000)}cel`;
    expect(insideSubTemplate(hostile)).toBe(false);
    expect(isOrInsideSubTemplate(hostile)).toBe(false);
  });
});
