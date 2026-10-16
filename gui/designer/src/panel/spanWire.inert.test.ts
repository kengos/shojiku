// @vitest-environment node
//
// What a split carries over, pinned to the ENGINE's per-span facts. The
// inherited set is every key a span honours minus the ones the flow surface
// edits itself; a key added to `Style` and left honoured by spans would
// otherwise be dropped from every split half without anyone deciding so.
//
// Read from the key catalog rather than restated: the `Span` shape's
// `x-shojiku-style-keys` (the keys a span paints with, in `Style` field order)
// and the `Style` shape's properties, in the committed
// `engine/authoring/reference/catalog.schema.json` the engine generates from
// its fact tables.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMBINE_KEY, INHERITED_STYLE_KEYS, MARK_KEYS } from './spanWire';

interface Shape {
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly 'x-shojiku-style-keys'?: readonly string[];
}

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../engine/authoring/reference/catalog.schema.json', import.meta.url),
    ),
    { encoding: 'utf8' },
  ),
) as { readonly $defs: Readonly<Record<string, Shape>> };

describe('the keys a split carries over', () => {
  const fields = Object.keys(catalog.$defs.Style?.properties ?? {});
  const honoured = catalog.$defs.Span?.['x-shojiku-style-keys'] ?? [];
  const ignored = fields.filter((key) => !honoured.includes(key));

  it('reads the catalog it is pinned to (positive controls)', () => {
    // Without these, a parse that matched nothing would compare two empty
    // sets and pass.
    expect(fields).toHaveLength(24);
    expect(fields).toContain('fontSize');
    expect(ignored).toHaveLength(16);
    expect(ignored).toContain('lineHeight');
    expect(honoured.every((key) => fields.includes(key))).toBe(true);
    expect(honoured).toEqual([
      'fontSize',
      'fontFamily',
      'color',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'textDecoration',
      'textCombineUpright',
    ]);
  });

  it('is every honoured key the flow surface does not edit', () => {
    const edited: readonly string[] = [...MARK_KEYS, COMBINE_KEY];
    expect([...INHERITED_STYLE_KEYS].sort()).toEqual(
      honoured.filter((key) => !edited.includes(key)).sort(),
    );
  });
});
