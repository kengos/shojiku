// @vitest-environment node
//
// The drift guard for the id walk's HOLDER set (`walk.ts`): every `Item`
// variant, a table `Column` and the `ContainerItem` frame must carry an
// optional string `id`, and the population of item types the panel suite
// walks (`ItemPanel.test.tsx` § the name field) is this same derived list —
// so a sixteenth type, or one that loses its `id`, reddens here rather than
// shipping a name field that authors a key the engine rejects.
import { describe, expect, it } from 'vitest';
import { itemVariants, structBody, templateSources } from '../testkit/engineWire';
import { WIRE_ITEM_TYPES } from '../testkit/itemTypes';

const CARRIES_ID = /#\[serde\([^\]]*\)\]\s*pub id: Option<String>,/;

describe('the id holders stay pinned to the engine wire', () => {
  it('every Item variant, Column and ContainerItem carries an optional string id', () => {
    const sources = templateSources();
    const variants = itemVariants();
    // The population control: a regex that stopped matching would pass below.
    // It is also the list the jsdom panel suite walks (`testkit/itemTypes`).
    expect(variants.map((v) => v.wire)).toEqual(WIRE_ITEM_TYPES);
    for (const { rust } of [...variants, { rust: 'Column' }, { rust: 'ContainerItem' }]) {
      expect(structBody(rust, sources), rust).toMatch(CARRIES_ID);
    }
  });

  it('the two reference spellings are the ellipse anchor and a line endpoint item', () => {
    const sources = templateSources();
    expect(structBody('EllipseItem', sources)).toMatch(/pub anchor: Option<String>,/);
    // `AnchorPoint` lives under geometry/, outside the template modules.
    expect(structBody('LineItem', sources)).toMatch(/pub from: PointSpec,/);
    expect(structBody('LineItem', sources)).toMatch(/pub to: PointSpec,/);
  });
});
