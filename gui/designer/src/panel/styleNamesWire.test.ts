// @vitest-environment node
//
// The drift guard for `STYLE_NAMES_WIRE_TYPES`: exactly the `Item` variants
// whose struct declares a `styleNames` field, DERIVED from the engine source.
// The named-style picker is gated on this set, and a set wider than the wire
// is the defect it exists for: one tick on a `line` wrote a key `LineItem`
// denies, and the whole document stopped parsing. Same shape as
// `noBoxWire.test.ts`.
import { describe, expect, it } from 'vitest';
import { itemVariants, structBody, templateSources } from '../testkit/engineWire';
import { STYLE_NAMES_WIRE_TYPES } from './itemView';

/** Whether the struct declares the `style_names` field. Keyed on the FIELD,
 * not on its attribute: `styleNames` is reached through an explicit `rename`
 * on most structs and through `rename_all = "camelCase"` on others (`Span`). */
function declaresStyleNames(name: string, sources: readonly string[]): boolean {
  return /\bpub style_names\s*:/.test(structBody(name, sources));
}

describe('STYLE_NAMES_WIRE_TYPES stays pinned to the engine wire', () => {
  it('is exactly the `Item` variants whose struct declares `styleNames`', () => {
    const variants = itemVariants();
    expect(variants.length).toBe(15);
    const sources = templateSources();
    const named = variants.filter((v) => declaresStyleNames(v.rust, sources)).map((v) => v.wire);
    // Controls both ways: a known carrier reads as one, and `line` — the
    // variant the defect was on — reads as none.
    expect(named).toContain('text');
    expect(named).not.toContain('line');
    expect([...STYLE_NAMES_WIRE_TYPES].sort()).toEqual([...named].sort());
  });
});
