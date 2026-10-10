// @vitest-environment node
//
// What a split carries over, pinned to the ENGINE's per-span style list. The
// inherited set is every key a span honours minus the ones the flow surface
// edits itself; a key added to `Style` and left honoured by spans would
// otherwise be dropped from every split half without anyone deciding so.
//
// Read from the Rust rather than restated: the `Style` struct's fields (wire
// names are their camelCase) and the `ignored_span_keys` list in
// `engine/core/src/style/inert.rs`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMBINE_KEY, INHERITED_STYLE_KEYS, MARK_KEYS } from './spanWire';

const rust = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../engine/core/src/${path}`, import.meta.url)), {
    encoding: 'utf8',
  });

const camel = (snake: string) => snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The `Style` struct's wire names, in declaration order. */
function styleKeys(): readonly string[] {
  const source = rust('style.rs');
  const start = source.indexOf('pub struct Style {');
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^ {4}pub (\w+):/gm)].map((m) => camel(m[1] ?? ''));
}

/** The names `ignored_span_keys` reports — the keys a span does NOT honour. */
function ignoredSpanKeys(): readonly string[] {
  const source = rust('style/inert.rs');
  const start = source.indexOf('pub fn ignored_span_keys');
  const body = source.slice(start, source.indexOf('\n    }', start));
  return [...body.matchAll(/\.is_some\(\), "(\w+)"\)/g)].map((m) => m[1] ?? '');
}

describe('the keys a split carries over', () => {
  const fields = styleKeys();
  const ignored = ignoredSpanKeys();
  const honoured = fields.filter((key) => !ignored.includes(key));

  it('reads the Rust it is pinned to (positive controls)', () => {
    // Without these, a parse that matched nothing would compare two empty
    // sets and pass.
    expect(fields).toHaveLength(24);
    expect(fields).toContain('fontSize');
    expect(ignored).toHaveLength(16);
    expect(ignored).toContain('lineHeight');
    expect(ignored.every((key) => fields.includes(key))).toBe(true);
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
