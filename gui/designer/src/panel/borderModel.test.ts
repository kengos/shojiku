// @vitest-environment node
import type { ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { hasAnyBorder, readBorder } from './borderModel';

const P = 'sections.body.items[0]';

/** A ReadFn over a fixed item + styles registry. */
function reader(item: unknown, styles: unknown = {}): ReadFn {
  return (path) => (path === P ? item : path === 'styles' ? styles : undefined);
}

describe('readBorder resolves the cascade-effective per-side state', () => {
  it('reads an item with no border as fully unset', () => {
    const v = readBorder(reader({ type: 'text' }), P);
    expect(v.width.effective).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(v.width.origin).toBe('unset');
    expect(hasAnyBorder(v)).toBe(false);
  });

  it('reads a scalar width as all four sides', () => {
    const v = readBorder(reader({ type: 'text', style: { borderWidth: 2 } }), P);
    expect(v.width.effective).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
    expect(v.width.origin).toBe('own');
    expect(hasAnyBorder(v)).toBe(true);
  });

  it('reads a per-side width map (missing sides = 0)', () => {
    const v = readBorder(
      reader({ type: 'text', style: { borderWidth: { top: 1, bottom: 3 } } }),
      P,
    );
    expect(v.width.effective).toEqual({ top: 1, right: 0, bottom: 3, left: 0 });
  });

  it('reads a mixed width/color/style border per side', () => {
    const v = readBorder(
      reader({
        type: 'text',
        style: {
          borderWidth: { top: 1, right: 2 },
          borderColor: { top: '#ff0000' },
          borderStyle: { top: 'double' },
        },
      }),
      P,
    );
    expect(v.width.effective).toEqual({ top: 1, right: 2, bottom: 0, left: 0 });
    expect(v.color.effective.top).toBe('#ff0000');
    expect(v.color.effective.right).toBe('');
    expect(v.style.effective.top).toBe('double');
  });

  it('reads a border from a named style (later-wins), with origin', () => {
    const v = readBorder(
      reader(
        { type: 'text', styleNames: ['a', 'framed'] },
        { a: { borderWidth: 5 }, framed: { borderWidth: 1 } },
      ),
      P,
    );
    expect(v.width.effective).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(v.width.origin).toBe('style');
    expect(v.width.styleName).toBe('framed');
  });

  it('lets an own scalar override a style MAP atomically (whole property)', () => {
    const v = readBorder(
      reader(
        { type: 'text', styleNames: ['framed'], style: { borderWidth: 1 } },
        { framed: { borderWidth: { top: 2, right: 2, bottom: 2, left: 2 } } },
      ),
      P,
    );
    // Own scalar wins entirely; the style map is the below-own cascade.
    expect(v.width.effective).toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(v.width.origin).toBe('own');
    expect(v.width.cascade).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
  });
});

describe('hostile / malformed values degrade safely', () => {
  it('a non-map, array, string, or deep-nested width reads as unset (no throw)', () => {
    for (const bad of [
      'url(x)',
      [1, 2],
      { top: 'x', right: [3] },
      // A deep-nested object side value: the parser reads exactly one level
      // (literal side keys), so nesting can never recurse — it reads as off.
      { top: { a: { b: { c: 1 } } } },
      null,
      true,
    ]) {
      const v = readBorder(reader({ type: 'text', style: { borderWidth: bad } }), P);
      expect(hasAnyBorder(v)).toBe(false);
    }
  });

  it('a negative or non-finite side width reads as off', () => {
    const v = readBorder(
      reader({
        type: 'text',
        style: { borderWidth: { top: -5, right: Number.POSITIVE_INFINITY, bottom: 2 } },
      }),
      P,
    );
    expect(v.width.effective).toEqual({ top: 0, right: 0, bottom: 2, left: 0 });
  });

  it('a read that throws resolves to unset, never a crash', () => {
    const throwing: ReadFn = () => {
      throw new Error('boom');
    };
    expect(hasAnyBorder(readBorder(throwing, P))).toBe(false);
  });

  it('ignores prototype keys in a border map and hostile style names', () => {
    const styleMap = JSON.parse('{"borderWidth":{"__proto__":5,"top":2}}');
    const item = { type: 'text', styleNames: ['constructor', '__proto__'], style: styleMap };
    const v = readBorder(reader(item, {}), P);
    // `__proto__` in the map is ignored (closed-side literal read); the hostile
    // style names resolve nothing (own-property-guarded registry lookup).
    expect(v.width.effective).toEqual({ top: 2, right: 0, bottom: 0, left: 0 });
    expect(v.width.origin).toBe('own');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
