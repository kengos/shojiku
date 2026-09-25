// @vitest-environment node
//
// The drift guard for `NO_BOX_WIRE_TYPES`: it must be exactly the `Item`
// variants whose struct omits `box_`, DERIVED from the engine source rather
// than restated here. A literal-vs-literal assertion would have let the engine
// grow a sixteenth boxless variant — or give `repeat` a box — with this gate
// still green, and a set that drifts from the wire is precisely how the defect
// this guard exists for (a placement tab authoring a parse-error key) comes
// back. Same shape as `borderTypes.test.ts`, which pins the border keywords to
// `style/border.rs`.
import { describe, expect, it } from 'vitest';
import { itemVariants, structBody, templateSources } from '../testkit/engineWire';
import { NO_BOX_WIRE_TYPES, REQUIRED_BOX_WIRE_TYPES } from './itemView';

/** Whether the struct named `name` declares a `box` field. */
function declaresBox(name: string, sources: readonly string[]): boolean {
  return /\bbox_\s*:/.test(structBody(name, sources));
}

/** The serde attribute directly above the struct's `box_` field. */
function boxAttribute(name: string, sources: readonly string[]): string {
  const found = /(#\[serde\([^\]]*\)\])\s*pub box_\s*:/.exec(structBody(name, sources));
  if (found === null) {
    throw new Error(`\`${name}\`'s box_ field carries no serde attribute`);
  }
  return found[1];
}

describe('NO_BOX_WIRE_TYPES stays pinned to the engine wire', () => {
  it('is exactly the `Item` variants whose struct omits `box_`', () => {
    const variants = itemVariants();
    // A regex that silently stopped matching would compare against an empty
    // list and pass; pin the population first (the border guard's control).
    expect(variants.length).toBe(15);

    const sources = templateSources();
    // The other control: at least one variant must come back WITH a box, or
    // `declaresBox` returning false for everything would look like agreement.
    const boxed = variants.filter((v) => declaresBox(v.rust, sources));
    expect(boxed.length).toBeGreaterThan(0);

    const boxless = variants.filter((v) => !declaresBox(v.rust, sources)).map((v) => v.wire);
    expect([...NO_BOX_WIRE_TYPES].sort()).toEqual([...boxless].sort());
  });

  it('REQUIRED_BOX_WIRE_TYPES is exactly the boxed variants whose `box` has no serde default', () => {
    const sources = templateSources();
    const boxed = itemVariants().filter((v) => declaresBox(v.rust, sources));
    const required = boxed.filter((v) => !/\bdefault\b/.test(boxAttribute(v.rust, sources)));
    // Controls: some boxed variant must read as defaulted, or a regex that
    // stopped matching `default` would call every box required.
    expect(boxed.length).toBeGreaterThan(required.length);
    expect([...REQUIRED_BOX_WIRE_TYPES].sort()).toEqual(required.map((v) => v.wire).sort());
  });
});
