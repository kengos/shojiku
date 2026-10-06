// @vitest-environment node
//
// The drift guard for the child-layout controls' copies of the engine wire: the
// alignment and distribution vocabularies the panel offers, and the grid track
// cap a switch to a grid clamps to. Each is DERIVED from the Rust rather than
// restated — the same shape as `linkWire.test.ts` and `noBoxWire.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLEX_ITEM_TYPES, UNMEASURED_TYPES } from './flexParticipants';
import { MAX_GRID_TRACKS } from './layoutModel';
import { ALIGN_VALUES, JUSTIFY_VALUES } from './layoutOps';

const ENGINE = new URL('../../../../engine/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

/** The snake_case wire spellings of a `rename_all = "snake_case"` enum's
 * variants, read from its body (doc comments and attributes skipped). */
function wireVariants(source: string, name: string): string[] {
  const body = new RegExp(`pub enum ${name} \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z]\w*,$/.test(line))
    .map((line) => snake(line.slice(0, -1)));
}

/** CamelCase variant → its snake_case wire name (`QrCode` → `qr_code`). */
function snake(name: string): string {
  return name.replace(/[A-Z]/g, (c, i: number) =>
    i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`,
  );
}

describe('the flex participants the panel mirrors', () => {
  it('treats exactly the FlexKind item types as laid out by flex', () => {
    const source = read('layout/src/engine/flex/kind.rs');
    const types = [...source.matchAll(/Item::(\w+)\(\w+\) if no_xy/g)].map((m) => snake(m[1]));
    expect(types).toContain('text');
    expect(new Set(types)).toEqual(FLEX_ITEM_TYPES);
  });

  it('treats exactly the kinds max_content_width cannot measure as unmeasured', () => {
    const source = read('layout/src/engine/intrinsic.rs');
    // The `=> None` arm: `FlexKind::Rect(_) | FlexKind::Ellipse(_) | … => None`.
    const arm = /((?:\|?\s*FlexKind::\w+\(_\)\s*)+)=> None/.exec(source)?.[1] ?? '';
    const types = [...arm.matchAll(/FlexKind::(\w+)\(_\)/g)].map((m) => snake(m[1]));
    expect(types).toContain('table');
    expect(new Set(types)).toEqual(UNMEASURED_TYPES);
  });
});

describe('the layout wire the panel mirrors', () => {
  const flex = read('core/src/geometry/flex.rs');

  it('offers exactly the engine alignItems values', () => {
    const variants = wireVariants(flex, 'AlignItems');
    // Positive control: the extraction found the enum, so the set comparison
    // below cannot pass vacuously.
    expect(variants).toContain('stretch');
    expect(new Set(variants)).toEqual(new Set(ALIGN_VALUES));
  });

  it('offers exactly the engine justifyContent values, in the engine order', () => {
    const variants = wireVariants(flex, 'JustifyContent');
    expect(variants).toContain('space_between');
    expect(variants).toEqual([...JUSTIFY_VALUES]);
  });

  it('clamps a switch to a grid at the engine track cap', () => {
    const match = /pub const MAX_GRID_TRACKS: usize = (\d+);/.exec(
      read('core/src/geometry/grid.rs'),
    );
    expect(match, 'MAX_GRID_TRACKS moved in grid.rs').not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_GRID_TRACKS);
  });
});
