// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BORDER_STYLE_VALUES, BORDERABLE_TYPES } from './borderTypes';

describe('BORDER_STYLE_VALUES stays pinned to the engine wire', () => {
  it('matches the BorderStyleKind spellings the engine deserializes', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../../engine/core/src/style/border.rs', import.meta.url)),
      'utf8',
    );
    const wire = [...src.matchAll(/"([a-z]+)" => Some\(BorderStyleKind::/g)].map((m) => m[1]);
    // A regex that silently stops matching would compare against an empty
    // list and pass nothing — pin the count against the wire's own enum.
    const variants = [...src.matchAll(/^\s{4}(Solid|Double|Dashed|Dotted),$/gm)].length;
    expect(wire).toHaveLength(variants);
    expect([...BORDER_STYLE_VALUES].sort()).toEqual([...new Set(wire)].sort());
  });

  it('exposes every boxed item type the engine draws a border for', () => {
    for (const type of ['text', 'rect', 'container', 'table', 'image', 'qr_code']) {
      expect(BORDERABLE_TYPES.has(type)).toBe(true);
    }
    expect(BORDERABLE_TYPES.has('line')).toBe(false);
  });
});
